import { createSupabaseCatalogStore } from './provider-store.mjs';

const PROVIDERS=new Set(['3isk','akoam','alooy','laroza']);
const MAX_BYTES=128*1024;
const NEW_MS=48*3600000;
const sensitiveUrl=/https?:\/\/[^\s"'<>]+(?:\.(?:m3u8|mp4|mkv|mpd|webm|ts)(?:[?/#][^\s"'<>]*)?|[?&](?:token|signature|authorization|access_token)=[^\s"'<>]*)/gi;
const text=(value,max=256)=>typeof value==='string' ? value.replace(sensitiveUrl,'').trim().slice(0,max) : '';
function image(value) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port &&
    !/\.(?:m3u8|mp4|mkv|mpd|webm|ts)$/i.test(u.pathname) &&
    ![...u.searchParams.keys()].some(k=>/^(?:token|signature|authorization|access_token|apikey|api_key|key|sig|expires|exp)$/i.test(k)) ? u.href.slice(0,2048) : '';} catch{return '';}
}

// A positive schema makes raw resolver responses unsuitable for storage. Never
// copy arbitrary source keys, scripts, subtitles, headers or signed media URLs.
export function catalogMetadata(payload,provider,ref,validateRef) {
  if (!PROVIDERS.has(provider) || !payload || typeof payload!=='object' || Array.isArray(payload)) throw Error('BAD_CATALOG_METADATA');
  function item(raw,ownRef) {
    const result={ref:ownRef,source:provider,title:text(raw.title || raw.movie_title || raw.name,512),
      poster:image(raw.poster || raw.img || raw.image),
      type:['movie','series','episode','anime','program'].includes(raw.type) ? raw.type : 'unknown'};
    if(!result.title) result.title='التفاصيل';
    if(Number.isInteger(raw.year) && raw.year>=1870 && raw.year<=2200) result.year=raw.year;
    for(const key of ['audio_language','edition','category']) if(typeof raw[key]==='string') result[key]=text(raw[key],120);
    if(Array.isArray(raw.genres)) result.genres=[...new Set(raw.genres.map(v=>text(v,64)).filter(Boolean))].slice(0,20);
    for(const key of ['season_number','episode_number']) {const value=raw[key] ?? (key==='season_number' ? raw.season : raw.num);
      if(Number.isInteger(value) && value>=0 && value<=100000) result[key]=value;}
    if(/^tt\d{5,12}$/.test(raw.imdb_id || '')) result.imdb_id=raw.imdb_id;
    for(const key of ['identity_verified','work_identity_verified','timeline_verified']) if(Object.hasOwn(raw,key)) result[key]=raw[key]===true;
    result.source_refs={[provider]:ownRef};
    // Only already validated own-provider references are accepted from source
    // metadata; cross-provider mappings require the separate identity merger.
    return result;
  }
  const result={...item(payload,ref),status:'success',is_iframe:false,download_available:false};
  result.movie_title=result.title;
  result.description=text(payload.description || payload.plot,8000);
  if(typeof payload.published_at==='string' && Number.isFinite(Date.parse(payload.published_at))) result.published_at=new Date(payload.published_at).toISOString();
  result.episodes=[];
  for(const raw of (Array.isArray(payload.episodes) ? payload.episodes : []).slice(0,500)) {
    try {
      const episodeRef=String(raw.ref || raw.link || raw.href || '');
      if(validateRef(episodeRef)!==provider) continue;
      const row=item(raw,episodeRef);
      row.episode_id=episodeRef;
      row.watch_available=raw.watch_available!==false;
      if(row.episode_number!=null) row.num=row.episode_number;
      row.link=episodeRef;
      result.episodes.push(row);
    } catch { /* Malformed source links cannot become cache fetch targets. */ }
  }
  // Retain useful bounded metadata while never truncating a JSON byte stream.
  while(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES && result.episodes.length) result.episodes.pop();
  if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES) throw Error('CATALOG_METADATA_TOO_LARGE');
  return result;
}

export function trustedNewUntil(payload,now=Date.now()) {
  // These inputs come only from a provider parser or a server-observed latest
  // category. A release YEAR or a title containing "new" is not evidence.
  if(payload?.is_latest===true || payload?.is_new===true) return new Date(now+NEW_MS).toISOString();
  const published=Date.parse(payload?.published_at || '');
  return Number.isFinite(published) && published<=now+300000 && published>now-NEW_MS
    ? new Date(Math.min(now+NEW_MS,published+NEW_MS)).toISOString() : null;
}

export function createCatalogMetadataCache({validateRef,load,store=createSupabaseCatalogStore(),
  now=Date.now,maxEntries=128,maxPending=16,refreshMs=600000,touchMs=3600000}={}) {
  const entries=new Map(),pending=new Map(),latest=new Map();let storageError=null,storageRetryAt=0;
  async function persisted(fn) {try {return await fn();} catch {storageError='SUPABASE_CATALOG_UNAVAILABLE';storageRetryAt=now()+30000;return null;}}
  function due(entry,force=false) {return entry.pendingCount>0 && (force || entry.metadataWrite || entry.persistedDemandCount<3 || now()-entry.lastTouched>=touchMs);}
  async function flush(entry,force=false) {
    if(!store) {entry.pendingCount=0;return;}
    if(now()<storageRetryAt) return;
    if(entry.writing) {await entry.writing;return flush(entry,force);}
    if(!due(entry,force)) return;
    entry.writing=(async()=>{
      while(due(entry,force)) {
        const count=Math.min(entry.pendingCount,1000),write=entry.metadataWrite;
        entry.pendingCount-=count;entry.metadataWrite=false;
        try {
          await store.touch(entry.provider,entry.ref,{count,metadata:write ? entry.value : null,newUntil:write ? entry.newUntil : null});
          entry.persistedCount+=count;entry.persistedDemandCount=Math.min(3,entry.persistedDemandCount+count);entry.lastTouched=now();
          storageError=null;storageRetryAt=0;
        } catch {entry.pendingCount+=count;entry.metadataWrite ||= write;storageError='SUPABASE_CATALOG_UNAVAILABLE';storageRetryAt=now()+30000;break;}
      }
    })();
    try {await entry.writing;} finally {entry.writing=null;}
  }
  async function obtain(provider,ref) {
    const row=store && now()>=storageRetryAt ? await persisted(()=>store.get(provider,ref)) : null;
    let value,expires,persistedCount=Number(row?.request_count)||0,metadataWrite=false,newUntil=null;
    const persistedDemandCount=(Array.isArray(row?.demand_hits) ? row.demand_hits : []).filter(stamp=>Date.parse(stamp)>=now()-7*86400000).length;
    if(row && Date.parse(row.refresh_after)>now()) {
      try {value=catalogMetadata(row.metadata,provider,ref,validateRef);expires=Date.parse(row.refresh_after);} catch { /* Refresh rejected durable metadata through the trusted loader. */ }
    }
    if(!value) {const raw=await load(provider,ref);value=catalogMetadata(raw,provider,ref,validateRef);
      newUntil=trustedNewUntil(raw,now()) || (latest.get(ref)>now() ? new Date(latest.get(ref)).toISOString() : null);
      expires=now()+refreshMs;metadataWrite=true;}
    if(latest.get(ref)>now()) {newUntil=new Date(latest.get(ref)).toISOString();metadataWrite=true;}
    const entry={provider,ref,value,expires,persistedCount,persistedDemandCount,metadataWrite,newUntil,pendingCount:0,lastTouched:now(),writing:null};
    if(entries.size>=maxEntries && !entries.has(ref)) {
      const oldest=entries.keys().next().value,evicted=entries.get(oldest);
      if(evicted) await flush(evicted,true);
      entries.delete(oldest);
    }
    entries.set(ref,entry);return entry;
  }
  return {
    observeLatest(items) {
      for(const item of (Array.isArray(items) ? items : []).slice(0,60)) {
        try {const ref=typeof item==='string' ? item : item.ref || item.href || item.link;validateRef(ref);
          if(latest.size>=128 && !latest.has(ref)) latest.delete(latest.keys().next().value);
          latest.set(ref,now()+NEW_MS);
          const entry=entries.get(ref);
          if(entry) {entry.newUntil=new Date(latest.get(ref)).toISOString();entry.metadataWrite=true;}
        } catch { /* Only canonical references from a trusted catalog count. */ }
      }
    },
    async get(ref) {
      const provider=validateRef(ref);
      if(!PROVIDERS.has(provider) || Buffer.byteLength(ref)>1536) throw Error('BAD_CINEMA_REFERENCE');
      let entry=entries.get(ref);
      if(!entry || entry.expires<=now()) {
        if(!pending.has(ref)) {
          if(pending.size>=maxPending) throw Error('CATALOG_BUSY');
          const previous=entry;
          const work=(async()=>{if(previous) await flush(previous,true);return obtain(provider,ref);})();pending.set(ref,work);
          work.finally(()=>pending.delete(ref)).catch(()=>{});
        }
        entry=await pending.get(ref);
      }
      entry.pendingCount+=1;
      await flush(entry);
      return structuredClone(entry.value);
    },
    async flush() {await Promise.all([...entries.values()].map(entry=>flush(entry,true)));},
    status:()=>({storage:store ? 'supabase' : 'memory',storage_error:storageError,entries:entries.size,pending:pending.size,metadata_only:true}),
  };
}
