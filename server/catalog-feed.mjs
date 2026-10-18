import { getProvider, listProviders } from './scrapers/registry.mjs';
import { normalizeCatalogItem, PRODUCT_VERSION } from './content-runtime.mjs';

export const FEED_CATEGORIES = Object.freeze({
  'browse-movies': {type:'movie', title:'جميع الأفلام'},
  'browse-series': {type:'series', title:'جميع المسلسلات'},
  'browse-anime': {type:'anime', title:'جميع الأنمي'},
  ...Object.fromEntries([['foreign','أجنبية'],['arabic','عربية'],['indian','هندية'],['asian','آسيوية'],['turkish','تركية']]
    .map(([genre,title])=>['browse-movie-'+genre,{type:'movie',genre,title:'أفلام '+title}])),
  ...Object.fromEntries([['foreign','أجنبية'],['arabic','عربية'],['asian','آسيوية'],['turkish','تركية'],['ramadan','رمضان']]
    .map(([genre,title])=>['browse-series-'+genre,{type:'series',genre,title:'مسلسلات '+title}])),
  'browse-anime-movies':{type:'anime',genre:'movies',title:'أفلام أنمي'},
  'browse-anime-series':{type:'anime',genre:'series',title:'مسلسلات أنمي'},
});

// Read each adapter's declared categories from the existing capability registry.
// This is a routing policy, not another provider registration or another scraper.
export function catalogCategoryFor(entry, kind, lookup = getProvider, genre = null) {
  if (!entry) return null;
  const config = Object.values(entry.module).find(value => value && typeof value === 'object' && value.categories);
  if (!config && entry.meta.mirrorOf) return catalogCategoryFor(lookup(entry.meta.mirrorOf), kind, lookup, genre);
  const keys = Object.keys(config?.categories || {});
  if (genre) {
    const plural=kind==='movie'?'movies':'series';
    const candidates=kind==='anime' ? ['anime_'+genre,genre==='movies'?'movie-anime':'series-anime']
      : [plural+'_'+genre,(kind==='movie'?'movie':'series')+'-'+genre,genre+'-'+plural,genre+'_'+plural];
    return candidates.find(key=>keys.includes(key)) || null;
  }
  const preferred = kind === 'movie' ? ['movies','movies_all','movie','movies_foreign','foreign-movies']
    : kind === 'series' ? ['series','series_all','series_foreign','foreign-series']
    : ['anime','anime_all','anime_series','anmi'];
  return preferred.find(key => keys.includes(key)) || null;
}

export function createCatalogFeed({providers = () => listProviders().map(meta => getProvider(meta.id)),
  store = null, now = Date.now, ttlMs = 3_600_000, timeoutMs = 7_000, concurrency = 4} = {}) {
  const snapshots = new Map();
  const pending = new Map();
  let serial = 0;
  async function read(category, page = 1) {
    const definition = FEED_CATEGORIES[category];
    if (!definition || !Number.isInteger(page) || page < 1 || page > 100) throw Error('FEED_BAD_REQUEST');
    let snapshot = snapshots.get(category);
    if (!snapshot || snapshot.expires <= now()) {
      snapshot = {id:`${now()}-${++serial}`, expires:now()+ttlMs, pages:new Map(), states:providers()
        .filter(entry => entry?.meta.capabilities?.catalog && typeof entry.module.scrapeCatalog === 'function')
        .map(entry => ({entry, category:catalogCategoryFor(entry, definition.type, getProvider, definition.genre), rows:[], base:0, next:1, hasMore:true, restored:false, seen:new Set()}))
        .filter(state => state.category)};
      snapshots.set(category, snapshot);
    }
    if (snapshot.pages.has(page)) return {...snapshot.pages.get(page), cached:true};
    const key = `${snapshot.id}:${page}`;
    if (pending.has(key)) return pending.get(key);
    if(pending.size>=2)throw Error('FEED_BUSY');
    const work = buildPage(snapshot, category, definition, page).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }
  async function buildPage(snapshot, category, definition, page) {
    // Serialize pages in a snapshot: shared buffers never race or skip a remote page.
    const previous = snapshot.running;
    let release;
    snapshot.running = new Promise(resolve => { release = resolve; });
    if (previous) await previous;
    try {
      if (snapshot.pages.has(page)) return {...snapshot.pages.get(page), cached:true};
      const offset = (page - 1) * 10;
      const deadline = Date.now() + 45_000;
      const chunks = new Array(snapshot.states.length);
      const diagnostics = new Array(snapshot.states.length);
      let cursor = 0;
      await Promise.all(Array.from({length:Math.min(concurrency,snapshot.states.length)}, async () => {
        while (cursor < snapshot.states.length) {
          const index = cursor++;
          const state = snapshot.states[index];
          let failed = false;
          // A browse request never calls a search endpoint or guesses a genre URL.
          try {
            if (!state.restored) {
              state.restored = true;
              try {
                const saved = await store?.get(state.entry.meta.id,category,now());
                const payload = saved?.payload;
                if (payload && Date.parse(saved.expires_at)>now() && Array.isArray(payload.rows) && payload.rows.length<=60 && Number.isInteger(payload.next) && payload.next>=1 && payload.next<=101) {
                  state.rows=payload.rows.map(row=>normalizeCatalogItem({...row,source:state.entry.meta.id})).filter(row=>row.ref && row.title);
                  state.next=payload.next;state.hasMore=payload.hasMore===true;
                  state.seen=new Set(state.rows.map(row=>row.ref));
                  snapshot.expires=Math.min(snapshot.expires,Date.parse(saved.expires_at));
                }
              } catch { /* Database outage must not prevent direct catalog browsing. */ }
            }
            if (offset < state.base) throw Error('FEED_WINDOW_EXPIRED');
            for (let attempt = 0; state.hasMore && state.base + state.rows.length < offset + 10 && attempt < 8; attempt++) {
              const budget = Math.min(timeoutMs, deadline-Date.now());
              if (budget <= 0) throw Error('CATALOG_BUDGET_EXCEEDED');
              const controller = new AbortController();
              let rejectTimeout;
              const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
              const timer = setTimeout(() => { controller.abort(); rejectTimeout(Error('CATALOG_TIMEOUT')); }, budget);
              let result;
              try {
                result = await Promise.race([Promise.resolve().then(() => state.entry.module.scrapeCatalog(state.category, state.next, {signal:controller.signal,timeoutMs:budget,strict:true})), timeout]);
              } finally { clearTimeout(timer); }
              if (result?._meta?.ok === false && result._meta.errorCode !== 'EMPTY_RESULT') throw Error(result._meta.errorCode || 'CATALOG_FAILED');
              const rows = (Array.isArray(result) ? result : result?.data || []).map(row => normalizeCatalogItem({...row, ref:row.ref || row.id || row.url || row.link, ...(definition.type==='anime'?{category:'anime',genres:[...(Array.isArray(row.genres)?row.genres:[]),'anime']}:{}), source:state.entry.meta.id, providerId:state.entry.meta.id})).filter(row => row.ref && row.title);
              const unique = rows.filter(row => {
                if (state.seen.has(row.ref)) return false;
                state.seen.add(row.ref); return true;
              });
              state.rows.push(...unique);
              state.next++;
              state.hasMore = rows.length > 0 && unique.length > 0 && result?.has_more !== false;
              if (store && state.base===0 && state.rows.length<=60) {
                try {
                  await store.put(state.entry.meta.id,category,
                    {rows:state.rows,next:state.next,hasMore:state.hasMore},snapshot.expires,now());
                } catch { /* Retry on the next successful source page; never fail playback. */ }
              }

              if (state.rows.length > 60 && offset > state.base) {
                const discard = Math.min(state.rows.length-60, offset-state.base);
                state.rows.splice(0,discard); state.base += discard;
              }
              while (state.seen.size > 1024) state.seen.delete(state.seen.values().next().value);
            }
          } catch (error) { failed = true; diagnostics[index] = {provider_id:state.entry.meta.id,state:'error',code:String(error.message)}; }
          chunks[index] = state.rows.slice(Math.max(0,offset-state.base),Math.max(0,offset-state.base)+10);
          diagnostics[index] ||= {provider_id:state.entry.meta.id,state:chunks[index].length?'success':'no_results'};
          // A failed adapter stays retryable; an empty adapter does not invent results.
          if (failed && !chunks[index].length) diagnostics[index].retryable = true;
        }
      }));
      const data = chunks.flat();
      const hasMore = snapshot.states.some(state => state.hasMore || state.base + state.rows.length > offset+10);
      const result = {status:data.length?'success':diagnostics.some(d=>d.state==='error')?'error':'no_results',
        version:PRODUCT_VERSION,kind:'category',source:'registered-catalog',category,type:definition.type,
        snapshot:snapshot.id,page,cached:false,has_more:hasMore,pagination:{has_more:hasMore,next_page:hasMore?page+1:null},
        diagnostics:{sources:diagnostics},data};
      if (result.status !== 'error') snapshot.pages.set(page,result);
      while (snapshot.pages.size > 12) snapshot.pages.delete(snapshot.pages.keys().next().value);
      return result;
    } finally { release(); }
  }
  return {read};
}
