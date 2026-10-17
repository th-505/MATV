// =====================================================================
// MA TV SUPREME REAL SCRAPERS MASTER ENGINE (ZERO IFRAMES DIRECT RESOLUTION)
// =====================================================================

import { scrapeMyCimaCategory, searchMyCima, extractMyCimaStreamsAndEpisodes } from './sites/mycima.mjs';
import { scrapeAkwamCategory, searchAkwam, extractAkwamStreamsAndEpisodes } from './sites/akwam.mjs';
import { scrapeCimaNowCategory, extractCimaNowStreamsAndEpisodes } from './sites/cimanow.mjs';
import { scrapeEgyDeadCategory, extractEgyDeadStreamsAndEpisodes } from './sites/egydead.mjs';
import { scrapeArabSeedCategory, extractArabSeedStreamsAndEpisodes } from './sites/arabseed.mjs';
import { scrapeShahid4uCategory, extractShahid4uStreamsAndEpisodes } from './sites/shahid4u.mjs';
import { scrapeMovizTimeCategory, extractMovizTimeStreamsAndEpisodes } from './sites/moviztime.mjs';
import { scrape3cktvCategory, extract3cktvStreamsAndEpisodes } from './sites/3cktv.mjs';
import { scrapeAnime4UpCategory, extractAnime4UpStreamsAndEpisodes } from './sites/anime4up.mjs';
import { scrapeWitAnimeCategory, extractWitAnimeStreamsAndEpisodes } from './sites/witanime.mjs';
import { extractRistoAnimeStreams, extractQFilmStreams, extractIpaUniverseStreams, extractMewsryStreams } from './sites/specialized-portals.mjs';
import { scrapeEgyDeadLiveChannels, scrapeYallaShootMatches } from './supervisor6-witanime-live.mjs';
import { getProvider, listProviders, resolveProviderReference } from './registry.mjs';
import { attachResultMeta, SCRAPER_ERROR_CODES } from './shared/errors.mjs';

export { scrapeEgyDeadLiveChannels, scrapeYallaShootMatches };

const TMDB_API_KEY = String(process.env.TMDB_API_KEY || '').trim();
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 64;
const SEARCH_MAX_IN_FLIGHT = 2;
const SEARCH_PROVIDER_CONCURRENCY = 4;
// Public HTTP search includes provider-specific redirects and WAF latency. Keep it
// bounded, but allow one normal navigation through the configured egress proxy.
const SEARCH_PROVIDER_TIMEOUT_MS = 15_000;
const searchCache = new Map();
const searchInFlight = new Map();
const categoryCache = new Map();
const categoryInFlight = new Map();

/**
 * Searches TMDb to enrich scraped catalog items with official high-res posters and metadata
 */
export async function enrichCatalogWithTmdb(items = []) {
  if (!Array.isArray(items) || items.length === 0 || !TMDB_API_KEY) return items;

  const promises = items.slice(0, 8).map(async (item) => {
    // If item already has a good TMDb poster, skip
    if (item.poster && item.poster.includes('image.tmdb.org')) return item;

    const cleanTitle = (item.title || '')
      .replace(/الموسم\s*\d+|الحلقة\s*\d+|مترجم|مدبلج|فيلم|مسلسل|بلوراي|HD|4K|\b\d{4}\b/gi, '')
      .trim();

    if (!cleanTitle) return item;

    try {
      const type = (item.type === 'series' || item.is_series || item.category === 'series') ? 'tv' : 'movie';
      const searchUrl = new URL(`https://api.themoviedb.org/3/search/${type}`);
      searchUrl.searchParams.set('api_key', TMDB_API_KEY);
      searchUrl.searchParams.set('language', 'ar-SA');
      searchUrl.searchParams.set('query', cleanTitle);
      const res = await fetch(searchUrl, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return item;
      const json = await res.json();
      const match = json.results?.[0];

      if (match) {
        return {
          ...item,
          tmdb_id: match.id,
          title: item.title, // preserve source title
          tmdb_title: match.title || match.name,
          poster: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : item.poster,
          backdrop: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : '',
          overview: match.overview || item.overview || '',
          year: item.year || (match.release_date || match.first_air_date || '').substring(0, 4) || null,
          rating: match.vote_average ? Number(match.vote_average.toFixed(1)) : 8.5
        };
      }
    } catch (_) {}

    return item;
  });

  return [...await Promise.all(promises), ...items.slice(8)];
}

/**
 * Executes a real scraping query based on category across dedicated scrapers
 */
async function scrapeRealCategoryUncached(category, p) {
  let results = [];

  switch (category) {
    case 'movie-foreign':
      results = await scrapeMyCimaCategory('movies', p);
      if (results.length === 0) results = await scrapeAkwamCategory('movies', p);
      if (results.length === 0) results = await scrapeShahid4uCategory('movies', p);
      if (results.length === 0) results = await scrapeArabSeedCategory('movies', p);
      break;

    case 'movie-arabic':
      results = await scrapeArabSeedCategory('movies', p);
      if (results.length === 0) results = await scrapeAkwamCategory('movies', p);
      if (results.length === 0) results = await scrapeEgyDeadCategory('movies', p);
      if (results.length === 0) results = await scrapeCimaNowCategory('movies', p);
      break;

    case 'movie-indian':
    case 'movie-asian':
      results = await scrapeShahid4uCategory('movies', p);
      if (results.length === 0) results = await scrapeMovizTimeCategory('movies', p);
      if (results.length === 0) results = await scrapeMyCimaCategory('movies', p);
      break;

    case '3isk-movies':
    case 'turkish-movies':
      results = await scrape3cktvCategory('movies', p);
      if (results.length === 0) results = await scrapeMyCimaCategory('movies', p);
      if (results.length === 0) results = await scrapeArabSeedCategory('movies', p);
      break;

    case 'series-foreign':
      results = await scrapeShahid4uCategory('series', p);
      if (results.length === 0) results = await scrapeEgyDeadCategory('series', p);
      if (results.length === 0) results = await scrapeAkwamCategory('series', p);
      if (results.length === 0) results = await scrapeMyCimaCategory('series', p);
      break;

    case 'series-arabic':
    case 'series-ramadan':
      results = await scrapeArabSeedCategory('series', p);
      if (results.length === 0) results = await scrapeAkwamCategory('series', p);
      if (results.length === 0) results = await scrapeShahid4uCategory('series', p);
      if (results.length === 0) results = await scrapeCimaNowCategory('series', p);
      break;

    case 'series-turkish':
    case '3isk-latest':
    case '3isk-turkish':
    case '3isk-dubbed':
      results = await scrape3cktvCategory('series', p);
      if (results.length === 0) results = await scrapeMyCimaCategory('series', p);
      if (results.length === 0) results = await scrapeArabSeedCategory('series', p);
      break;

    case 'movie-anime':
      results = await scrapeAnime4UpCategory('anime_movies', p);
      if (results.length === 0) results = await scrapeWitAnimeCategory('anime_movies', p);
      break;

    case 'series-anime':
      results = await scrapeAnime4UpCategory('anime_series', p);
      if (results.length === 0) results = await scrapeWitAnimeCategory('anime_series', p);
      break;

    default:
      results = await scrapeMyCimaCategory('movies', p);
      if (results.length === 0) results = await scrapeAkwamCategory('movies', p);
      break;
  }

  // Enrich with TMDb for ultra high resolution posters and clean ratings
  return enrichCatalogWithTmdb(results);
}

export async function scrapeRealCategory(category, page = 1) {
  const parsedPage = Number(page);
  const p = Number.isFinite(parsedPage) ? Math.min(50, Math.max(1, Math.trunc(parsedPage))) : 1;
  const normalizedCategory = String(category || '').slice(0, 80);
  const key = `${normalizedCategory}:${p}`;
  const now = Date.now();
  const cached = categoryCache.get(key);
  if (cached && cached.expiresAt > now) return cloneItems(cached.items);
  if (cached) categoryCache.delete(key);
  const pending = categoryInFlight.get(key);
  if (pending) return cloneItems(await pending);
  if (categoryInFlight.size >= 2) return [];

  const task = scrapeRealCategoryUncached(normalizedCategory, p);
  categoryInFlight.set(key, task);
  try {
    const items = await task;
    categoryCache.set(key, { items: cloneItems(items), expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    while (categoryCache.size > SEARCH_CACHE_MAX_ENTRIES) categoryCache.delete(categoryCache.keys().next().value);
    return cloneItems(items);
  } finally {
    categoryInFlight.delete(key);
  }
}

/**
 * Executes a real search query across top scraping engines concurrently
 */
async function scrapeRealSearchUncached(q) {
  const entries = listProviders().map((meta) => getProvider(meta.id))
    .filter((entry) => entry?.meta.capabilities?.search === true && typeof entry.module.scrapeSearch === 'function');
  const outcomes = await runBounded(entries, SEARCH_PROVIDER_CONCURRENCY,
    (entry) => runProviderSearch(entry, q));
  const results = outcomes.flatMap((outcome) => outcome.items);
  const failures = outcomes.filter((outcome) => outcome.state === 'failed');
  const state = results.length > 0 ? (failures.length ? 'partial' : 'success')
    : failures.length === outcomes.length ? 'failed' : 'no_results';
  const enriched = await enrichCatalogWithTmdb(results);
  return attachResultMeta(enriched, {
    ok: state !== 'failed', state,
    errorCode: state === 'failed' ? 'ALL_SEARCH_PROVIDERS_FAILED' : null,
    providerResults: outcomes.map(({ items, ...diagnostic }) => diagnostic)
  });
}

function providerSearchOutcome(entry, result, elapsedMs) {
  const rows = Array.isArray(result) ? result : [];
  const errorCode = result?._meta?.errorCode || null;
  const valid = rows.filter((item) => item && typeof item.title === 'string' && item.title.trim() &&
    typeof (item.ref || item.id || item.url || item.link) === 'string' &&
    String(item.ref || item.id || item.url || item.link).trim());
  const state = valid.length > 0 ? 'success'
    : errorCode && errorCode !== SCRAPER_ERROR_CODES.EMPTY_RESULT ? 'failed' : 'no_results';
  return {
    state, providerId: entry.meta.id,
    errorCode: state === 'failed' ? errorCode : null,
    errorMessage: state === 'failed' ? String(result?._meta?.errorMessage || errorCode).slice(0, 180) : null,
    count: valid.length, elapsedMs,
    items: valid.map((item) => ({
      ...item,
      id: item.id || item.ref || item.url || item.link,
      ref: item.ref || item.id || item.url || item.link,
      source: entry.meta.id,
      providerId: entry.meta.id,
      providerName: entry.meta.name
    }))
  };
}

async function runProviderSearch(entry, q, timeoutMs = SEARCH_PROVIDER_TIMEOUT_MS) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('PROVIDER_SEARCH_TIMEOUT')), timeoutMs);
  try {
    const value = await entry.module.scrapeSearch(q, 1, {
      timeoutMs, signal: controller.signal, strict: true
    });
    return providerSearchOutcome(entry, value, Date.now() - startedAt);
  } catch (error) {
    return {
      state: 'failed', providerId: entry.meta.id,
      errorCode: controller.signal.aborted ? 'NETWORK_TIMEOUT' : String(error?.code || 'PROVIDER_SEARCH_FAILED'),
      errorMessage: String(error?.message || error).slice(0, 180),
      count: 0, elapsedMs: Date.now() - startedAt, items: []
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runBounded(entries, limit, worker) {
  const output = new Array(entries.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      output[index] = await worker(entries[index]);
    }
  }));
  return output;
}

/** Search one explicitly selected registered source and return JSON-serializable diagnostics. */
export async function searchProviderCatalog(providerId, query, { timeoutMs = SEARCH_PROVIDER_TIMEOUT_MS } = {}) {
  const q = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  const entry = getProvider(providerId);
  if (!entry) return { status: 'unsupported', provider_id: String(providerId || ''), query: q, data: [], error: { code: 'PROVIDER_NOT_FOUND' } };
  if (!entry.meta.capabilities?.search || typeof entry.module.scrapeSearch !== 'function') {
    return { status: 'unsupported', provider_id: entry.meta.id, query: q, data: [], error: { code: 'SEARCH_UNSUPPORTED' } };
  }
  if (q.length < 2 || q.length > 120) {
    return { status: 'error', provider_id: entry.meta.id, query: q, data: [], error: { code: 'INVALID_QUERY' } };
  }
  const outcome = await runProviderSearch(entry, q, Math.max(250, Math.min(15_000, Number(timeoutMs) || SEARCH_PROVIDER_TIMEOUT_MS)));
  const data = await enrichCatalogWithTmdb(outcome.items);
  return {
    status: outcome.state === 'failed' ? 'error' : outcome.state === 'no_results' ? 'no_results' : 'success',
    provider_id: entry.meta.id, provider_name: entry.meta.name, query: q, data,
    error: outcome.state === 'failed' ? { code: outcome.errorCode, message: outcome.errorMessage } : null,
    diagnostics: { elapsed_ms: outcome.elapsedMs, result_count: outcome.count }
  };
}
function cloneItems(items) {
  if (!Array.isArray(items)) return [];
  const cloned = items.map((item) => ({ ...item }));
  if (items._meta) attachResultMeta(cloned, { ...items._meta });
  return cloned;
}

export async function scrapeRealSearch(query) {
  if (typeof query !== 'string') return [];
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 120) return [];
  const key = q.toLocaleLowerCase('ar');
  const now = Date.now();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > now) return cloneItems(cached.items);
  if (cached) searchCache.delete(key);
  const pending = searchInFlight.get(key);
  if (pending) return cloneItems(await pending);
  if (searchInFlight.size >= SEARCH_MAX_IN_FLIGHT) return [];

  const task = scrapeRealSearchUncached(q);
  searchInFlight.set(key, task);
  try {
    const items = await task;
    searchCache.set(key, { items: cloneItems(items), expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    while (searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
      searchCache.delete(searchCache.keys().next().value);
    }
    return cloneItems(items);
  } finally {
    searchInFlight.delete(key);
  }
}

export function normalizeEpisodesList(rawEpisodes = [], fallbackTitle = 'الحلقة') {
  if (!Array.isArray(rawEpisodes)) return [];
  return rawEpisodes.map((ep, idx) => {
    const rawText = String(ep?.title || ep?.name || ep?.label || ep?.ep || '');
    const numMatch = rawText.match(/(\d+)/);
    const epNum = Number(ep?.number || ep?.episodeNumber || ep?.episode || (numMatch ? numMatch[1] : idx + 1)) || (idx + 1);
    const cleanTitle = rawText && !rawText.includes('undefined')
      ? rawText
      : `${fallbackTitle} ${epNum}`;
    return {
      ...ep,
      id: ep?.id || ep?.ref || ep?.url || `ep-${epNum}`,
      number: epNum,
      episodeNumber: epNum,
      title: cleanTitle,
      label: `الحلقة ${epNum}`,
      url: ep?.url || ep?.ref || ep?.link || ''
    };
  });
}

function sanitizeDetailsPayload(details, source = '') {
  if (!details || typeof details !== 'object') return details;
  const servers = Array.isArray(details.servers)
    ? details.servers
    : Array.isArray(details.media_sources) ? details.media_sources : [];
  if (Array.isArray(details.episodes)) {
    details.episodes = normalizeEpisodesList(details.episodes);
  }
  return {
    ...details,
    source: details.source || source,
    servers,
    media_sources: servers
  };
}

/**
 * Scrapes direct .m3u8 and .mp4 streams from dedicated scrapers based on reference or URL
 */
function canonicalizeProviderRef(refOrUrl, providerId) {
  const ref = String(refOrUrl || '').trim();
  const colon = ref.indexOf(':');
  if (colon <= 0 || /^https?$/i.test(ref.slice(0, colon))) return ref;
  const prefix = ref.slice(0, colon).toLowerCase();
  const aliases = { akoam: 'akwam', moviz: 'moviztime', ipa: 'ipauniverse', risto: 'ristoanime', sports_live: 'yallashoot', '3ck': '3cktv' };
  const canonical = aliases[prefix];
  return canonical && canonical === providerId ? `${providerId}:${ref.slice(colon + 1)}` : ref;
}

/** Routes provider refs and URLs through the central registry while preserving source identity. */
export async function scrapeRealDetails(refOrUrl, options = {}) {
  if (typeof refOrUrl !== 'string' || !refOrUrl.trim()) return null;
  const entry = resolveProviderReference(refOrUrl);
  if (!entry || !entry.meta.capabilities?.details || typeof entry.module.scrapeDetails !== 'function') return null;
  const routedRef = canonicalizeProviderRef(refOrUrl, entry.meta.id);
  const details = await entry.module.scrapeDetails(routedRef, options);
  if (!details || typeof details !== 'object') return null;
  const result = sanitizeDetailsPayload(details, entry.meta.id);
  result.source = entry.meta.id;
  result.providerId = entry.meta.id;
  const originalHasServerArray = Array.isArray(details.servers) || Array.isArray(details.media_sources);
  if (result.servers.length === 0 && typeof entry.module.scrapeServers === 'function') {
    const extractedServers = await entry.module.scrapeServers(routedRef, options);
    if (Array.isArray(extractedServers) && extractedServers.length > 0) {
      result.servers = extractedServers;
      result.media_sources = extractedServers;
    } else if (!originalHasServerArray) {
      result.servers = Array.isArray(extractedServers) ? extractedServers : [];
      result.media_sources = result.servers;
    }
  }
  for (const key of ['episodes', 'servers', 'media_sources']) {
    if (!Array.isArray(result[key])) continue;
    result[key] = result[key].map((item) => ({ ...item, source: item.source || entry.meta.id, provider: item.provider || entry.meta.id }));
  }
  return result;
}

// ---------------------------------------------------------------------
// Unified Scraper Runners for activateAllScrapersForContent
// ---------------------------------------------------------------------

export async function runMyCimaScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const hits = await searchMyCima(title);
    if (!Array.isArray(hits) || hits.length === 0) return [];
    const hit = hits[0];
    const details = await extractMyCimaStreamsAndEpisodes(hit.url);
    let targetUrl = hit.url;
    if (Array.isArray(details?.episodes) && details.episodes.length > 0) {
      const epMatch = details.episodes.find(e => Number(e.number) === Number(episode)) || details.episodes[0];
      if (epMatch?.url) targetUrl = epMatch.url;
    }
    const streams = targetUrl !== hit.url ? (await extractMyCimaStreamsAndEpisodes(targetUrl)) : details;
    return (streams?.servers || []).map((s, idx) => ({
      provider: 'mycima',
      code: `MA-${idx + 1}`,
      kind: 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

export async function runAkwamScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const hits = await searchAkwam(title);
    if (!Array.isArray(hits) || hits.length === 0) return [];
    const hit = hits[0];
    const details = await extractAkwamStreamsAndEpisodes(hit.url);
    let targetUrl = hit.url;
    if (Array.isArray(details?.episodes) && details.episodes.length > 0) {
      const epMatch = details.episodes.find(e => Number(e.number) === Number(episode)) || details.episodes[0];
      if (epMatch?.url) targetUrl = epMatch.url;
    }
    const streams = targetUrl !== hit.url ? (await extractAkwamStreamsAndEpisodes(targetUrl)) : details;
    return (streams?.servers || []).map((s, idx) => ({
      provider: 'akwam',
      code: `AK-${idx + 1}`,
      kind: 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

export async function runEgyDeadScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const movies = await scrapeEgyDeadCategory('movies_foreign', 1);
    const hit = movies.find(m => m.title && m.title.toLowerCase().includes(title.toLowerCase())) || movies[0];
    if (!hit) return [];
    const details = await extractEgyDeadStreamsAndEpisodes(hit.url);
    return (details?.servers || []).map((s, idx) => ({
      provider: 'egydead',
      code: `ED-${idx + 1}`,
      kind: s.kind || 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

export async function runArabSeedScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const movies = await scrapeArabSeedCategory('movies_foreign', 1);
    const hit = movies.find(m => m.title && m.title.toLowerCase().includes(title.toLowerCase())) || movies[0];
    if (!hit) return [];
    const details = await extractArabSeedStreamsAndEpisodes(hit.url);
    return (details?.servers || []).map((s, idx) => ({
      provider: 'arabseed',
      code: `AD-${idx + 1}`,
      kind: s.kind || 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

export async function runCimanowScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const movies = await scrapeCimaNowCategory('movies_foreign', 1);
    const hit = movies.find(m => m.title && m.title.toLowerCase().includes(title.toLowerCase())) || movies[0];
    if (!hit) return [];
    const details = await extractCimaNowStreamsAndEpisodes(hit.url);
    return (details?.servers || []).map((s, idx) => ({
      provider: 'cimanow',
      code: `CW-${idx + 1}`,
      kind: s.kind || 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

export async function runAnime4upScraper(title, season = 1, episode = 1) {
  if (!title) return [];
  try {
    const anime = await scrapeAnime4UpCategory('anime_series', 1);
    const hit = anime.find(m => m.title && m.title.toLowerCase().includes(title.toLowerCase())) || anime[0];
    if (!hit) return [];
    const details = await extractAnime4UpStreamsAndEpisodes(hit.url);
    return (details?.servers || []).map((s, idx) => ({
      provider: 'anime4up',
      code: `AP-${idx + 1}`,
      kind: s.kind || 'direct',
      url: s.url,
      quality: s.quality || 'HD',
      headers: s.headers || {}
    }));
  } catch (_) {
    return [];
  }
}

// تفعيل وتشغيل جميع القواشط المحلية لجلب الروابط المباشرة النقية (0 إعلانات، 0 تكلفة)
export async function activateAllScrapersForContent(title, season = 1, episode = 1) {
  console.log("جاري تشغيل قواشط MA-NEXUS المجاورة لجلب روابط البث المباشر...");
  
  const scrapers = [
    runMyCimaScraper,
    runAkwamScraper,
    runEgyDeadScraper,
    runArabSeedScraper,
    runCimanowScraper,
    runAnime4upScraper
  ];

  let directStreams = [];

  for (const scraper of scrapers) {
    try {
      const results = await scraper(title, season, episode);
      if (results && results.length > 0) {
        for (const res of results) {
          if (res.url && (res.url.includes('.mp4') || res.url.includes('.m3u8') || res.kind === 'direct')) {
            directStreams.push(res);
          }
        }
      }
    } catch (err) {
      console.warn("تخطى قاشط معين بسبب خطأ مؤقت، جاري متابعة البقية...", err.message);
    }
  }

  return directStreams;
}
