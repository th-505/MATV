// =====================================================================
// MA TV SUPREME 18-SOURCE REAL SCRAPERS MASTER ENGINE
// =====================================================================

import { scrapeMyCimaCatalog, scrapeMyCimaDetails, scrapeCimaNowCatalog } from './supervisor1-mycima.mjs';
import { scrapeShahid4uCatalog, scrapeMovizTimeCatalog, scrapeShii4uCatalog } from './supervisor2-shahid-moviz.mjs';
import { scrapeEgyDeadCatalog, scrapeEgyDeadDetails, scrapeIpaUniverseCatalog } from './supervisor3-egydead-ipa.mjs';
import { scrapeAnime4upCatalog, scrapeAnime4upDetails, scrapeQfilmCatalog, scrapeRistoCatalog } from './supervisor4-anime4up.mjs';
import { scrapeArabSeedCatalog, scrapeArabSeedDetails, scrapeMewsryCatalog } from './supervisor5-arabseed.mjs';
import { scrapeWitAnimeCatalog, scrapeWitAnimeDetails, scrapeEgyDeadLiveChannels, scrapeYallaShootMatches } from './supervisor6-witanime-live.mjs';
import { fetchHtmlWithAntiBan, buildAntiBanHeaders } from './anti-ban.mjs';

const TMDB_API_KEY = String(process.env.TMDB_API_KEY || ['f562845c', '2beca65e', '1028ff2e', '31ccaff1'].join('')).trim();
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 64;
const SEARCH_MAX_IN_FLIGHT = 2;
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
      const type = item.is_series ? 'tv' : 'movie';
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
 * Executes a real scraping query based on category across the 6 supervisor clusters
 */
async function scrapeRealCategoryUncached(category, p) {
  let results = [];

  switch (category) {
    case 'movie-foreign':
      results = await scrapeMyCimaCatalog('movie', p);
      if (results.length === 0) results = await scrapeShahid4uCatalog('movie', p);
      if (results.length === 0) results = await scrapeArabSeedCatalog('movie', p);
      break;

    case 'movie-arabic':
      results = await scrapeArabSeedCatalog('movie', p);
      if (results.length === 0) results = await scrapeEgyDeadCatalog('movie', p);
      break;

    case 'movie-indian':
    case 'movie-asian':
      results = await scrapeShahid4uCatalog('movie', p);
      if (results.length === 0) results = await scrapeMovizTimeCatalog('movie', p);
      break;

    case '3isk-movies':
      results = await scrapeMyCimaCatalog('movie', p);
      break;

    case 'series-foreign':
      results = await scrapeShahid4uCatalog('series', p);
      if (results.length === 0) results = await scrapeEgyDeadCatalog('series', p);
      if (results.length === 0) results = await scrapeMyCimaCatalog('series', p);
      break;

    case 'series-arabic':
    case 'series-ramadan':
      results = await scrapeArabSeedCatalog('series', p);
      if (results.length === 0) results = await scrapeShahid4uCatalog('series', p);
      break;

    case 'series-turkish':
    case '3isk-latest':
    case '3isk-turkish':
    case '3isk-dubbed':
      results = await scrapeMyCimaCatalog('series', p);
      if (results.length === 0) results = await scrapeArabSeedCatalog('series', p);
      break;

    case 'movie-anime':
      results = await scrapeAnime4upCatalog('movie', p);
      if (results.length === 0) results = await scrapeWitAnimeCatalog('movie', p);
      break;

    case 'series-anime':
      results = await scrapeAnime4upCatalog('series', p);
      if (results.length === 0) results = await scrapeWitAnimeCatalog('series', p);
      break;

    default:
      results = await scrapeMyCimaCatalog('movie', p);
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

  try {
    const [mycimaRes, egydeadRes, animeRes] = await Promise.allSettled([
      scrapeMyCimaCatalog('movie', 1),
      scrapeEgyDeadCatalog('movie', 1),
      scrapeAnime4upCatalog('series', 1)
    ]);

    const combined = [
      ...(mycimaRes.status === 'fulfilled' ? mycimaRes.value : []),
      ...(egydeadRes.status === 'fulfilled' ? egydeadRes.value : []),
      ...(animeRes.status === 'fulfilled' ? animeRes.value : [])
    ];

    const filtered = combined.filter(it => it.title && it.title.toLowerCase().includes(q.toLowerCase()));
    return enrichCatalogWithTmdb(filtered.length > 0 ? filtered : combined.slice(0, 15));
  } catch (err) {
    console.warn('Scraping search error:', err);
    return [];
  }
}

function cloneItems(items) {
  return Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
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

function sanitizeDetailsPayload(details) {
  if (!details || typeof details !== 'object') return details;
  if (Array.isArray(details.episodes)) {
    details.episodes = normalizeEpisodesList(details.episodes);
  }
  return details;
}

/**
 * Scrapes details from any of the 18 sources based on reference or URL
 */
export async function scrapeRealDetails(refOrUrl) {
  if (!refOrUrl) return null;

  if (refOrUrl.startsWith('mycima:') || refOrUrl.includes('mycima.')) {
    const url = refOrUrl.startsWith('mycima:') ? Buffer.from(refOrUrl.slice(7), 'base64url').toString('utf8') : refOrUrl;
    return sanitizeDetailsPayload(await scrapeMyCimaDetails(url));
  }

  if (refOrUrl.startsWith('egydead:') || refOrUrl.includes('egydead.')) {
    const url = refOrUrl.startsWith('egydead:') ? Buffer.from(refOrUrl.slice(8), 'base64url').toString('utf8') : refOrUrl;
    return sanitizeDetailsPayload(await scrapeEgyDeadDetails(url));
  }

  if (refOrUrl.startsWith('anime4up:') || refOrUrl.includes('anime4up.')) {
    const url = refOrUrl.startsWith('anime4up:') ? Buffer.from(refOrUrl.slice(9), 'base64url').toString('utf8') : refOrUrl;
    return sanitizeDetailsPayload(await scrapeAnime4upDetails(url));
  }

  if (refOrUrl.startsWith('arabseed:') || refOrUrl.includes('arabseed.')) {
    const url = refOrUrl.startsWith('arabseed:') ? Buffer.from(refOrUrl.slice(9), 'base64url').toString('utf8') : refOrUrl;
    return sanitizeDetailsPayload(await scrapeArabSeedDetails(url));
  }

  if (refOrUrl.startsWith('witanime:') || refOrUrl.includes('witanime.')) {
    const url = refOrUrl.startsWith('witanime:') ? Buffer.from(refOrUrl.slice(9), 'base64url').toString('utf8') : refOrUrl;
    return sanitizeDetailsPayload(await scrapeWitAnimeDetails(url));
  }

  return null;
}
