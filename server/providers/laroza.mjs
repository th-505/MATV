import { TtlCache, normalizeCatalogItem } from '../content-runtime.mjs';

const DEFAULT_EDGE = 'https://matv-edge-resolver.dada1000100.workers.dev';
const MAX_JSON_BYTES = 128 * 1024;
export const LAROZA_CATEGORIES = Object.freeze({
  'laroza-latest': 'edge:laroza:latest',
  'laroza-movies': 'edge:laroza:movies',
  'laroza-series': 'edge:laroza:series',
  'laroza-anime': 'edge:laroza:anime',
});

export function assertLarozaRef(value) {
  if (typeof value !== 'string' || !/^laroza:[A-Za-z0-9_-]{1,1500}$/.test(value)) throw Error('LAROZA_BAD_REFERENCE');
  const path = Buffer.from(value.slice(7), 'base64url').toString('utf8');
  let url;
  try { url = new URL(path, 'https://laroza.invalid'); } catch { throw Error('LAROZA_BAD_REFERENCE'); }
  const parameter = url.pathname === '/play.php' ? 'vid' : url.pathname === '/view-serie1.php' ? 'ser' : '';
  if (url.origin !== 'https://laroza.invalid' || !parameter || url.hash ||
      [...url.searchParams.keys()].some(key => key !== parameter) || url.searchParams.getAll(parameter).length !== 1 ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(url.searchParams.get(parameter) || '') ||
      'laroza:' + Buffer.from(url.pathname + url.search).toString('base64url') !== value) throw Error('LAROZA_BAD_REFERENCE');
  return value;
}

async function jsonText(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('LAROZA_BAD_EDGE_RESPONSE');
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_JSON_BYTES) throw Error('LAROZA_EDGE_RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream:true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error.message === 'LAROZA_EDGE_RESPONSE_TOO_LARGE') throw error;
    throw Error('LAROZA_BAD_EDGE_RESPONSE');
  } finally { await reader.cancel(); }
}

function catalogItem(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('LAROZA_BAD_EDGE_RESPONSE');
  const ref = assertLarozaRef(String(row.ref || row.href || ''));
  return normalizeCatalogItem({ ...row, id:row.id || ref, ref, source:'laroza', source_refs:{laroza:ref} });
}

function pagination(data, page) {
  if (typeof data.has_more !== 'boolean') return {};
  const raw = data.pagination;
  const next = Number(raw?.next_page);
  return { has_more:data.has_more, pagination:{ page, has_more:data.has_more,
    next_page:data.has_more && Number.isInteger(next) && next > page && next <= 500 ? next : null,
    bounded_feed_rotation:raw?.bounded_feed_rotation === true } };
}

// This facade makes bounded JSON requests to the private application gateway;
// it never follows source pages, receives video bodies, or returns web embeds.
export function createLarozaProvider({
  edgeBase = process.env.MITV_EDGE_BASE || DEFAULT_EDGE,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  cache = new TtlCache({ maxEntries:96 }),
} = {}) {
  const base = new URL(edgeBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.port || base.search || base.hash || base.pathname !== '/')
    throw Error('LAROZA_BAD_EDGE_ENDPOINT');
  const pending = new Map();
  async function request(path, params, refresh = false, signal = null) {
    const target = new URL('/v1/laroza/' + path, base);
    for (const [key,value] of Object.entries(params)) target.searchParams.set(key, String(value));
    const cacheKey = target.href;
    if (!refresh) {
      const cached = cache.get(cacheKey, now());
      if (cached) return cached;
    }
    if (!signal && pending.has(cacheKey)) return pending.get(cacheKey);
    const work = (async () => {
      const response = await fetchImpl(target, {
        method:'GET', redirect:'error', signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) { await response.body?.cancel(); throw Error('LAROZA_EDGE_HTTP_' + response.status); }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel(); throw Error('LAROZA_BAD_EDGE_RESPONSE');
      }
      const data = await jsonText(response);
      if (!data || data.status !== 'success' || data.source !== 'laroza') throw Error('LAROZA_BAD_EDGE_RESPONSE');
      if (!signal?.aborted) cache.set(cacheKey, data, path === 'search' ? 30000 : 120000, now());
      return data;
    })();
    if (!signal) pending.set(cacheKey, work);
    try { return await work; } finally { if (!signal && pending.get(cacheKey) === work) pending.delete(cacheKey); }
  }
  return {
    async category(id = 'laroza-latest', page = 1) {
      if (!Object.hasOwn(LAROZA_CATEGORIES,id) || !Number.isInteger(page) || page < 1 || page > 500) throw Error('LAROZA_BAD_CATEGORY');
      const section = LAROZA_CATEGORIES[id].split(':')[2];
      const data = await request('category', {section,page});
      if (!Array.isArray(data.data)) throw Error('LAROZA_BAD_EDGE_RESPONSE');
      return { status:'success', source:'laroza', ...pagination(data,page), data:data.data.slice(0,60).map(row => {
        const item = catalogItem(row);
        return section === 'anime' ? { ...item, genres:[...new Set([...(item.genres || []),'anime'])], category:'anime' } : item;
      }) };
    },
    async search(query, page = 1, { signal = null } = {}) {
      const q = String(query || '').trim().slice(0,120);
      if (q.length < 2) return { status:'success', source:'laroza', data:[] };
      if (!Number.isInteger(page) || page < 1 || page > 500) throw Error('LAROZA_BAD_PAGE');
      const data = await request('search', {q,page}, false, signal);
      if (!Array.isArray(data.data)) throw Error('LAROZA_BAD_EDGE_RESPONSE');
      return { status:'success', source:'laroza', ...pagination(data,page), data:data.data.slice(0,60).map(catalogItem) };
    },
    async metadata(ref, { refresh = false } = {}) {
      assertLarozaRef(ref);
      const result = await request('details', {ref}, refresh);
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw Error('LAROZA_BAD_EDGE_RESPONSE');
      const item = catalogItem({ ...result.data, ref });
      const episodes = (Array.isArray(result.data.episodes) ? result.data.episodes : []).slice(0,500).map((row,index) => {
        const entry = catalogItem({ ...row, type:'episode' });
        const number = Number(row.episode_number ?? row.num ?? index + 1);
        return { ...entry, episode_id:String(row.episode_id || row.id || entry.ref),
          episode_number:Number.isInteger(number) && number > 0 ? number : index + 1,
          num:Number.isInteger(number) && number > 0 ? number : index + 1,
          watch_available:row.watch_available !== false };
      });
      return { ...item, movie_title:item.title, status:'success', episodes,
        description:String(result.data.description || result.data.plot || '').slice(0,8000),
        ...(typeof result.data.published_at==='string' && Number.isFinite(Date.parse(result.data.published_at))
          ? {published_at:new Date(result.data.published_at).toISOString()} : {}),
        is_iframe:false, download_available:false, media_sources:[],
        ...(episodes.length ? {} : {playback_unavailable:true, playback_reason:'EDGE_DIRECT_RESOLUTION_REQUIRED'}) };
    },
    details(ref, options) { return this.metadata(ref, options); },
    status() { return { provider:'laroza', playback_mode:'edge_direct', media_proxy:false, metadata_only:true, cache_entries:cache.size }; },
  };
}
