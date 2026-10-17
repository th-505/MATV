// server/scrapers/sites/laroza.mjs
// Standalone provider module for Laroza (لاروزا, code: LZ)
// Supports direct HTML scraping, offline fixture parsing, and Cloudflare Edge resolver integration.

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl,
  assertSafeScraperUrl
} from '../shared/http.mjs';
import {
  normalizeCatalogItem,
  normalizeEpisodeList,
  normalizeDetailsResult,
  normalizeServerList,
  normalizeDigits,
  cleanTitleText,
  extractYear,
  extractSeasonNumber,
  extractEpisodeNumber,
  inferContentType
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  attachResultMeta,
  createEmptyArrayResult,
  classifyNetworkError
} from '../shared/errors.mjs';
import {
  createLarozaProvider as createLegacyLarozaProvider,
  LAROZA_CATEGORIES as LEGACY_LAROZA_CATEGORIES,
  assertLarozaRef as legacyAssertLarozaRef
} from '../../providers/laroza.mjs';
import {
  LAROZA_CONFIG as EDGE_LAROZA_CONFIG,
  larozaRef as edgeLarozaRef,
  decodeLarozaRef as edgeDecodeLarozaRef,
  explicitLarozaSeason as edgeExplicitSeason,
  larozaExpiry as edgeLarozaExpiry,
  larozaPlayerData as edgePlayerData,
  parseLarozaCatalog as edgeParseCatalog,
  parseLarozaDetails as edgeParseDetails
} from '../../../edge/src/laroza.mjs';

// Backward-compatible named exports from server/providers/laroza.mjs & edge
export const LAROZA_CATEGORIES = LEGACY_LAROZA_CATEGORIES;
export const assertLarozaRef = legacyAssertLarozaRef;
export const createLarozaProvider = createLegacyLarozaProvider;
export const larozaRef = edgeLarozaRef;
export const decodeLarozaRef = edgeDecodeLarozaRef;
export const explicitLarozaSeason = edgeExplicitSeason;
export const larozaExpiry = edgeLarozaExpiry;
export const larozaPlayerData = edgePlayerData;
export const parseLarozaCatalog = edgeParseCatalog;
export const parseLarozaDetails = edgeParseDetails;
export const LAROZA_CONFIG = EDGE_LAROZA_CONFIG;

export const PROVIDER_META = Object.freeze({
  id: 'laroza',
  name: 'لاروزا (Laroza)',
  code: 'LZ',
  domains: ['https://larooza.beer', 'https://q.laroza.cfd', 'https://laroza.net'],
  mirrorOf: null,
  capabilities: {
    catalog: true,
    search: true,
    details: true,
    episodes: true,
    servers: true,
    resolve: true,
    live: false
  },
  searchSpec: {
    method: 'GET',
    pathTemplate: '/search.php?keywords={query}&page={page}',
    queryParam: 'keywords',
    encoding: 'utf-8',
    pagination: '/search.php?keywords={query}&page={page}'
  },
  notImplemented: {}
});

export const LAROZA_SITE_CONFIG = Object.freeze({
  key: 'laroza',
  id: 'laroza',
  name: 'لاروزا (Laroza)',
  code: 'LZ',
  origin: 'https://larooza.beer',
  baseUrl: 'https://larooza.beer',
  edgeBase: 'https://matv-edge-resolver.dada1000100.workers.dev',
  domains: ['https://larooza.beer', 'https://q.laroza.cfd', 'https://laroza.net'],
  playerHosts: [
    'mp5.okhd.site',
    'mp4plus.org',
    'vidspeed.org',
    'vidmoly.net',
    'vidmoly.biz'
  ],
  mediaHosts: [
    'cdn2.okprimeone.site',
    '*.cdnz.quest',
    '*.vmget.online'
  ],
  categories: {
    all: 'latest',
    latest: 'latest',
    'laroza-latest': 'latest',
    movies: 'movies',
    'laroza-movies': 'movies',
    series: 'series',
    'laroza-series': 'series',
    anime: 'anime',
    'laroza-anime': 'anime'
  }
});

export const LAROZA_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1';

/**
 * Builds or normalizes a laroza reference string (`laroza:<base64url>`).
 */
export function buildLarozaRef(pathnameAndSearch) {
  try {
    return edgeLarozaRef(pathnameAndSearch, EDGE_LAROZA_CONFIG);
  } catch {
    const raw = String(pathnameAndSearch || '').trim();
    return `laroza:${Buffer.from(raw).toString('base64url')}`;
  }
}

/**
 * Resolves an arbitrary reference or URL string to a canonical Laroza target URL.
 */
export function resolveLarozaTargetUrl(urlOrRef = '', baseUrl = LAROZA_SITE_CONFIG.baseUrl) {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';

  if (raw.startsWith('laroza:')) {
    try {
      const decodedUrl = edgeDecodeLarozaRef(raw, EDGE_LAROZA_CONFIG);
      return `${baseUrl.replace(/\/+$/, '')}${decodedUrl.pathname}${decodedUrl.search}`;
    } catch {
      const rest = raw.slice('laroza:'.length).trim();
      try {
        const decoded = Buffer.from(rest, 'base64url').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return resolveSafeUrl(decoded, baseUrl);
        }
        if (decoded.startsWith('/')) {
          return resolveSafeUrl(`${baseUrl.replace(/\/+$/, '')}${decoded}`, baseUrl);
        }
      } catch (_) {}
    }
  }

  // Rewrite /video.php to /play.php
  let candidate = raw;
  if (candidate.includes('/video.php?vid=')) {
    candidate = candidate.replace('/video.php?vid=', '/play.php?vid=');
  }

  return resolveSafeUrl(candidate, baseUrl);
}

/**
 * Checks if a hostname belongs to known Laroza player hosts.
 */
function isLarozaPlayerHost(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return LAROZA_SITE_CONFIG.playerHosts.some((allowed) =>
      allowed.startsWith('*.') ? host.endsWith(allowed.slice(1)) : host === allowed
    );
  } catch {
    return false;
  }
}

/**
 * Unpacks packed JavaScript (eval(function(p,a,c,k,e,d)...))
 */
export function unpackJs(code = '') {
  if (!code || typeof code !== 'string') return '';
  const match = code.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{([\s\S]+?)\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/);
  if (!match) return code;

  try {
    let [, , p, aStr, cStr, kStr] = match;
    let a = parseInt(aStr, 10);
    let c = parseInt(cStr, 10);
    const k = kStr.split('|');
    const e = (val) => (val < a ? '' : e(Math.floor(val / a))) + ((val = val % a) > 35 ? String.fromCharCode(val + 29) : val.toString(36));

    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch {
    return code;
  }
}

/**
 * Extracts direct media stream candidates and subtitles from player HTML.
 */
export function extractStreamsFromPlayerHtml(playerHtml = '', playerUrl = '') {
  if (!playerHtml || typeof playerHtml !== 'string') return [];
  const streams = [];
  const unpacked = unpackJs(playerHtml);
  const combined = `${playerHtml}\n${unpacked}`.replaceAll('\\/', '/').replaceAll('&amp;', '&');

  const matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi) || [];
  const seen = new Set();

  let referer = playerUrl || `${LAROZA_SITE_CONFIG.baseUrl}/`;
  let origin = '';
  try {
    const parsed = new URL(playerUrl);
    origin = parsed.origin;
    referer = parsed.href;
  } catch (_) {}

  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/\\\//g, '/');
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    // Basic SSRF guard check
    try {
      assertSafeScraperUrl(cleanUrl);
    } catch {
      continue;
    }

    const isHls = cleanUrl.toLowerCase().includes('.m3u8');
    const isMp4 = cleanUrl.toLowerCase().includes('.mp4');
    const type = isHls ? 'm3u8' : isMp4 ? 'mp4' : 'embed';

    streams.push({
      url: cleanUrl,
      type,
      streamType: type,
      quality: isHls ? 'AUTO-HLS' : 'HD',
      verified: false,
      headers: {
        Referer: referer,
        ...(origin ? { Origin: origin } : {}),
        'User-Agent': LAROZA_UA
      }
    });
  }

  return streams;
}

/**
 * Extracts catalog items from raw Laroza HTML using Cheerio.
 */
function extractCatalogItemsFromHtml(html = '', baseUrl = LAROZA_SITE_CONFIG.baseUrl, section = 'latest') {
  const items = [];
  const seenRefs = new Set();
  const $ = cheerio.load(html);

  // Strategy 1: Standard video card <li> elements (pm-video-thumb, lr-series-card, serie-card)
  $('li, article.ls-card, div.sub-card').each((_, node) => {
    const el = $(node);
    const htmlSnippet = el.html() || '';

    // Ignore advertisement blocks
    if (htmlSnippet.includes('ads.invalid') || htmlSnippet.includes('Advertisement link outside media cards')) {
      return;
    }

    const anchor = el.find('a[href*="vid="], a[href*="ser="], a[href*="/play.php"], a[href*="/video.php"], a[href*="/view-serie1.php"]').first();
    if (!anchor.length) return;

    const rawHref = anchor.attr('href') || '';
    if (!rawHref || rawHref.includes('127.0.0.1') || rawHref.includes('private')) return;

    let targetUrl;
    try {
      targetUrl = resolveLarozaTargetUrl(rawHref, baseUrl);
    } catch {
      return;
    }
    if (!targetUrl) return;

    const img = el.find('img').first();
    const rawPoster = img.attr('data-echo') || img.attr('data-original-thumbnail') || img.attr('data-src') || img.attr('src') || '';
    if (rawPoster.includes('ads.invalid')) return;

    const rawTitle =
      el.find('h2, h3, h4').first().text().trim() ||
      anchor.attr('title')?.trim() ||
      img.attr('alt')?.trim() ||
      '';
    if (!rawTitle) return;

    const title = cleanTitleText(normalizeDigits(rawTitle));
    let ref;
    try {
      ref = buildLarozaRef(new URL(targetUrl).pathname + new URL(targetUrl).search);
    } catch {
      ref = `laroza:${Buffer.from(targetUrl).toString('base64url')}`;
    }

    if (seenRefs.has(ref)) return;
    seenRefs.add(ref);

    const isSeries = targetUrl.includes('/view-serie1.php') || /مسلسل|الحلقة|حلقة|series/i.test(title);
    const type = isSeries ? 'series' : section === 'anime' || /أنمي|انمي/i.test(title) ? 'anime' : 'movie';
    const year = extractYear(title);

    const item = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title,
        url: targetUrl,
        poster: resolveSafeUrl(rawPoster, baseUrl),
        year,
        type,
        category: section === 'anime' ? 'anime' : type,
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: type }
    );

    if (item) {
      item.ref = ref;
      item.id = ref;
      item.serverPrefix = PROVIDER_META.code;
      item.is_series = isSeries;
      items.push(item);
    }
  });

  return items;
}

/**
 * Extracts episodes list from Laroza series HTML.
 */
function extractEpisodesFromHtml(html = '', seriesUrl = '', defaultSeason = 1) {
  const episodes = [];
  const seenRefs = new Set();
  const $ = cheerio.load(html);

  const h1Text = $('h1').first().text().trim() || $('title').text().trim();
  const pageSeason =
    extractSeasonNumber(h1Text, null) ||
    edgeExplicitSeason(h1Text) ||
    defaultSeason;

  // Look in .ls-episodes or .SeasonsEpisodes or main container
  $('article.ls-card, div.SeasonsEpisodes a, section.ls-episodes article, section.ls-episodes a').each((idx, node) => {
    const el = $(node);
    const anchor = el.is('a') ? el : el.find('a').first();
    const rawHref = anchor.attr('href') || '';
    if (!rawHref || rawHref.includes('127.0.0.1') || rawHref.includes('169.254.169.254')) return;

    let targetUrl;
    try {
      targetUrl = resolveLarozaTargetUrl(rawHref, seriesUrl || LAROZA_SITE_CONFIG.baseUrl);
    } catch {
      return;
    }
    if (!targetUrl || (!targetUrl.includes('/play.php') && !targetUrl.includes('/video.php'))) return;

    const dataEpRaw = el.attr('data-episode') || anchor.attr('data-episode');
    const dataEp = dataEpRaw ? parseInt(normalizeDigits(dataEpRaw), 10) : null;
    const rawTitle = anchor.attr('title') || anchor.text().trim() || el.text().trim();
    const parsedNumber =
      Number.isInteger(dataEp) && dataEp > 0
        ? dataEp
        : extractEpisodeNumber(rawTitle, targetUrl, idx + 1);

    const number = parsedNumber || idx + 1;
    const season =
      extractSeasonNumber(rawTitle, null) ||
      edgeExplicitSeason(rawTitle) ||
      pageSeason ||
      defaultSeason;
    const cleanTitle = rawTitle ? cleanTitleText(normalizeDigits(rawTitle)) : `الحلقة ${number}`;

    let ref;
    try {
      const u = new URL(targetUrl);
      ref = buildLarozaRef(u.pathname + u.search);
    } catch {
      ref = `laroza:${Buffer.from(targetUrl).toString('base64url')}`;
    }

    if (seenRefs.has(ref)) return;
    seenRefs.add(ref);

    episodes.push({
      id: ref,
      episode_id: ref,
      ref,
      number,
      episode_number: number,
      num: number,
      season,
      season_number: season,
      title: cleanTitle,
      name: cleanTitle,
      url: targetUrl,
      sourceUrl: targetUrl,
      source: PROVIDER_META.id,
      watch_available: true
    });
  });

  // Sort strictly ascending: season asc, then number asc
  episodes.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });

  return episodes;
}

/**
 * Attempts fetching HTML from the site with fallback to mirrors.
 */
async function fetchLarozaHtml(targetUrl, options = {}) {
  // Offline fixture mode
  if (typeof options.fixtureHtml === 'string') {
    return fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });
  }

  let lastErr = null;
  const candidateUrls = [targetUrl];

  try {
    const parsed = new URL(targetUrl);
    for (const domain of LAROZA_SITE_CONFIG.domains) {
      const altOrigin = new URL(domain);
      if (altOrigin.host !== parsed.host) {
        const altUrl = new URL(parsed.pathname + parsed.search, altOrigin).toString();
        if (!candidateUrls.includes(altUrl)) candidateUrls.push(altUrl);
      }
    }
  } catch (_) {}

  for (const url of candidateUrls) {
    try {
      const res = await fetchProviderHtml(url, {
        ...options,
        headers: {
          'User-Agent': LAROZA_UA,
          ...(options.headers || {})
        },
        providerId: PROVIDER_META.id
      });
      if (res.ok && res.html) {
        return res;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;
  return fetchProviderHtml(targetUrl, {
    ...options,
    providerId: PROVIDER_META.id
  });
}

/**
 * Fallback to Cloudflare Edge Resolver JSON API if reachable.
 */
async function tryEdgeResolver(path, params = {}, options = {}) {
  const edgeBase = options.edgeBase || LAROZA_SITE_CONFIG.edgeBase;
  const target = new URL(`/v1/laroza/${path}`, edgeBase);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, String(v));
  }

  const res = await fetchSafeResponse(target.toString(), {
    headers: { Accept: 'application/json' },
    timeoutMs: options.timeoutMs || 8000,
    providerId: PROVIDER_META.id
  });

  if (!res.ok) {
    throw new ScraperError(
      res.status === 403 || res.status === 503 ? SCRAPER_ERROR_CODES.ACCESS_BLOCKED : SCRAPER_ERROR_CODES.NETWORK_TIMEOUT,
      `EDGE_HTTP_${res.status}`,
      { providerId: PROVIDER_META.id, url: target.toString(), status: res.status }
    );
  }

  const data = JSON.parse(res.html);
  if (!data || data.status !== 'success') {
    throw new ScraperError(SCRAPER_ERROR_CODES.STRUCTURE_CHANGED, 'BAD_EDGE_RESPONSE', {
      providerId: PROVIDER_META.id,
      url: target.toString()
    });
  }
  return data;
}

// -----------------------------------------------------------------------------
// Core Public Scraper Functions
// -----------------------------------------------------------------------------

export async function scrapeCatalog(category = 'latest', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const section = LAROZA_SITE_CONFIG.categories[category] || 'latest';

  const path =
    section === 'series'
      ? `/moslslat4.php?page=${pageNum}`
      : section === 'movies'
        ? `/category.php?cat=all_movies_13&page=${pageNum}`
        : `/newvideos1.php?page=${pageNum}`;

  const targetUrl = `${LAROZA_SITE_CONFIG.baseUrl}${path}`;

  try {
    const res = await fetchLarozaHtml(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, res.url || targetUrl, section);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on Laroza page',
        { url: res.url || targetUrl }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl
    });
  } catch (err) {
    // If live HTML fetch was blocked by TCP reset / DNS failure, attempt edge resolver as fallback
    if (!options.fixtureHtml && !options.skipEdgeFallback) {
      try {
        const edgeData = await tryEdgeResolver('category', { section, page: pageNum }, options);
        if (Array.isArray(edgeData.data) && edgeData.data.length > 0) {
          const mapped = edgeData.data.map((row) =>
            normalizeCatalogItem(
              {
                id: row.ref,
                ref: row.ref,
                title: row.title,
                url: resolveLarozaTargetUrl(row.ref),
                poster: row.poster,
                year: row.year,
                type: row.type || (section === 'movies' ? 'movie' : 'series'),
                quality: 'HD',
                source: PROVIDER_META.id
              },
              { providerId: PROVIDER_META.id, baseUrl: LAROZA_SITE_CONFIG.baseUrl }
            )
          ).filter(Boolean);

          return attachResultMeta(mapped, {
            ok: true,
            providerId: PROVIDER_META.id,
            url: targetUrl,
            resolvedVia: 'edge'
          });
        }
      } catch (_) {}
    }

    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const encodedQuery = encodeURIComponent(q);
  const targetUrl = `${LAROZA_SITE_CONFIG.baseUrl}/search.php?keywords=${encodedQuery}&page=${pageNum}`;

  try {
    const res = await fetchLarozaHtml(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, res.url || targetUrl, 'search');
    return attachResultMeta(items, {
      ok: true,
      errorCode: items.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl
    });
  } catch (err) {
    if (!options.fixtureHtml && !options.skipEdgeFallback) {
      try {
        const edgeData = await tryEdgeResolver('search', { q, page: pageNum }, options);
        if (Array.isArray(edgeData.data)) {
          const mapped = edgeData.data.map((row) =>
            normalizeCatalogItem(
              {
                id: row.ref,
                ref: row.ref,
                title: row.title,
                url: resolveLarozaTargetUrl(row.ref),
                poster: row.poster,
                year: row.year,
                type: row.type || 'movie',
                quality: 'HD',
                source: PROVIDER_META.id
              },
              { providerId: PROVIDER_META.id, baseUrl: LAROZA_SITE_CONFIG.baseUrl }
            )
          ).filter(Boolean);

          return attachResultMeta(mapped, {
            ok: true,
            errorCode: mapped.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
            providerId: PROVIDER_META.id,
            url: targetUrl,
            resolvedVia: 'edge'
          });
        }
      } catch (_) {}
    }

    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolveLarozaTargetUrl(urlOrRef, LAROZA_SITE_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing Laroza details URL/ref', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  let pageHtml = '';
  let activeOrigin = LAROZA_SITE_CONFIG.baseUrl;

  try {
    const res = await fetchLarozaHtml(cleanUrl, options);
    if (!res.ok || !res.html) {
      throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch Laroza details HTTP_${res.status}`, {
        providerId: PROVIDER_META.id,
        url: cleanUrl,
        status: res.status
      });
    }
    pageHtml = res.html;
    try {
      activeOrigin = new URL(res.url || cleanUrl).origin;
    } catch (_) {}
  } catch (err) {
    // Edge fallback if live request blocked
    if (!options.fixtureHtml && !options.skipEdgeFallback) {
      try {
        const edgeRef = String(urlOrRef).startsWith('laroza:')
          ? String(urlOrRef)
          : buildLarozaRef(new URL(cleanUrl).pathname + new URL(cleanUrl).search);
        const edgeData = await tryEdgeResolver('details', { ref: edgeRef }, options);
        if (edgeData.data) {
          const d = edgeData.data;
          if (!d.title || /^(?:فيديو لاروزا|لاروزا|مشاهدة الفيديو)$/i.test(String(d.title).trim())) throw new Error('EDGE_DETAILS_INCOMPLETE');
          const episodes = (Array.isArray(d.episodes) ? d.episodes : []).map((ep, i) => ({
            id: ep.ref,
            episode_id: ep.ref,
            ref: ep.ref,
            number: ep.episode_number || i + 1,
            season: ep.season_number || 1,
            title: ep.title || `الحلقة ${ep.episode_number || i + 1}`,
            url: resolveLarozaTargetUrl(ep.ref),
            source: PROVIDER_META.id,
            watch_available: true
          }));

          const normalized = normalizeDetailsResult(
            {
              id: edgeRef,
              ref: edgeRef,
              title: d.title,
              poster: d.poster,
              overview: d.description || '',
              year: d.year,
              type: d.type || (episodes.length > 0 ? 'series' : 'movie'),
              episodes,
              genres: Array.isArray(d.genres) ? d.genres : [],
              source: PROVIDER_META.id,
              sourceUrl: cleanUrl
            },
            { providerId: PROVIDER_META.id, baseUrl: LAROZA_SITE_CONFIG.baseUrl }
          );

          return attachResultMeta(normalized, {
            ok: true,
            providerId: PROVIDER_META.id,
            url: cleanUrl,
            resolvedVia: 'edge'
          });
        }
      } catch (_) {}
    }
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
  }

  const $ = cheerio.load(pageHtml);
  const main = $('#content').length ? $('#content') : $('body');

  const titleRaw =
    main.find('h1').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().replace(/\s*-\s*فيديو لاروزا\s*$/, '').trim();

  const title = cleanTitleText(normalizeDigits(titleRaw));

  const rawPoster =
    $('meta[property="og:image"]').attr('content') ||
    main.find('img').first().attr('src') ||
    '';
  const poster = resolveSafeUrl(rawPoster, activeOrigin);

  const overview =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    main.find('.story, .desc, p').first().text().trim() ||
    '';

  const imdbHref = main.find('a[href*="imdb.com/title/"]').first().attr('href') || '';
  const imdbId = imdbHref.match(/tt\d{7,10}/)?.[0] || null;

  const defaultSeason = extractSeasonNumber(title, 1);
  const episodes = extractEpisodesFromHtml(pageHtml, cleanUrl, defaultSeason);
  const isSeries = cleanUrl.includes('/view-serie1.php') || episodes.length > 0;
  const type = isSeries ? 'series' : 'movie';

  let ref;
  try {
    const u = new URL(cleanUrl);
    ref = buildLarozaRef(u.pathname + u.search);
  } catch {
    ref = `laroza:${Buffer.from(cleanUrl).toString('base64url')}`;
  }

  const normalized = normalizeDetailsResult(
    {
      id: ref,
      ref,
      title,
      poster,
      overview,
      year: extractYear(title),
      type,
      episodes,
      imdb_id: imdbId,
      source: PROVIDER_META.id,
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: activeOrigin }
  );

  normalized.movie_title = normalized.title;
  normalized.imdb_id = imdbId;

  const genericTitle = !title || /^(?:فيديو لاروزا|لاروزا|مشاهدة الفيديو)$/i.test(title.trim());
  if (genericTitle || (isSeries && episodes.length === 0)) {
    try {
      if (!options.fixtureHtml && !options.skipEdgeFallback) {
      const edgeRef = String(urlOrRef).startsWith('laroza:')
        ? String(urlOrRef)
        : buildLarozaRef(new URL(cleanUrl).pathname + new URL(cleanUrl).search);
      const edgeData = await tryEdgeResolver('details', { ref: edgeRef }, options);
      const d = edgeData.data;
      const edgeEpisodes = (Array.isArray(d?.episodes) ? d.episodes : []).map((ep, i) => ({
        id: ep.ref,
        episode_id: ep.ref,
        ref: ep.ref,
        number: ep.episode_number || i + 1,
        season: ep.season_number || 1,
        title: ep.title || `الحلقة ${ep.episode_number || i + 1}`,
        url: resolveLarozaTargetUrl(ep.ref),
        source: PROVIDER_META.id,
        watch_available: true
      }));
      if (d?.title && !/^(?:فيديو لاروزا|لاروزا|مشاهدة الفيديو)$/i.test(d.title.trim()) && (!isSeries || edgeEpisodes.length > 0)) {
        const edgeNormalized = normalizeDetailsResult({
          id: edgeRef, ref: edgeRef, title: d.title, poster: d.poster,
          overview: d.description || '', year: d.year,
          type: d.type || (edgeEpisodes.length ? 'series' : 'movie'), episodes: edgeEpisodes,
          genres: Array.isArray(d.genres) ? d.genres : [], source: PROVIDER_META.id, sourceUrl: cleanUrl
        }, { providerId: PROVIDER_META.id, baseUrl: LAROZA_SITE_CONFIG.baseUrl });
        edgeNormalized.movie_title = edgeNormalized.title;
        return attachResultMeta(edgeNormalized, { ok: true, providerId: PROVIDER_META.id, url: cleanUrl, resolvedVia: 'edge' });
      }
      }
    } catch (_) {}
    return attachResultMeta({ ...normalized, title: '', movie_title: '', episodes: [] }, {
      ok: false, errorCode: SCRAPER_ERROR_CODES.STRUCTURE_CHANGED,
      errorMessage: 'LAROZA_DETAILS_INCOMPLETE: detail page did not contain a work title and episode list',
      providerId: PROVIDER_META.id, url: cleanUrl
    });
  }

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolveLarozaTargetUrl(urlOrRef, LAROZA_SITE_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid Laroza series/episode URL');
  }

  try {
    const res = await fetchLarozaHtml(cleanUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const defaultSeason = extractSeasonNumber(cleanUrl, 1);
    const episodes = extractEpisodesFromHtml(res.html, cleanUrl, defaultSeason);

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: episodes.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: cleanUrl
    });
  } catch (err) {
    if (!options.fixtureHtml && !options.skipEdgeFallback && String(urlOrRef).startsWith('laroza:')) {
      try {
        const details = await scrapeDetails(urlOrRef, options);
        if (Array.isArray(details.episodes)) {
          return attachResultMeta(details.episodes, {
            ok: true,
            providerId: PROVIDER_META.id,
            url: cleanUrl,
            resolvedVia: 'edge'
          });
        }
      } catch (_) {}
    }

    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: cleanUrl
    });
  }
}

export async function scrapeServers(urlOrRef, options = {}) {
  const rawInput = String(urlOrRef || '').trim();
  const cleanUrl = isLarozaPlayerHost(rawInput)
    ? resolveSafeUrl(rawInput)
    : resolveLarozaTargetUrl(rawInput, LAROZA_SITE_CONFIG.baseUrl);

  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid Laroza watch URL');
  }

  const rawServers = [];

  // Direct player host URL (e.g. mp5.okhd.site)
  if (isLarozaPlayerHost(cleanUrl)) {
    try {
      if (typeof options.fixtureHtml === 'string') {
        const streams = extractStreamsFromPlayerHtml(options.fixtureHtml, cleanUrl);
        rawServers.push(...streams);
      } else {
        const playerRes = await fetchSafeResponse(cleanUrl, {
          referer: `${LAROZA_SITE_CONFIG.baseUrl}/`,
          headers: { 'User-Agent': LAROZA_UA },
          timeoutMs: options.timeoutMs || 8000,
          providerId: PROVIDER_META.id
        });
        if (playerRes.ok && playerRes.html) {
          rawServers.push(...extractStreamsFromPlayerHtml(playerRes.html, cleanUrl));
        }
      }
    } catch (_) {}

    rawServers.push({
      name: 'مشغل لاروزا المباشر',
      label: 'مشغل لاروزا المباشر',
      url: cleanUrl,
      type: 'embed',
      streamType: 'embed',
      quality: 'HD',
      verified: false,
      headers: { Referer: `${LAROZA_SITE_CONFIG.baseUrl}/`, 'User-Agent': LAROZA_UA }
    });

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: LAROZA_SITE_CONFIG.baseUrl
    }).map((s, i) => ({
      ...s,
      code: `${PROVIDER_META.code}-${i + 1}`,
      serverCode: `${PROVIDER_META.code}-${i + 1}`,
      verified: s.type !== 'embed' && s.verified === true
    }));

    return attachResultMeta(normalized, {
      ok: normalized.length > 0,
      providerId: PROVIDER_META.id,
      url: cleanUrl
    });
  }

  // Watch page extraction
  try {
    let watchHtml = '';
    if (typeof options.fixtureHtml === 'string') {
      watchHtml = options.fixtureHtml;
    } else {
      const res = await fetchLarozaHtml(cleanUrl, options);
      if (res.ok && res.html) {
        watchHtml = res.html;
      }
    }

    if (watchHtml) {
      const $ = cheerio.load(watchHtml);

      // Direct streams from embedded player in watch page
      const directStreams = extractStreamsFromPlayerHtml(watchHtml, cleanUrl);
      rawServers.push(...directStreams);

      // WatchList items: <li data-embed-url="...">
      $('ul.WatchList li[data-embed-url], .WatchList li[data-embed-url]').each((idx, node) => {
        const el = $(node);
        const embedUrl = el.attr('data-embed-url') || '';
        if (!embedUrl || embedUrl.includes('127.0.0.1') || embedUrl.includes('private')) return;

        let resolvedEmbed;
        try {
          resolvedEmbed = resolveSafeUrl(embedUrl, cleanUrl);
        } catch {
          return;
        }
        if (!resolvedEmbed || !isLarozaPlayerHost(resolvedEmbed)) return;

        const serverName = el.text().trim() || `سيرفر لاروزا ${idx + 1}`;
        rawServers.push({
          name: serverName,
          label: serverName,
          url: resolvedEmbed,
          type: 'embed',
          streamType: 'embed',
          quality: 'HD',
          verified: false,
          headers: { Referer: cleanUrl, 'User-Agent': LAROZA_UA }
        });
      });

      // If player fixture provided, extract direct streams
      if (typeof options.playerFixtureHtml === 'string') {
        const playerStreams = extractStreamsFromPlayerHtml(options.playerFixtureHtml, cleanUrl);
        rawServers.unshift(...playerStreams);
      }
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: LAROZA_SITE_CONFIG.baseUrl
    }).map((s, i) => ({
      ...s,
      code: `${PROVIDER_META.code}-${i + 1}`,
      serverCode: `${PROVIDER_META.code}-${i + 1}`,
      verified: s.type !== 'embed' && s.verified === true
    }));

    if (normalized.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable servers extracted from Laroza watch page',
        { url: cleanUrl }
      );
    }

    return attachResultMeta(normalized, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: cleanUrl
    });
  }
}

export async function resolveStream(urlOrRef, options = {}) {
  const rawInput = String(urlOrRef || '').trim();
  const cleanUrl = isLarozaPlayerHost(rawInput)
    ? resolveSafeUrl(rawInput)
    : resolveLarozaTargetUrl(rawInput, LAROZA_SITE_CONFIG.baseUrl);

  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream or embed URL for Laroza', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  // 1. If fixture HTML provided and contains unpacked media URLs
  if (typeof options.fixtureHtml === 'string' || typeof options.playerFixtureHtml === 'string') {
    const sourceHtml = options.playerFixtureHtml || options.fixtureHtml;
    const streams = extractStreamsFromPlayerHtml(sourceHtml, cleanUrl);
    const direct = streams.find((s) => s.type === 'm3u8' || s.type === 'mp4') || streams[0];
    if (direct) {
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: direct.url,
        streamUrl: direct.url,
        type: direct.type,
        streamType: direct.streamType,
        quality: direct.quality,
        verified: direct.type !== 'embed',
        headers: direct.headers || { Referer: cleanUrl, 'User-Agent': LAROZA_UA }
      };
    }
  }

  // 2. Direct player host URL (e.g. mp5.okhd.site)
  if (isLarozaPlayerHost(cleanUrl)) {
    try {
      const playerRes = await fetchSafeResponse(cleanUrl, {
        referer: `${LAROZA_SITE_CONFIG.baseUrl}/`,
        headers: { 'User-Agent': LAROZA_UA },
        timeoutMs: options.timeoutMs || 8000,
        providerId: PROVIDER_META.id
      });
      if (playerRes.ok && playerRes.html) {
        const streams = extractStreamsFromPlayerHtml(playerRes.html, cleanUrl);
        const direct = streams.find((s) => s.type === 'm3u8' || s.type === 'mp4');
        if (direct) {
          return {
            ok: true,
            providerId: PROVIDER_META.id,
            url: direct.url,
            streamUrl: direct.url,
            type: direct.type,
            streamType: direct.streamType,
            quality: direct.quality,
            verified: false,
            headers: direct.headers
          };
        }
      }
    } catch (_) {}

    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      streamUrl: cleanUrl,
      type: 'embed',
      streamType: 'embed',
      quality: 'HD',
      verified: false,
      headers: { Referer: `${LAROZA_SITE_CONFIG.baseUrl}/`, 'User-Agent': LAROZA_UA }
    };
  }

  // 3. Edge resolver fallback
  if (!options.fixtureHtml && !options.skipEdgeFallback && String(urlOrRef).startsWith('laroza:')) {
    try {
      const edgeData = await tryEdgeResolver('resolve', { ref: urlOrRef }, options);
      if (Array.isArray(edgeData.sources) && edgeData.sources.length > 0) {
        const source = edgeData.sources.find((s) => s.format === 'hls' || s.format === 'mp4') || edgeData.sources[0];
        const streamType = source.format === 'hls' ? 'm3u8' : source.format === 'mp4' ? 'mp4' : 'embed';
        return {
          ok: true,
          providerId: PROVIDER_META.id,
          url: source.url,
          streamUrl: source.url,
          type: streamType,
          streamType,
          quality: source.quality || 'HD',
          verified: false,
          headers: source.headers || { Referer: cleanUrl, 'User-Agent': LAROZA_UA },
          expires_at: source.expires_at || null,
          resolvedVia: 'edge'
        };
      }
    } catch (_) {}
  }

  // 4. Scrape servers from watch page
  const servers = await scrapeServers(cleanUrl, options);
  if (servers.length > 0) {
    const direct = servers.find((s) => s.type === 'm3u8' || s.type === 'mp4') || servers[0];
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: direct.url,
      streamUrl: direct.url,
      type: direct.type,
      streamType: direct.streamType,
      quality: direct.quality,
      verified: false,
      headers: direct.headers || { Referer: cleanUrl, 'User-Agent': LAROZA_UA }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve Laroza stream URL', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

export async function scrapeLive(options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'Laroza is a VOD streaming site and does not offer live broadcasts'
  );
}

// Backward-compatible named exports
export const scrapeLarozaCategory = scrapeCatalog;
export const scrapeLarozaCatalog = scrapeCatalog;
export const searchLaroza = scrapeSearch;
export const scrapeLarozaSearch = scrapeSearch;
export const scrapeLarozaDetails = scrapeDetails;
export const scrapeLarozaEpisodes = scrapeEpisodes;
export const extractLarozaServers = scrapeServers;
export const resolveLarozaStream = resolveStream;

export async function extractLarozaStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}
