// server/scrapers/sites/witanime.mjs
// Standalone scraper module for WitAnime (witanime) — Code: WE
//
// Live Empirical Findings (2026-10-17):
// 1. https://witanime.you/ redirects (302) to https://www.witanime.net/?m=1
// 2. https://www.witanime.net/ is the official Blogger gateway ("بوابة ويت أنمي الرسمية"),
//    whose primary CTA buttons link directly to active streaming platform https://witanime.site/
// 3. https://witanime.site/ is a modern Laravel + Livewire + Alpine platform:
//    - Catalog: /browse (All/Series), /movies (Movies), /seasonal (Seasonal)
//    - Search: /search?q={query} (also handles ?search_param=animes&s={query})
//    - Details: /anime/{slug} and /movie/{slug}
//    - Episodes: Embedded directly on details page (/watch/{slug}/{ep})
//    - Stream Manifest API: POST /watch/{slug}/{ep}/sources (requires CSRF token + session cookie)
//    - Stream Gate: /watch/stream-gate/{token} (protected by server-side devtools guard)

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl
} from '../shared/http.mjs';
import {
  normalizeCatalogItem,
  normalizeEpisodeList,
  normalizeDetailsResult,
  normalizeServerList,
  extractEpisodeNumber,
  extractYear,
  cleanTitleText
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  classifyNetworkError,
  attachResultMeta,
  createEmptyArrayResult
} from '../shared/errors.mjs';
import {
  extractRawStreamsFromText,
  isValidDirectMediaUrl,
  unwrapEmbedToDirectStreams
} from '../stream-unwrapper.mjs';

const PROVIDER_ID = 'witanime';
const PROVIDER_NAME = 'WitAnime';
const PROVIDER_CODE = 'WE';

const ACTIVE_SITE_URL = 'https://witanime.site';
const GATEWAY_URL = 'https://www.witanime.net';
const LEGACY_URL = 'https://witanime.you';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([
    LEGACY_URL,
    GATEWAY_URL,
    ACTIVE_SITE_URL
  ]),
  mirrorOf: null,
  capabilities: Object.freeze({
    catalog: true,
    search: true,
    details: true,
    episodes: true,
    servers: true,
    resolve: true,
    live: false
  }),
  searchSpec: Object.freeze({
    method: 'GET',
    pathTemplate: '/search?q={query}',
    queryParam: 'q',
    encoding: 'utf-8',
    pagination: '/search?q={query}&page={page}'
  }),
  notImplemented: Object.freeze({
    live: 'WitAnime is an anime streaming archive and does not provide live TV or sports channels'
  })
});

export const WITANIME_CONFIG = Object.freeze({
  id: PROVIDER_ID,
  key: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: ACTIVE_SITE_URL,
  activeUrl: ACTIVE_SITE_URL,
  gatewayUrl: GATEWAY_URL,
  legacyUrl: LEGACY_URL,
  domains: PROVIDER_META.domains,
  categories: Object.freeze({
    anime_series: '/browse',
    series: '/browse',
    tv: '/browse',
    all: '/browse',
    anime_movies: '/movies',
    movie: '/movies',
    movies: '/movies',
    anime_seasonal: '/seasonal',
    seasonal: '/seasonal'
  })
});

// Simple cookie jar helper for session-based CSRF POST requests
class SessionCookieJar {
  constructor() {
    this.cookies = new Map();
  }
  update(headers) {
    if (!headers) return;
    const rawList = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get?.('set-cookie') || ''];
    for (const raw of rawList) {
      if (!raw) continue;
      const parts = raw.split(';');
      const first = parts[0].trim();
      const eq = first.indexOf('=');
      if (eq > 0) {
        this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
  }
  get header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/**
 * Extracts active mirror domain from gateway HTML if present
 */
export function extractMirrorOriginFromGatewayHtml(html = '') {
  if (!html || typeof html !== 'string') return '';
  try {
    const $ = cheerio.load(html);
    const candidates = [];
    $('#header-cta a[href], a.js-cta[href], #cta-action a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http')) candidates.push(href);
    });
    for (const cand of candidates) {
      try {
        const u = new URL(cand);
        if (u.hostname.includes('witanime') && !u.hostname.includes('witanime.net')) {
          return u.origin;
        }
      } catch (_) {}
    }
    const match = html.match(/https?:\/\/[a-z0-9.-]*witanime\.[a-z]+/gi);
    if (match) {
      for (const m of match) {
        if (!m.includes('witanime.net') && !m.includes('witanime.com')) {
          try {
            return new URL(m).origin;
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  return ACTIVE_SITE_URL;
}

/**
 * Parses catalog or search cards from HTML (supports both modern witanime.site and legacy theme)
 */
export function parseCatalogItems(html = '', baseUrl = ACTIVE_SITE_URL) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  // 1. Modern witanime.site cards: grid item links pointing to /anime/ or /movie/
  $('a[href*="/anime/"], a[href*="/movie/"]').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') || '';
    if (!href || href.includes('/preview/')) return;

    const safeUrl = resolveSafeUrl(href, baseUrl, { allowHttp: true });
    if (!safeUrl || seenUrls.has(safeUrl)) return;

    // Reject navigation/menu links that match /anime or /movies exactly
    const urlObj = new URL(safeUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return; // Must have slug: /anime/{slug} or /movie/{slug}

    const img = a.find('img').first();
    const poster = resolveSafeUrl(img.attr('src') || img.attr('data-src') || '', baseUrl, { allowHttp: true });
    const imgAlt = img.attr('alt') || '';

    // Title from h3, h2, or img alt
    const titleText = a.find('h3, h2, .title').first().text().trim() || imgAlt || '';
    if (!titleText) return;

    const isMovie = safeUrl.includes('/movie/') || a.text().includes('فيلم') || a.find('.bg-white:contains("فيلم")').length > 0;
    const yearText = extractYear(a.text()) || '';
    const ratingMatch = a.text().match(/\b(\d\.\d)\b/);
    const rating = ratingMatch ? ratingMatch[1] : '';

    const normalized = normalizeCatalogItem(
      {
        title: titleText,
        url: safeUrl,
        poster,
        year: yearText,
        rating,
        type: isMovie ? 'movie' : 'series',
        category: 'anime',
        source: PROVIDER_ID
      },
      { providerId: PROVIDER_ID, baseUrl, allowHttp: true }
    );

    if (normalized) {
      normalized.is_series = !isMovie;
      normalized.serverPrefix = PROVIDER_CODE;
      items.push(normalized);
      seenUrls.add(safeUrl);
    }
  });

  // 2. Legacy WordPress cards fallback: .anime-card-container
  if (items.length === 0) {
    $('.anime-card-container').each((_, el) => {
      const a = $(el).find('.anime-card-title h3 a, .anime-card-poster a').first();
      const href = a.attr('href') || '';
      const safeUrl = resolveSafeUrl(href, baseUrl, { allowHttp: true });
      if (!safeUrl || seenUrls.has(safeUrl)) return;

      const rawTitle = a.text().trim() || a.attr('title') || '';
      if (!rawTitle) return;

      const img = $(el).find('img').first();
      const poster = resolveSafeUrl(img.attr('src') || img.attr('data-src') || '', baseUrl, { allowHttp: true });
      const isMovie = safeUrl.includes('movie') || rawTitle.includes('فيلم');

      const normalized = normalizeCatalogItem(
        {
          title: rawTitle,
          url: safeUrl,
          poster,
          type: isMovie ? 'movie' : 'series',
          category: 'anime',
          source: PROVIDER_ID
        },
        { providerId: PROVIDER_ID, baseUrl, allowHttp: true }
      );

      if (normalized) {
        normalized.is_series = !isMovie;
        normalized.serverPrefix = PROVIDER_CODE;
        items.push(normalized);
        seenUrls.add(safeUrl);
      }
    });
  }

  return items;
}

/**
 * Parses episode links from details or watch page HTML
 */
export function parseEpisodesFromHtml(html = '', baseUrl = ACTIVE_SITE_URL, fallbackTitle = 'الحلقة') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rawEpisodes = [];
  const seenUrls = new Set();

  // 1. Modern witanime.site episode links: a[href*="/watch/"]
  $('a[href*="/watch/"]').each((idx, el) => {
    const a = $(el);
    const href = a.attr('href') || '';
    const safeUrl = resolveSafeUrl(href, baseUrl, { allowHttp: true });
    if (!safeUrl || seenUrls.has(safeUrl)) return;

    // Discard generic links like "شاهد الآن" if it points to same URL as an episode button
    const text = a.text().trim();
    const epNum = extractEpisodeNumber(text, safeUrl, idx + 1);

    rawEpisodes.push({
      id: `witanime-ep-${epNum}`,
      number: epNum,
      season: 1,
      title: text && text !== 'شاهد الآن' ? text : `${fallbackTitle} ${epNum}`,
      url: safeUrl,
      source: PROVIDER_ID
    });
    seenUrls.add(safeUrl);
  });

  // 2. Legacy WordPress base64 tokens in scripts or #episode-servers li a
  if (rawEpisodes.length === 0) {
    const b64Matches = html.match(/['"]([A-Za-z0-9+/=]{28,})['"]/g) || [];
    for (const rawQuotes of b64Matches) {
      const token = rawQuotes.slice(1, -1);
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf8').trim();
        if ((decoded.startsWith('http://') || decoded.startsWith('https://')) && decoded.includes('/episode/')) {
          const safeUrl = resolveSafeUrl(decoded, baseUrl, { allowHttp: true });
          if (safeUrl && !seenUrls.has(safeUrl)) {
            const epNum = extractEpisodeNumber('', safeUrl, rawEpisodes.length + 1);
            rawEpisodes.push({
              id: `witanime-ep-${epNum}`,
              number: epNum,
              season: 1,
              title: `${fallbackTitle} ${epNum}`,
              url: safeUrl,
              source: PROVIDER_ID
            });
            seenUrls.add(safeUrl);
          }
        }
      } catch (_) {}
    }
  }

  return normalizeEpisodeList(rawEpisodes, { providerId: PROVIDER_ID, baseUrl, allowHttp: true });
}

/**
 * Normalizes URL / ref into a valid https URL
 */
export function resolveTargetUrl(urlOrRef = '', baseUrl = ACTIVE_SITE_URL) {
  if (!urlOrRef || typeof urlOrRef !== 'string') return '';
  let clean = urlOrRef.trim();

  if (clean.startsWith('witanime:')) {
    clean = clean.slice('witanime:'.length);
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      try {
        const decoded = Buffer.from(clean, 'base64url').toString('utf8');
        if (decoded.startsWith('http')) clean = decoded;
      } catch (_) {
        try {
          const decoded = Buffer.from(clean, 'base64').toString('utf8');
          if (decoded.startsWith('http')) clean = decoded;
        } catch (_) {}
      }
    }
  }

  // Handle legacy domain mapping
  if (clean.includes('witanime.you')) {
    clean = clean.replace('https://witanime.you', ACTIVE_SITE_URL).replace('http://witanime.you', ACTIVE_SITE_URL);
  }
  if (clean.includes('www.witanime.net') && !clean.endsWith('/') && !clean.endsWith('/?m=1')) {
    clean = clean.replace('https://www.witanime.net', ACTIVE_SITE_URL);
  }

  return resolveSafeUrl(clean, baseUrl, { allowHttp: true });
}

/**
 * 1. scrapeCatalog(category, page, options)
 */
export async function scrapeCatalog(category = 'anime_series', page = 1, options = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const subPath = WITANIME_CONFIG.categories[category] || WITANIME_CONFIG.categories.anime_series;
  const baseUrl = options.baseUrl || ACTIVE_SITE_URL;
  const targetUrl = p > 1 ? `${baseUrl}${subPath}?page=${p}` : `${baseUrl}${subPath}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      fixtureHtml: options.fixtureHtml || options.fixtures?.catalog || null,
      providerId: PROVIDER_ID
    });

    if (!res.ok && res.status !== 200) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `HTTP_${res.status}`, { url: targetUrl });
    }

    const items = parseCatalogItems(res.html, baseUrl);
    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_ITEMS_FOUND', { url: targetUrl });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      category,
      page: p
    });
  } catch (err) {
    const scraperErr = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, scraperErr.code, scraperErr.message, { url: targetUrl });
  }
}

/**
 * 2. scrapeSearch(query, page, options)
 */
export async function scrapeSearch(query, page = 1, options = {}) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ || cleanQ.length < 2) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'QUERY_TOO_SHORT');
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const baseUrl = options.baseUrl || ACTIVE_SITE_URL;

  // Support both /search?q= and WordPress legacy query strings
  let searchQuery = cleanQ;
  if (cleanQ.includes('s=')) {
    try {
      const dummy = new URL(`https://dummy.local/?${cleanQ.replace(/^\?/, '')}`);
      searchQuery = dummy.searchParams.get('s') || cleanQ;
    } catch (_) {}
  }

  const targetUrl = p > 1
    ? `${baseUrl}/search?q=${encodeURIComponent(searchQuery)}&page=${p}`
    : `${baseUrl}/search?q=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      fixtureHtml: options.fixtureHtml || options.fixtures?.search || null,
      providerId: PROVIDER_ID
    });

    if (!res.ok && res.status !== 200) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `HTTP_${res.status}`, { url: targetUrl });
    }

    const items = parseCatalogItems(res.html, baseUrl);
    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_SEARCH_RESULTS', { url: targetUrl });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      query: searchQuery,
      page: p
    });
  } catch (err) {
    const scraperErr = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, scraperErr.code, scraperErr.message, { url: targetUrl });
  }
}

/**
 * 3. scrapeDetails(urlOrRef, options)
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef, options.baseUrl || ACTIVE_SITE_URL);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'URL_OR_REF_REQUIRED', { providerId: PROVIDER_ID });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      fixtureHtml: options.fixtureHtml || options.fixtures?.details || null,
      providerId: PROVIDER_ID
    });

    if (!res.ok && res.status !== 200) {
      throw new ScraperError(SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `HTTP_${res.status}_DETAILS`, {
        providerId: PROVIDER_ID,
        url: targetUrl,
        status: res.status
      });
    }

    const $ = cheerio.load(res.html);
    const title = cleanTitleText($('h1').first().text() || $('h2').first().text() || $('title').text() || '');
    if (!title) {
      throw new ScraperError(SCRAPER_ERROR_CODES.STRUCTURE_CHANGED, 'TITLE_NOT_FOUND', { providerId: PROVIDER_ID, url: targetUrl });
    }

    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const posterImg = $('img[src*="/posters/"], img[src*="/banners/"], .w-64 img, main img').filter((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      return Boolean(src && !src.startsWith('data:'));
    }).first();
    const poster = resolveSafeUrl(
      ogImage || posterImg.attr('src') || posterImg.attr('data-src') || '',
      targetUrl,
      { allowHttp: true }
    );

    let overview = '';
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 40 && !text.includes('حقوق') && !text.includes('وجهتك') && !text.includes('تنويه') && !overview) {
        overview = text;
      }
    });

    const genres = [];
    $('a[href*="/genre/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const year = extractYear($('.text-neutral-400, span, div').text()) || '';

    let rating = '';
    $('main span, main div, main p').each((_, el) => {
      const txt = $(el).clone().children().remove().end().text().trim();
      const m = txt.match(/^([1-9]\.\d{1,2})$/);
      if (m && m[1] !== '1.0' && !rating) {
        rating = m[1];
      }
    });
    if (!rating) {
      const m = $('main').text().match(/(?:التقييم|rating|\b)([2-9]\.\d{1,2}|1\.[1-9]\d?)\b/i);
      if (m) rating = m[1];
    }

    const episodes = parseEpisodesFromHtml(res.html, targetUrl);
    const isMovie = targetUrl.includes('/movie/') || res.html.includes('فيلم') || genres.includes('فيلم');

    const result = normalizeDetailsResult(
      {
        title,
        sourceUrl: targetUrl,
        poster,
        overview,
        story: overview,
        year,
        rating,
        genres,
        type: isMovie ? 'movie' : 'series',
        episodes,
        source: PROVIDER_ID
      },
      { providerId: PROVIDER_ID, baseUrl: targetUrl, allowHttp: true }
    );

    result.is_series = !isMovie;
    result.serverPrefix = PROVIDER_CODE;

    return attachResultMeta(result, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
  }
}

/**
 * 4. scrapeEpisodes(urlOrRef, options)
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const details = await scrapeDetails(urlOrRef, options);
  const eps = Array.isArray(details.episodes) ? details.episodes : [];
  return attachResultMeta(eps, {
    ok: true,
    providerId: PROVIDER_ID,
    url: details.sourceUrl,
    count: eps.length
  });
}

/**
 * 5. scrapeServers(urlOrRef, options)
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef, options.baseUrl || ACTIVE_SITE_URL);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSAFE_URL, 'TARGET_URL_REQUIRED');
  }

  // Support pre-resolved fixture servers
  if (Array.isArray(options.fixtureServers)) {
    const servers = normalizeServerList(options.fixtureServers, {
      providerId: PROVIDER_ID,
      providerName: PROVIDER_NAME,
      codePrefix: PROVIDER_CODE,
      baseUrl: targetUrl
    });
    return attachResultMeta(servers, { ok: true, providerId: PROVIDER_ID, url: targetUrl });
  }

  try {
    const jar = new SessionCookieJar();
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      fixtureHtml: options.fixtureHtml || options.fixtures?.servers || options.fixtures?.watch || null,
      providerId: PROVIDER_ID
    });

    jar.update(res.headers);
    const $ = cheerio.load(res.html);

    // 1. Check for sourcesUrl in Alpine x-data watchPlayer({ sourcesUrl: '...' })
    const matchSources = res.html.match(/sourcesUrl:\s*['"]([^'"]+)['"]/);
    const sourcesJsonRaw = options.sourcesJson || options.fixtures?.sourcesJson || null;

    let parsedSources = null;
    if (sourcesJsonRaw && typeof sourcesJsonRaw === 'object' && Object.keys(sourcesJsonRaw).length > 0) {
      parsedSources = sourcesJsonRaw;
    } else if (matchSources && !options.fixtureHtml) {
      const csrfToken = $('meta[name="csrf-token"]').attr('content') || '';
      const sourcesPath = matchSources[1].replace(/\\/g, '');
      const sourcesUrl = sourcesPath.startsWith('http') ? sourcesPath : `${ACTIVE_SITE_URL}${sourcesPath}`;

      try {
        const sourcesRes = await fetchSafeResponse(sourcesUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: targetUrl,
            Origin: ACTIVE_SITE_URL
          },
          cookies: jar.header,
          timeoutMs: options.timeoutMs || 10000
        });

        if (sourcesRes.ok && sourcesRes.html) {
          parsedSources = JSON.parse(sourcesRes.html);
        }
      } catch (_) {
        // Fall back to DOM / embedded links if sources manifest fails
      }
    }

    const rawServers = [];

    // If sources JSON was retrieved, create server entries for all players
    if (parsedSources && parsedSources.players) {
      for (const [quality, sList] of Object.entries(parsedSources.players)) {
        if (!Array.isArray(sList)) continue;
        for (const srv of sList) {
          const idx = rawServers.length + 1;
          const label = srv.label || 'Server';
          const token = srv.token || '';
          const serverUrl = token ? `${ACTIVE_SITE_URL}/watch/stream-gate/${token}` : targetUrl;

          rawServers.push({
            id: `witanime-${quality.toLowerCase()}-${idx}`,
            code: `${PROVIDER_CODE}-${idx}`,
            serverCode: `${PROVIDER_CODE}-${idx}`,
            name: `${PROVIDER_NAME} - ${label} [${quality}]`,
            label: `${label} - ${quality}`,
            url: serverUrl,
            embedUrl: serverUrl,
            quality: quality === 'FHD' ? '1080p' : quality === 'HD' ? '720p' : '480p',
            type: 'embed',
            streamType: 'embed',
            source: PROVIDER_ID,
            token,
            verified: false,
            headers: { Referer: ACTIVE_SITE_URL }
          });
        }
      }
    }

    // 2. Fallback to iframes / direct videos / legacy #episode-servers li a
    if (rawServers.length === 0) {
      $('iframe[src]').each((idx, el) => {
        const src = $(el).attr('src') || '';
        const safe = resolveSafeUrl(src, targetUrl, { allowHttp: true });
        if (safe) {
          rawServers.push({
            code: `${PROVIDER_CODE}-${idx + 1}`,
            name: `${PROVIDER_NAME} Embed #${idx + 1}`,
            url: safe,
            type: 'embed',
            verified: false
          });
        }
      });

      $('#episode-servers li a[data-ep-url], #episode-servers li a[data-url]').each((idx, el) => {
        const raw = $(el).attr('data-ep-url') || $(el).attr('data-url') || '';
        if (raw) {
          let dec = raw;
          if (!raw.startsWith('http')) {
            try { dec = Buffer.from(raw, 'base64').toString('utf8'); } catch (_) {}
          }
          const safe = resolveSafeUrl(dec, targetUrl, { allowHttp: true });
          if (safe) {
            rawServers.push({
              code: `${PROVIDER_CODE}-${rawServers.length + 1}`,
              name: `${PROVIDER_NAME} Server #${rawServers.length + 1}`,
              url: safe,
              type: 'embed',
              verified: false
            });
          }
        }
      });
    }

    if (rawServers.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'NO_SERVERS_EXTRACTED', { url: targetUrl });
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_ID,
      providerName: PROVIDER_NAME,
      codePrefix: PROVIDER_CODE,
      baseUrl: targetUrl
    });

    return attachResultMeta(normalized, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      count: normalized.length
    });
  } catch (err) {
    const scraperErr = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, scraperErr.code, scraperErr.message, { url: targetUrl });
  }
}

/**
 * 6. resolveStream(urlOrRef, options)
 */
export async function resolveStream(urlOrRef, options = {}) {
  let targetUrl = '';
  let serverCode = `${PROVIDER_CODE}-1`;
  let referer = ACTIVE_SITE_URL;

  if (urlOrRef && typeof urlOrRef === 'object') {
    targetUrl = urlOrRef.url || urlOrRef.embedUrl || '';
    serverCode = urlOrRef.code || urlOrRef.serverCode || serverCode;
    referer = urlOrRef.headers?.Referer || referer;
  } else {
    targetUrl = String(urlOrRef || '').trim();
  }

  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'STREAM_URL_REQUIRED', { providerId: PROVIDER_ID });
  }

  // 1. Direct media URL verification
  if (isValidDirectMediaUrl(targetUrl)) {
    const streamType = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls/') ? 'm3u8' : 'mp4';
    let verified = false;

    if (!options.skipVerification && !options.fixtureHtml) {
      try {
        const probeRes = await fetchSafeResponse(targetUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-1024', Referer: referer },
          timeoutMs: 5000
        });
        verified = probeRes.ok && (probeRes.status === 200 || probeRes.status === 206);
      } catch (_) {
        verified = false;
      }
    }

    return {
      provider: PROVIDER_ID,
      code: serverCode,
      url: targetUrl,
      streamUrl: targetUrl,
      streamType,
      type: streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : '1080p',
      verified,
      headers: { Referer: referer }
    };
  }

  // 2. Unwrapping embedded third-party hosts (ok.ru, yonaplay, mega, mp4upload, etc.)
  if (!targetUrl.includes('witanime.site/watch/stream-gate')) {
    try {
      const unwrapped = await unwrapEmbedToDirectStreams(targetUrl, referer);
      if (Array.isArray(unwrapped) && unwrapped.length > 0) {
        const first = unwrapped[0];
        return {
          provider: PROVIDER_ID,
          code: serverCode,
          url: first.url,
          streamUrl: first.url,
          streamType: first.streamType || 'm3u8',
          type: first.streamType || 'm3u8',
          quality: first.quality || '1080p',
          verified: true,
          headers: first.headers || { Referer: referer }
        };
      }
    } catch (_) {}
  }

  // 3. WitAnime stream-gate token endpoint: protected by server-side devtools guard
  return {
    provider: PROVIDER_ID,
    code: serverCode,
    url: targetUrl,
    embedUrl: targetUrl,
    streamType: 'embed',
    type: 'embed',
    quality: null,
    verified: false,
    headers: { Referer: referer },
    obstacle: 'STREAM_GATE_DEVTOOLS_GUARD'
  };
}

/**
 * 7. scrapeLive(options)
 */
export async function scrapeLive(options = {}) {
  throw new ScraperError(
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'LIVE_CAPABILITY_NOT_SUPPORTED',
    { providerId: PROVIDER_ID }
  );
}

// =====================================================================
// BACKWARD-COMPATIBLE NAMED EXPORTS (Required by server/scrapers/index.mjs & Supervisors)
// =====================================================================

export async function scrapeWitAnimeCategory(catKey = 'anime_series', page = 1, options = {}) {
  const items = await scrapeCatalog(catKey, page, options);
  return items.map((it) => ({
    id: it.id || `witanime:${Buffer.from(it.url).toString('base64url')}`,
    ref: it.ref || `witanime:${Buffer.from(it.url).toString('base64url')}`,
    title: it.title,
    poster: it.poster,
    url: it.url,
    source: PROVIDER_ID,
    category: 'anime',
    serverPrefix: PROVIDER_CODE,
    type: it.type || (catKey === 'anime_movies' ? 'movie' : 'series'),
    is_series: it.type !== 'movie'
  }));
}

export async function extractWitAnimeStreamsAndEpisodes(targetUrl, options = {}) {
  const cleanUrl = resolveTargetUrl(targetUrl, ACTIVE_SITE_URL);
  if (!cleanUrl) return { episodes: [], servers: [] };

  try {
    const isWatchPage = cleanUrl.includes('/watch/');
    if (isWatchPage) {
      const servers = await scrapeServers(cleanUrl, options);
      return {
        episodes: [],
        servers,
        media_sources: servers
      };
    }

    const details = await scrapeDetails(cleanUrl, options);
    let servers = [];
    if (details.episodes && details.episodes.length > 0) {
      try {
        servers = await scrapeServers(details.episodes[0].url, options);
      } catch (_) {}
    }

    return {
      ...details,
      episodes: details.episodes || [],
      servers,
      media_sources: servers
    };
  } catch (err) {
    return { episodes: [], servers: [] };
  }
}

export async function scrapeWitAnimeCatalog(type = 'series', page = 1, options = {}) {
  return scrapeWitAnimeCategory(type === 'movies' ? 'anime_movies' : 'anime_series', page, options);
}

export async function scrapeWitAnimeDetails(targetUrl, options = {}) {
  return scrapeDetails(targetUrl, options);
}

export async function searchWitAnime(query, page = 1, options = {}) {
  return scrapeSearch(query, page, options);
}

export default {
  PROVIDER_META,
  WITANIME_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive,
  scrapeWitAnimeCategory,
  extractWitAnimeStreamsAndEpisodes,
  scrapeWitAnimeCatalog,
  scrapeWitAnimeDetails,
  searchWitAnime,
  parseCatalogItems,
  parseEpisodesFromHtml,
  resolveTargetUrl,
  extractMirrorOriginFromGatewayHtml
};
