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

export { scrapeEgyDeadLiveChannels, scrapeYallaShootMatches };

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
  try {
    const [mycimaRes, akwamRes, egydeadRes, animeRes] = await Promise.allSettled([
      searchMyCima(q),
      searchAkwam(q),
      scrapeEgyDeadCategory('movies', 1),
      scrapeAnime4UpCategory('anime_series', 1)
    ]);

    const combined = [
      ...(mycimaRes.status === 'fulfilled' ? mycimaRes.value : []),
      ...(akwamRes.status === 'fulfilled' ? akwamRes.value : []),
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

function sanitizeDetailsPayload(details, source = '') {
  if (!details || typeof details !== 'object') return details;
  const servers = Array.isArray(details.servers) ? details.servers : [];
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

function decodeRefUrl(ref, prefix) {
  const raw = ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
  } catch (_) {}
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
  } catch (_) {}
  return raw;
}

/**
 * Scrapes direct .m3u8 and .mp4 streams from dedicated scrapers based on reference or URL
 */
export async function scrapeRealDetails(refOrUrl) {
  if (!refOrUrl || typeof refOrUrl !== 'string') return null;

  // 1. MyCima (MA)
  if (refOrUrl.startsWith('mycima:') || refOrUrl.includes('mycima.') || refOrUrl.includes('wecima.')) {
    const url = decodeRefUrl(refOrUrl, 'mycima:');
    return sanitizeDetailsPayload(await extractMyCimaStreamsAndEpisodes(url), 'mycima');
  }

  // 2. Akwam (AK)
  if (refOrUrl.startsWith('akwam:') || refOrUrl.includes('akwam.') || refOrUrl.includes('akoam.')) {
    const url = decodeRefUrl(refOrUrl, 'akwam:');
    return sanitizeDetailsPayload(await extractAkwamStreamsAndEpisodes(url), 'akwam');
  }

  // 3. CimaNow (CW)
  if (refOrUrl.startsWith('cimanow:') || refOrUrl.includes('cimanow.')) {
    const url = decodeRefUrl(refOrUrl, 'cimanow:');
    return sanitizeDetailsPayload(await extractCimaNowStreamsAndEpisodes(url), 'cimanow');
  }

  // 4. EgyDead (ED)
  if (refOrUrl.startsWith('egydead:') || refOrUrl.includes('egydead.')) {
    const url = decodeRefUrl(refOrUrl, 'egydead:');
    return sanitizeDetailsPayload(await extractEgyDeadStreamsAndEpisodes(url), 'egydead');
  }

  // 5. ArabSeed (AD)
  if (refOrUrl.startsWith('arabseed:') || refOrUrl.includes('arabseed.')) {
    const url = decodeRefUrl(refOrUrl, 'arabseed:');
    return sanitizeDetailsPayload(await extractArabSeedStreamsAndEpisodes(url), 'arabseed');
  }

  // 6. Shahid4u (SU / SH)
  if (refOrUrl.startsWith('shahid4u:') || refOrUrl.startsWith('shii4u:') || refOrUrl.includes('shahid4u.') || refOrUrl.includes('sh4u.')) {
    const url = decodeRefUrl(refOrUrl, refOrUrl.startsWith('shii4u:') ? 'shii4u:' : 'shahid4u:');
    return sanitizeDetailsPayload(await extractShahid4uStreamsAndEpisodes(url), 'shahid4u');
  }

  // 7. MovizTime (ME)
  if (refOrUrl.startsWith('moviztime:') || refOrUrl.startsWith('moviz:') || refOrUrl.includes('moviztime.')) {
    const url = decodeRefUrl(refOrUrl, refOrUrl.startsWith('moviz:') ? 'moviz:' : 'moviztime:');
    return sanitizeDetailsPayload(await extractMovizTimeStreamsAndEpisodes(url), 'moviztime');
  }

  // 8. 3cktv (3V)
  if (refOrUrl.startsWith('3cktv:') || refOrUrl.startsWith('3ck:') || refOrUrl.includes('3ck.')) {
    const url = decodeRefUrl(refOrUrl, refOrUrl.startsWith('3ck:') ? '3ck:' : '3cktv:');
    return sanitizeDetailsPayload(await extract3cktvStreamsAndEpisodes(url), '3cktv');
  }

  // 9. Anime4Up (AP)
  if (refOrUrl.startsWith('anime4up:') || refOrUrl.includes('anime4up.')) {
    const url = decodeRefUrl(refOrUrl, 'anime4up:');
    return sanitizeDetailsPayload(await extractAnime4UpStreamsAndEpisodes(url), 'anime4up');
  }

  // 10. WitAnime (WE)
  if (refOrUrl.startsWith('witanime:') || refOrUrl.includes('witanime.')) {
    const url = decodeRefUrl(refOrUrl, 'witanime:');
    return sanitizeDetailsPayload(await extractWitAnimeStreamsAndEpisodes(url), 'witanime');
  }

  // 11. Specialized Portals: RistoAnime (RE)
  if (refOrUrl.startsWith('ristoanime:') || refOrUrl.startsWith('risto:') || refOrUrl.includes('ristoanime.')) {
    const url = decodeRefUrl(refOrUrl, refOrUrl.startsWith('risto:') ? 'risto:' : 'ristoanime:');
    return sanitizeDetailsPayload(await extractRistoAnimeStreams(url), 'ristoanime');
  }

  // 12. Specialized Portals: QFilm (QM)
  if (refOrUrl.startsWith('qfilm:') || refOrUrl.includes('qfilm.')) {
    const url = decodeRefUrl(refOrUrl, 'qfilm:');
    return sanitizeDetailsPayload(await extractQFilmStreams(url), 'qfilm');
  }

  // 13. Specialized Portals: IPAUniverse (IE)
  if (refOrUrl.startsWith('ipauniverse:') || refOrUrl.startsWith('ipa:') || refOrUrl.includes('ipauniverse.')) {
    const url = decodeRefUrl(refOrUrl, refOrUrl.startsWith('ipa:') ? 'ipa:' : 'ipauniverse:');
    return sanitizeDetailsPayload(await extractIpaUniverseStreams(url), 'ipauniverse');
  }

  // 14. Specialized Portals: Mewsry (MY)
  if (refOrUrl.startsWith('mewsry:') || refOrUrl.includes('mewsry.')) {
    const url = decodeRefUrl(refOrUrl, 'mewsry:');
    return sanitizeDetailsPayload(await extractMewsryStreams(url), 'mewsry');
  }

  // 15. 3isk (3K)
  if (refOrUrl.startsWith('3isk:') || refOrUrl.includes('3isk.') || refOrUrl.includes('3ick.')) {
    const { extract3iskStreamsAndEpisodes } = await import('./sites/3isk.mjs');
    const url = decodeRefUrl(refOrUrl, '3isk:');
    return sanitizeDetailsPayload(await extract3iskStreamsAndEpisodes(url), '3isk');
  }

  // 16. Alooy (AY)
  if (refOrUrl.startsWith('alooy:') || refOrUrl.includes('alooytv')) {
    const { extractAlooyStreamsAndEpisodes } = await import('./sites/alooy.mjs');
    const url = decodeRefUrl(refOrUrl, 'alooy:');
    return sanitizeDetailsPayload(await extractAlooyStreamsAndEpisodes(url), 'alooy');
  }

  // 17. Laroza (LZ / LA)
  if (refOrUrl.startsWith('laroza:') || refOrUrl.includes('laroza.') || refOrUrl.includes('larooza.')) {
    const { extractLarozaStreamsAndEpisodes } = await import('./sites/laroza.mjs');
    const url = decodeRefUrl(refOrUrl, 'laroza:');
    return sanitizeDetailsPayload(await extractLarozaStreamsAndEpisodes(url), 'laroza');
  }

  return null;
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
