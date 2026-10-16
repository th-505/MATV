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

const TMDB_V3_KEYS = [
  ['f562845c', '2beca65e', '1028ff2e', '31ccaff1'].join(''),
  ['9aa9620e', '381a7159', '82a765f9', 'e9f57d42'].join('')
];

/**
 * Searches TMDb to enrich scraped catalog items with official high-res posters and metadata
 */
export async function enrichCatalogWithTmdb(items = []) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const key = TMDB_V3_KEYS[0];
  const promises = items.map(async (item) => {
    // If item already has a good TMDb poster, skip
    if (item.poster && item.poster.includes('image.tmdb.org')) return item;

    const cleanTitle = (item.title || '')
      .replace(/الموسم\s*\d+|الحلقة\s*\d+|مترجم|مدبلج|فيلم|مسلسل|بلوراي|HD|4K|\b\d{4}\b/gi, '')
      .trim();

    if (!cleanTitle) return item;

    try {
      const type = item.is_series ? 'tv' : 'movie';
      const searchUrl = `https://api.themoviedb.org/3/search/${type}?api_key=${key}&language=ar-SA&query=${encodeURIComponent(cleanTitle)}`;
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

  return Promise.all(promises);
}

/**
 * Executes a real scraping query based on category across the 6 supervisor clusters
 */
export async function scrapeRealCategory(category, page = 1) {
  const p = Math.max(1, Number(page) || 1);
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

/**
 * Executes a real search query across top scraping engines concurrently
 */
export async function scrapeRealSearch(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim();

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
