// server/scrapers/sites/cimanow.mjs
// Standalone provider module for CimaNow (سيما ناو, code: CW)
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
  unwrapEmbedToDirectStreams
} from '../stream-unwrapper.mjs';
import { buildAntiBanHeaders } from '../anti-ban.mjs';

export const PROVIDER_META = Object.freeze({
  id: 'cimanow',
  name: 'سيما ناو (CimaNow)',
  code: 'CW',
  domains: [
    'https://cimanow.me',
    'https://cimanow.name',
    'https://vip.cimanowinc.com',
    'https://cimanow.cc',
    'https://cimanow.net',
    'https://cimanow.cam'
  ],
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
    pathTemplate: '/search?s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: '/search?s={query}&page={page}'
  },
  notImplemented: {}
});

export const CIMANOW_CONFIG = Object.freeze({
  key: 'cimanow',
  id: 'cimanow',
  name: 'سيما ناو (CimaNow)',
  code: 'CW',
  baseUrl: 'https://cimanow.me',
  domains: [
    'https://cimanow.me',
    'https://cimanow.name',
    'https://vip.cimanowinc.com',
    'https://cimanow.cc',
    'https://cimanow.net',
    'https://cimanow.cam'
  ],
  categories: {
    all: '/category/افلام-اجنبي',
    movies: '/category/افلام-اجنبي',
    movies_foreign: '/category/افلام-اجنبي',
    movies_arabic: '/category/افلام-عربي',
    movies_turkish: '/category/افلام-تركية',
    movies_indian: '/category/افلام-هندي',
    movies_asian: '/category/افلام-اسيوية',
    series: '/category/مسلسلات-اجنبي',
    series_foreign: '/category/مسلسلات-اجنبي',
    series_arabic: '/category/مسلسلات-عربي',
    series_turkish: '/category/مسلسلات-تركية',
    series_asian: '/category/مسلسلات-اسيوية',
    series_indian: '/category/مسلسلات-هندية',
    series_dubbed: '/category/مسلسلات-مدبلجة',
    anime_movies: '/category/افلام-انمي',
    anime_series: '/category/مسلسلات-انمي',
    ramadan: '/category/مسلسلات-رمضان-2026',
    tv_shows: '/category/برامج-تلفزيونية',
    wrestling: '/category/عروض-مصارعة'
  }
});

const ACTIVE_DOMAINS = [
  'https://cimanow.me',
  'https://cimanow.name',
  'https://vip.cimanowinc.com',
  'https://cimanow.net'
];

/**
 * Rewrites legacy or dead CimaNow mirror hostnames to the primary active domain.
 */
export function rewriteToActiveCimaNowDomain(rawUrl = '', preferredOrigin = CIMANOW_CONFIG.baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return `${preferredOrigin.replace(/\/+$/, '')}${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'vip.cimanowinc.com' ||
      host === 'cimanow.cc' ||
      host === 'cimanow.net' ||
      host === 'cimanow.cam' ||
      host === 'cimanow.name' ||
      host === 'cimanow.tv' ||
      host === 'cimanow.io' ||
      host === 'cimanow.vip' ||
      host.endsWith('.cimanowinc.com')
    ) {
      const targetOrigin = new URL(preferredOrigin);
      parsed.protocol = targetOrigin.protocol;
      parsed.host = targetOrigin.host;
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Decodes and normalizes a CimaNow URL or reference.
 */
export function resolveCimaNowTargetUrl(urlOrRef = '', baseUrl = CIMANOW_CONFIG.baseUrl) {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';

  if (raw.startsWith('cimanow:')) {
    const rest = raw.slice('cimanow:'.length).trim();
    if (rest.startsWith('http://') || rest.startsWith('https://') || rest.startsWith('/')) {
      return resolveSafeUrl(rewriteToActiveCimaNowDomain(rest, baseUrl), baseUrl);
    }
    try {
      const decoded = Buffer.from(rest, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
        return resolveSafeUrl(rewriteToActiveCimaNowDomain(decoded, baseUrl), baseUrl);
      }
    } catch (_) {}
    try {
      const decoded = Buffer.from(rest, 'base64').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
        return resolveSafeUrl(rewriteToActiveCimaNowDomain(decoded, baseUrl), baseUrl);
      }
    } catch (_) {}
  }

  const rewritten = rewriteToActiveCimaNowDomain(raw, baseUrl);
  return resolveSafeUrl(rewritten, baseUrl);
}

/**
 * Robust fetch with domain fallback and mandatory Referer / Anti-ban headers
 */
async function fetchCimaNowHtmlWithFallback(targetUrl, options = {}) {
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
    for (const domain of ACTIVE_DOMAINS) {
      const altOrigin = new URL(domain);
      if (altOrigin.host !== parsed.host) {
        const altUrl = new URL(parsed.pathname + parsed.search, altOrigin).toString();
        if (!candidateUrls.includes(altUrl)) candidateUrls.push(altUrl);
      }
    }
  } catch (_) {}

  for (const url of candidateUrls) {
    try {
      const origin = new URL(url).origin;
      const res = await fetchProviderHtml(url, {
        ...options,
        referer: origin + '/',
        headers: {
          ...buildAntiBanHeaders(url, origin + '/'),
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
 * Extracts catalog and search items from CimaNow HTML.
 * Handles both the modern Laravel frontend (`a.show-card`) and legacy WordPress theme (`section article a`).
 */
function extractCatalogItemsFromHtml(html = '', baseUrl = CIMANOW_CONFIG.baseUrl, defaultType = 'movie') {
  const items = [];
  const seenUrls = new Set();
  const $ = cheerio.load(html);

  // 1. Modern Laravel cards: `a.show-card`
  $('a.show-card').each((_, node) => {
    const anchor = $(node);
    const rawHref = anchor.attr('href') || '';
    const url = resolveCimaNowTargetUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;

    const img = anchor.find('img').first();
    const rawTitle =
      anchor.find('p.title').text().trim() ||
      anchor.attr('title')?.trim() ||
      img.attr('alt')?.trim() ||
      '';
    if (!rawTitle) return;

    const rawPoster =
      img.attr('data-src') ||
      img.attr('src') ||
      '';

    const categText = anchor.find('.categ').text().trim();
    const epBadge = anchor.find('.ep').text().trim();
    const rateText = anchor.find('.rate').text().replace(/[^\d.]/g, '').trim();

    let type = defaultType;
    if (url.includes('/episode/') || url.includes('/series/') || /مسلسل|حلقة|انمي/i.test(`${rawTitle} ${categText}`)) {
      type = 'series';
    } else if (url.includes('/film/') || /فيلم/i.test(`${rawTitle} ${categText}`)) {
      type = 'movie';
    } else {
      type = inferContentType(rawTitle, url, defaultType);
    }

    const ref = `cimanow:${Buffer.from(url).toString('base64url')}`;

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: rawTitle,
        url,
        poster: rewriteToActiveCimaNowDomain(rawPoster, baseUrl),
        year: extractYear(rawTitle),
        quality: 'HD',
        rating: rateText,
        type,
        category: categText || type,
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType }
    );

    if (normalized) {
      normalized.ref = ref;
      normalized.id = ref;
      normalized.is_series = type !== 'movie';
      normalized.serverPrefix = PROVIDER_META.code;
      seenUrls.add(url);
      items.push(normalized);
    }
  });

  // 2. Legacy WordPress cards: `section article a` or `article a`
  if (items.length === 0) {
    $('section article a, article a, .post-item a').each((_, node) => {
      const anchor = $(node);
      const rawHref = anchor.attr('href') || '';
      const url = resolveCimaNowTargetUrl(rawHref, baseUrl);
      if (!url || seenUrls.has(url)) return;

      const rawTitle =
        anchor.find('li[aria-label="title"]').text().replace(/<em>.*<\/em>/gi, '').trim() ||
        anchor.attr('title')?.trim() ||
        anchor.find('.title, h2, h3').text().trim() ||
        '';
      if (!rawTitle) return;

      const year =
        anchor.find('li[aria-label="year"]').text().trim() ||
        extractYear(rawTitle) ||
        '';

      const img = anchor.find('img').first();
      const rawPoster = img.attr('data-src') || img.attr('src') || '';

      const type = url.includes('/selary/') || /مسلسل|حلقة/i.test(rawTitle) ? 'series' : 'movie';
      const ref = `cimanow:${Buffer.from(url).toString('base64url')}`;

      const normalized = normalizeCatalogItem(
        {
          id: ref,
          ref,
          title: rawTitle,
          url,
          poster: rewriteToActiveCimaNowDomain(rawPoster, baseUrl),
          year,
          quality: 'HD',
          type,
          category: type,
          source: PROVIDER_META.id
        },
        { providerId: PROVIDER_META.id, baseUrl, defaultType }
      );

      if (normalized) {
        normalized.ref = ref;
        normalized.id = ref;
        normalized.is_series = type !== 'movie';
        normalized.serverPrefix = PROVIDER_META.code;
        seenUrls.add(url);
        items.push(normalized);
      }
    });
  }

  return items;
}

/**
 * Extracts episodes from CimaNow HTML.
 * Handles both modern `.episodes-grid a` / `a[href*="/episode/"]` and legacy `ul#eps li a`.
 * Strictly sorts ascending by season and episode number.
 */
function extractEpisodesFromHtml(html = '', baseUrl = CIMANOW_CONFIG.baseUrl, defaultSeason = 1) {
  const $ = cheerio.load(html);
  const rawEpisodes = [];
  const seenUrls = new Set();

  // 1. Modern episode grid / episode links
  $('a[href*="/episode/"], .episodes-grid a, .episodes-list a').each((idx, node) => {
    const anchor = $(node);
    const rawHref = anchor.attr('href') || '';
    const url = resolveCimaNowTargetUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const rawText = anchor.text().replace(/\s+/g, ' ').trim() || anchor.attr('title') || '';
    const epNum = extractEpisodeNumber(rawText, url, idx + 1);
    const season = extractSeasonNumber(url, defaultSeason);
    const title = rawText ? rawText : `الحلقة ${epNum}`;
    const ref = `cimanow:${Buffer.from(url).toString('base64url')}`;

    rawEpisodes.push({
      id: ref,
      ref,
      number: epNum,
      season,
      title,
      url
    });
  });

  // 2. Legacy `ul#eps li a`
  if (rawEpisodes.length === 0) {
    $('ul#eps li a').each((idx, node) => {
      const anchor = $(node);
      const rawHref = anchor.attr('href') || '';
      const url = resolveCimaNowTargetUrl(rawHref, baseUrl);
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);

      const emNum = parseInt(anchor.find('em').text().trim(), 10);
      const epNum = !Number.isNaN(emNum) && emNum > 0 ? emNum : extractEpisodeNumber(anchor.text(), url, idx + 1);
      const season = defaultSeason;
      const title = `الحلقة ${epNum}`;
      const ref = `cimanow:${Buffer.from(url).toString('base64url')}`;

      rawEpisodes.push({
        id: ref,
        ref,
        number: epNum,
        season,
        title,
        url
      });
    });
  }

  const normalized = normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });

  return normalized.map((ep) => {
    const ref = `cimanow:${Buffer.from(ep.url).toString('base64url')}`;
    return {
      ...ep,
      id: ref,
      episode_id: ref,
      ref,
      episodeNumber: ep.number,
      watch_available: true
    };
  });
}

/**
 * Resolves a server through the Laravel AJAX endpoint `POST /watch/resolve`
 */
async function resolveWatchApiServer(resolveUrl, key, index, csrfToken, cookies, refererUrl) {
  try {
    const res = await fetchSafeResponse(resolveUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': new URL(resolveUrl).origin
      },
      referer: refererUrl,
      cookies,
      body: JSON.stringify({ key, index }),
      timeoutMs: 8000,
      providerId: PROVIDER_META.id
    });
    if (res.ok && res.html) {
      const data = JSON.parse(res.html);
      if (data?.ok === true && typeof data.url === 'string' && data.url) {
        return data.url;
      }
    }
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------
// Primary Scraper API Implementation
// ---------------------------------------------------------------------

export async function scrapeCatalog(category = 'movies_foreign', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    CIMANOW_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : CIMANOW_CONFIG.categories.movies_foreign);

  const cleanSubPath = subPath.endsWith('/') ? subPath.slice(0, -1) : subPath;
  const targetUrl =
    pageNum > 1
      ? `${CIMANOW_CONFIG.baseUrl}${cleanSubPath}?page=${pageNum}`
      : `${CIMANOW_CONFIG.baseUrl}${cleanSubPath}`;

  const defaultType = /movie|film|افلام/i.test(`${category} ${cleanSubPath}`) ? 'movie' : 'series';

  try {
    const res = await fetchCimaNowHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return CIMANOW_CONFIG.baseUrl;
      }
    })();

    const items = extractCatalogItemsFromHtml(res.html, activeOrigin, defaultType);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on CimaNow page',
        { url: res.url || targetUrl }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl
    });
  } catch (err) {
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
  const encoded = encodeURIComponent(q);
  const targetUrl =
    pageNum > 1
      ? `${CIMANOW_CONFIG.baseUrl}/search?s=${encoded}&page=${pageNum}`
      : `${CIMANOW_CONFIG.baseUrl}/search?s=${encoded}`;

  try {
    const res = await fetchCimaNowHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return CIMANOW_CONFIG.baseUrl;
      }
    })();

    const items = extractCatalogItemsFromHtml(res.html, activeOrigin, 'movie');
    return attachResultMeta(items, {
      ok: true,
      errorCode: items.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolveCimaNowTargetUrl(urlOrRef, CIMANOW_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for CimaNow details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetchCimaNowHtmlWithFallback(cleanUrl, options);
  if (!res.ok || !res.html) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch CimaNow details HTTP_${res.status}`, {
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      status: res.status
    });
  }

  const activeOrigin = (() => {
    try {
      return new URL(res.url || cleanUrl).origin;
    } catch {
      return CIMANOW_CONFIG.baseUrl;
    }
  })();

  const $ = cheerio.load(res.html);

  const title =
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().replace(/- سيما ناو.*/i, '').trim() ||
    '';

  const rawPoster =
    $('meta[property="og:image"]').attr('content') ||
    $('.poster-image, .poster img, .movie-page img, .series-page img, img.image').first().attr('data-src') ||
    $('.poster-image, .poster img, .movie-page img, .series-page img, img.image').first().attr('src') ||
    '';
  const poster = rewriteToActiveCimaNowDomain(rawPoster, activeOrigin);

  const overview =
    $('.story p, .story, .overview, p.description').first().text().trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  const genres = [];
  $('a[href*="/genre/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const rating = $('.rate, span.rate').first().text().replace(/[^\d.]/g, '').trim();
  const year =
    $('a[href*="/release-year/"], .release-year').first().text().trim() ||
    extractYear(title);

  const defaultSeason = extractSeasonNumber(title, 1);
  const episodes = extractEpisodesFromHtml(res.html, activeOrigin, defaultSeason);
  const isMovie = cleanUrl.includes('/film/') || (episodes.length === 0 && !cleanUrl.includes('/episode/') && !cleanUrl.includes('/series/'));

  const ref = `cimanow:${Buffer.from(cleanUrl).toString('base64url')}`;

  const normalized = normalizeDetailsResult(
    {
      id: ref,
      ref,
      title,
      poster,
      overview,
      year,
      rating,
      quality: 'HD',
      genres,
      episodes,
      type: isMovie ? 'movie' : 'series',
      source: PROVIDER_META.id,
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: activeOrigin }
  );

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: res.url || cleanUrl
  });
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolveCimaNowTargetUrl(urlOrRef, CIMANOW_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid CimaNow series/episode URL');
  }

  try {
    const res = await fetchCimaNowHtmlWithFallback(cleanUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || cleanUrl).origin;
      } catch {
        return CIMANOW_CONFIG.baseUrl;
      }
    })();

    const $ = cheerio.load(res.html);
    const title = $('h1').first().text().trim();
    const defaultSeason = extractSeasonNumber(title, 1);
    const episodes = extractEpisodesFromHtml(res.html, activeOrigin, defaultSeason);

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: episodes.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: res.url || cleanUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: cleanUrl
    });
  }
}

export async function scrapeServers(urlOrRef, options = {}) {
  const cleanUrl = resolveCimaNowTargetUrl(urlOrRef, CIMANOW_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid CimaNow watch URL');
  }

  // Derive the /watch/ or /watching/ URL
  let watchUrl = cleanUrl;
  if (!watchUrl.includes('/watch/') && !watchUrl.includes('/watching/')) {
    if (watchUrl.includes('/film/')) {
      watchUrl = watchUrl.replace('/film/', '/watch/');
    } else if (watchUrl.includes('/episode/')) {
      watchUrl = watchUrl.replace('/episode/', '/watch/');
    } else {
      watchUrl = `${watchUrl.replace(/\/+$/, '')}/watching/`;
    }
  }

  try {
    const res = await fetchCimaNowHtmlWithFallback(watchUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: watchUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || watchUrl).origin;
      } catch {
        return CIMANOW_CONFIG.baseUrl;
      }
    })();

    const html = res.html;
    const $ = cheerio.load(html);
    const rawServers = [];
    const seenUrls = new Set();

    // 1. Direct iframe on watch page (e.g. data-src or src with /m/)
    $('iframe').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && !src.includes('facebook') && !src.includes('twitter')) {
        const fullUrl = resolveSafeUrl(src, activeOrigin);
        if (fullUrl && !seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          rawServers.push({
            name: 'سيرفر سيما ناو المباشر',
            label: 'سيرفر سيما ناو المباشر',
            url: fullUrl,
            type: fullUrl.includes('.m3u8') ? 'm3u8' : fullUrl.includes('.mp4') ? 'mp4' : 'embed',
            verified: false,
            headers: {
              Referer: `${activeOrigin}/`,
              'User-Agent': 'Mozilla/5.0'
            }
          });
        }
      }
    });

    // 2. Modern Laravel inline JS: `const servers = [...]` + `/watch/resolve`
    const serversMatch = html.match(/const\s+servers\s*=\s*(\[[^;]+\]);/);
    const keyMatch = html.match(/const\s+watchResolveKey\s*=\s*"([^"]+)";/);
    const csrfMatch = html.match(/const\s+csrfToken\s*=\s*"([^"]+)";/);
    const resolveUrlMatch = html.match(/const\s+resolveUrl\s*=\s*"([^"]+)";/);

    if (serversMatch) {
      try {
        const parsedServers = JSON.parse(serversMatch[1]);
        const key = keyMatch?.[1] || '';
        const csrfToken = csrfMatch?.[1] || '';
        const resolveUrl = (resolveUrlMatch?.[1] || `${activeOrigin}/watch/resolve`).replace(/\\\//g, '/');

        // Extract session cookies if live response headers exist
        let cookieHeader = '';
        if (res.headers) {
          if (typeof res.headers.getSetCookie === 'function') {
            cookieHeader = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
          } else if (typeof res.headers.get === 'function') {
            cookieHeader = (res.headers.get('set-cookie') || '').split(';')[0];
          }
        }

        // If offline fixture JSON response is supplied:
        if (typeof options.resolveFixtureJson === 'string') {
          try {
            const fixtureObj = JSON.parse(options.resolveFixtureJson);
            if (fixtureObj?.url) {
              const fullUrl = resolveSafeUrl(fixtureObj.url, activeOrigin);
              if (fullUrl && !seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                rawServers.push({
                  name: `سيرفر ${parsedServers[0]?.name || 'سيما ناو'}`,
                  label: `سيرفر ${parsedServers[0]?.name || 'سيما ناو'}`,
                  url: fullUrl,
                  type: fullUrl.includes('.m3u8') ? 'm3u8' : fullUrl.includes('.mp4') ? 'mp4' : 'embed',
                  verified: false,
                  headers: { Referer: `${activeOrigin}/` }
                });
              }
            }
          } catch (_) {}
        }

        for (let i = 0; i < parsedServers.length; i++) {
          const s = parsedServers[i];
          const sName = s.name || `Server ${i + 1}`;
          const placeholderUrl = `${activeOrigin}/watch/resolve#server=${encodeURIComponent(sName)}&index=${i}&key=${key}`;

          if (!seenUrls.has(placeholderUrl)) {
            seenUrls.add(placeholderUrl);
            rawServers.push({
              name: `سيرفر ${sName}`,
              label: `سيرفر ${sName}`,
              url: placeholderUrl,
              type: 'embed',
              verified: false,
              headers: { Referer: `${activeOrigin}/` }
            });
          }
        }
      } catch (_) {}
    }

    // 3. Download page servers: check `/download/`
    let downloadHtml = typeof options.downloadFixtureHtml === 'string' ? options.downloadFixtureHtml : null;
    if (!downloadHtml && !options.fixtureHtml) {
      try {
        const dlUrl = watchUrl.replace('/watch/', '/download/');
        const dlRes = await fetchSafeResponse(dlUrl, {
          referer: `${activeOrigin}/`,
          timeoutMs: 6000,
          providerId: PROVIDER_META.id
        });
        if (dlRes.ok && dlRes.html) {
          downloadHtml = dlRes.html;
        }
      } catch (_) {}
    }

    if (downloadHtml) {
      const $dl = cheerio.load(downloadHtml);
      $dl('a[href*="/m/"], .download-links a').each((_, el) => {
        const href = $dl(el).attr('href') || '';
        const fullUrl = resolveSafeUrl(href, activeOrigin);
        if (fullUrl && !seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          const txt = $dl(el).text().trim();
          const qMatch = txt.match(/(1080p|720p|480p|360p)/i);
          rawServers.push({
            name: `تحميل سيما ناو (${qMatch ? qMatch[1] : 'Direct'})`,
            label: `تحميل سيما ناو (${qMatch ? qMatch[1] : 'Direct'})`,
            url: fullUrl,
            quality: qMatch ? qMatch[1] : 'HD',
            type: 'mp4',
            verified: false,
            headers: { Referer: `${activeOrigin}/` }
          });
        }
      });
    }

    // 4. Legacy download & server.php support
    $('ul#download li a, ul[id="download"] a').each((_, el) => {
      const dlUrl = ($(el).attr('href') || '').trim();
      const qualityText = $(el).text().trim();
      const qMatch = qualityText.match(/(1080p|720p|480p|360p)/i);
      if (dlUrl && dlUrl.startsWith('http')) {
        const fullUrl = resolveSafeUrl(dlUrl, activeOrigin);
        if (fullUrl && !seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          rawServers.push({
            name: `تحميل مباشر (${qMatch ? qMatch[1] : 'Direct'})`,
            label: `تحميل مباشر (${qMatch ? qMatch[1] : 'Direct'})`,
            url: fullUrl,
            type: fullUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
            quality: qMatch ? qMatch[1] : 'HD',
            verified: false,
            headers: { Referer: `${activeOrigin}/` }
          });
        }
      }
    });

    $('ul#watch li[data-id][data-index]').each((_, el) => {
      const dataId = $(el).attr('data-id');
      const dataIndex = $(el).attr('data-index');
      if (dataId && dataIndex !== undefined) {
        const switchUrl = `${activeOrigin}/wp-content/themes/CimaNow.New/Interface/server.php?id=${dataId}&i=${dataIndex}`;
        if (!seenUrls.has(switchUrl)) {
          seenUrls.add(switchUrl);
          rawServers.push({
            name: $(el).text().trim() || `سيرفر ${rawServers.length + 1}`,
            label: $(el).text().trim() || `سيرفر ${rawServers.length + 1}`,
            url: switchUrl,
            type: 'embed',
            verified: false,
            headers: { Referer: `${activeOrigin}/` }
          });
        }
      }
    });

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: activeOrigin
    });

    return attachResultMeta(normalized, {
      ok: true,
      errorCode: normalized.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: res.url || watchUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: watchUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: watchUrl
    });
  }
}

export async function resolveStream(urlOrRef, options = {}) {
  const rawUrl = String(urlOrRef || '').trim();
  if (!rawUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Stream URL is required');
  }

  // 1. Check SSRF safety
  assertSafeScraperUrl(rawUrl, { allowHttp: true });

  // 2. Direct HLS or MP4 stream URL
  if (rawUrl.includes('.m3u8') || rawUrl.includes('.mp4')) {
    const isHls = rawUrl.includes('.m3u8');
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: rawUrl,
      type: isHls ? 'm3u8' : 'mp4',
      streamType: isHls ? 'm3u8' : 'mp4',
      quality: isHls ? 'AUTO-HLS' : 'HD',
      verified: Boolean(options.verified),
      headers: options.headers || {
        Referer: `${CIMANOW_CONFIG.baseUrl}/`,
        'User-Agent': 'Mozilla/5.0'
      }
    };
  }

  // 3. Offline fixture resolution bypass
  if (typeof options.resolveFixtureJson === 'string') {
    try {
      const parsed = JSON.parse(options.resolveFixtureJson);
      if (parsed?.url) {
        return {
          ok: true,
          providerId: PROVIDER_META.id,
          url: parsed.url,
          type: parsed.url.includes('.m3u8') ? 'm3u8' : parsed.url.includes('.mp4') ? 'mp4' : 'embed',
          streamType: parsed.url.includes('.m3u8') ? 'm3u8' : parsed.url.includes('.mp4') ? 'mp4' : 'embed',
          quality: 'AUTO',
          verified: false,
          headers: { Referer: `${CIMANOW_CONFIG.baseUrl}/` }
        };
      }
    } catch (_) {}
  }

  // 4. Handle CimaNow `/watch/resolve#...` or embed unwrapping
  try {
    const unwrapped = await unwrapEmbedToDirectStreams(rawUrl, `${CIMANOW_CONFIG.baseUrl}/`);
    if (unwrapped && unwrapped.length > 0) {
      const topStream = unwrapped[0];
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: topStream.url,
        type: topStream.streamType || topStream.type || 'mp4',
        streamType: topStream.streamType || topStream.type || 'mp4',
        quality: topStream.quality || 'HD',
        verified: false,
        headers: topStream.headers || { Referer: `${CIMANOW_CONFIG.baseUrl}/` }
      };
    }
  } catch (_) {}

  // 5. Fallback return embed object
  return {
    ok: true,
    providerId: PROVIDER_META.id,
    url: rawUrl,
    type: 'embed',
    streamType: 'embed',
    quality: 'HD',
    verified: false,
    headers: { Referer: `${CIMANOW_CONFIG.baseUrl}/` }
  };
}

// ---------------------------------------------------------------------
// Backward-compatible named exports
// ---------------------------------------------------------------------

export async function scrapeCimaNowCategory(catKey = 'movies_foreign', page = 1) {
  return scrapeCatalog(catKey, page);
}

export async function extractCimaNowStreamsAndEpisodes(targetUrl) {
  const episodes = await scrapeEpisodes(targetUrl);
  const servers = await scrapeServers(targetUrl);
  return { episodes, servers };
}
