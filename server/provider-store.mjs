// Backend-only PostgREST adapter. Token-bearing cache rows have no client grants.
export function createSupabaseProviderStore({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = globalThis.fetch } = {}) {
  if (!url || !key) return null;
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password || base.port) throw new Error('SUPABASE_BAD_URL');
  if (key.startsWith('sb_publishable_')) throw new Error('SUPABASE_SERVER_KEY_REQUIRED');
  const headers = { apikey: key, 'Content-Type': 'application/json',
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) };
  async function request(table, params, { method = 'GET', body, prefer } = {}) {
    const target = new URL(`/rest/v1/${table}`, base);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
    const response = await fetchImpl(target, { method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5_000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`SUPABASE_CACHE_HTTP_${response.status}`); }
    if (response.status === 204 || method !== 'GET') { await response.body?.cancel(); return null; }
    return response.json();
  }
  return {
    async remove(cacheKey) {
      await request('matv_provider_cache', { provider: 'eq.3isk', cache_key: `eq.${cacheKey}` }, { method: 'DELETE' });
    },
    async get(cacheKey, cutoff) {
      const rows = await request('matv_provider_cache', { provider: 'eq.3isk', cache_key: `eq.${cacheKey}`, expires_at: `gt.${new Date(cutoff).toISOString()}`, select: 'payload,expires_at', limit: '1' });
      return rows[0] || null;
    },
    async put(cacheKey, payload, expiresAt, now) {
      await request('matv_provider_cache', { on_conflict: 'provider,cache_key' }, { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: { provider: '3isk', cache_key: cacheKey, payload, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date(now).toISOString() } });
    },
    async event(cacheKey, outcome, durationMs, now) {
      await request('matv_provider_events', {}, { method: 'POST', prefer: 'return=minimal',
        body: { provider: '3isk', cache_key: cacheKey, outcome, duration_ms: Math.max(0, durationMs), created_at: new Date(now).toISOString() } });
    },
    async prune(now) {
      await request('matv_provider_cache', { provider: 'eq.3isk', expires_at: `lt.${new Date(now).toISOString()}` }, { method: 'DELETE' });
      await request('matv_provider_events', { provider: 'eq.3isk', created_at: `lt.${new Date(now - 30 * 86400_000).toISOString()}` }, { method: 'DELETE' });
    },
  };
}

// A separate private table holds catalog metadata, never playback tokens or
// headers. Clients can request a reference, but cannot submit cache payloads.
export function createSupabaseCatalogStore({ url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = globalThis.fetch } = {}) {
  if (!url || !key) return null;
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password || base.port || base.pathname !== '/') throw Error('SUPABASE_BAD_URL');
  if (key.startsWith('sb_publishable_')) throw Error('SUPABASE_SERVER_KEY_REQUIRED');
  const headers = { apikey:key, 'Content-Type':'application/json',
    ...(key.startsWith('sb_secret_') ? {} : {Authorization:`Bearer ${key}`}) };
  async function request(path, params, body) {
    const target = new URL('/rest/v1/' + path,base);
    for (const [key,value] of Object.entries(params)) target.searchParams.set(key,value);
    const response = await fetchImpl(target,{method:body ? 'POST' : 'GET',redirect:'error',
      signal:AbortSignal.timeout(5000),headers:{...headers,...(body ? {Prefer:'return=minimal'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})});
    if (!response.ok) {await response.body?.cancel();throw Error(`SUPABASE_CATALOG_HTTP_${response.status}`);}
    if (body || response.status===204) {await response.body?.cancel();return null;}
    const reader=response.body?.getReader(); if(!reader) throw Error('SUPABASE_CATALOG_BAD_RESPONSE');
    let size=0,text='';const decoder=new TextDecoder();
    try {
      for (;;) {const {done,value}=await reader.read();if(done) break;
        size+=value.byteLength;if(size>160*1024) throw Error('SUPABASE_CATALOG_RESPONSE_TOO_LARGE');
        text+=decoder.decode(value,{stream:true});}
      return JSON.parse(text+decoder.decode());
    } finally {await reader.cancel();}
  }
  return {
    async get(provider,ref) {
      const rows=await request('mitv_catalog_cache',{provider:`eq.${provider}`,ref:`eq.${ref}`,
        select:'metadata,request_count,refresh_after,last_requested_at,demand_hits',limit:'1'});
      if(!Array.isArray(rows)) throw Error('SUPABASE_CATALOG_BAD_RESPONSE');
      return rows[0] || null;
    },
    async touch(provider,ref,{metadata=null,count=1,newUntil=null,trendingUntil=null}={}) {
      await request('rpc/mitv_touch_catalog',{}, {p_provider:provider,p_ref:ref,p_metadata:metadata,
        p_count:count,p_new_until:newUntil,p_trending_until:trendingUntil});
    },
  };
}

export function createSupabaseFeedStore({url=process.env.SUPABASE_URL,
  key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl=globalThis.fetch}={}) {
  if(!url || !key) return null;
  const base=new URL(url);
  if(base.protocol!=='https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password || base.port || base.pathname!=='/') throw Error('SUPABASE_BAD_URL');
  if(key.startsWith('sb_publishable_')) throw Error('SUPABASE_SERVER_KEY_REQUIRED');
  const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})};
  async function request(params,body,path='mitv_catalog_feed_cache') {
    const target=new URL('/rest/v1/'+path,base);
    for(const [name,value] of Object.entries(params)) target.searchParams.set(name,value);
    const response=await fetchImpl(target,{method:body?'POST':'GET',redirect:'error',
      signal:AbortSignal.timeout(5000),headers:{...headers,...(body?{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){await response.body?.cancel();throw Error(`SUPABASE_FEED_HTTP_${response.status}`);}
    if(body){await response.body?.cancel();return null;}
    const reader=response.body?.getReader();if(!reader) throw Error('SUPABASE_FEED_BAD_RESPONSE');
    let size=0,text='';const decoder=new TextDecoder();
    try {for(;;){const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>160*1024) throw Error('SUPABASE_FEED_TOO_LARGE');
      text+=decoder.decode(value,{stream:true});}
      const rows=JSON.parse(text+decoder.decode());
      if(!Array.isArray(rows))throw Error('SUPABASE_FEED_BAD_RESPONSE');
      return rows[0] || null;
    } finally {await reader.cancel();}
  }
  return {
    recordOpen:(provider,ref)=>request({}, {p_provider:provider,p_ref:ref},'rpc/mitv_record_work_open'),
    get:(provider,category,now)=>request({provider:`eq.${provider}`,category:`eq.${category}`,
      expires_at:`gt.${new Date(now).toISOString()}`,select:'payload,expires_at',limit:'1'}),
    put:(provider,category,payload,expires,now)=>request({on_conflict:'provider,category'},
      {provider,category,payload,expires_at:new Date(expires).toISOString(),updated_at:new Date(now).toISOString()}),
  };
}
