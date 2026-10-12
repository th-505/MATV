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
