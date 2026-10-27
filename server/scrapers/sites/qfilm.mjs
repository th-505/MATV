// server/scrapers/sites/qfilm.mjs
// Standalone scraper module for كيو فيلم (QFilm) — Code: QM
// Primary domains: https://a.qfilm.tv, https://qfilm.tv

import * as cheerio from 'cheerio';
import { fetchProviderHtml, resolveSafeUrl } from '../shared/http.mjs';
import {
  cleanTitleText,
  extractEpisodeNumber,
  extractSeasonNumber,
  extractYear,
  inferContentType,
  normalizeCatalogItem,
  normalizeDetailsResult,
  normalizeDigits,
  normalizeEpisodeList,
  normalizeServerList
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  attachResultMeta,
  classifyNetworkError,
  createEmptyArrayResult
} from '../shared/errors.mjs';
import {
  extractRawStreamsFromText,
  isValidDirectMediaUrl,
  unwrapEmbedToDirectStreams
} from '../stream-unwrapper.mjs';

export const PROVIDER_ID = 'qfilm';
export const PROVIDER_NAME = 'كيو فيلم (QFilm)';
export const PROVIDER_CODE = 'QM';
export const PRIMARY_BASE_URL = 'https://a.qfilm.tv';
export const FALLBACK_BASE_URL = 'https://qfilm.tv';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_BASE_URL, FALLBACK_BASE_URL]),
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
    pathTemplate: '/search.php?keywords={query}',
    queryParam: 'keywords',
    encoding: 'utf-8',
    pagination: true
  }),
  notImplemented: Object.freeze({})
});

export const QFILM_CONFIG = Object.freeze({
  id: PROVIDER_ID,
  key: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  fallbackUrl: FALLBACK_BASE_URL,
  domains: Object.freeze([PRIMARY_BASE_URL, FALLBACK_BASE_URL]),
  categories: Object.freeze({
    home: '/',
    latest: '/',
    movies: '/category/movies/',
    movie: '/category/movies/',
    series: '/category/series/',
    tv: '/category/series/',
    anime: '/category/anime/',
    animation: '/category/anime/'
  })
});

/**
 * Decodes a provider reference (`qfilm:...`, `qm:...`, base64url, or relative URL)
 * into a safe absolute URL on or referenced by QFilm.
 * CONTRACT: All output URLs pass through SSRF-safe resolveSafeUrl.
 */
export function decodeProviderRef(urlOrRef, baseUrl = PRIMARY_BASE_URL) {
  if (!urlOrRef) return '';

  if (typeof urlOrRef === 'object') {
    const candidate =
      urlOrRef.url || urlOrRef.sourceUrl || urlOrRef.href || urlOrRef.link || urlOrRef.ref || '';
    return decodeProviderRef(candidate, baseUrl);
  }

  let raw = String(urlOrRef).trim();

  for (const prefix of ['qfilm:ep:', 'qfilm:', 'qm:ep:', 'qm:']) {
    if (raw.toLowerCase().startsWith(prefix)) {
      raw = raw.slice(prefix.length).trim();
      break;
    }
  }

  if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) {
    for (const encoding of ['base64url', 'base64']) {
      try {
        const decoded = Buffer.from(raw, encoding).toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
          raw = decoded;
          break;
        }
      } catch {
        // Ignore decoding errors
      }
    }
  }

  return resolveSafeUrl(raw, baseUrl, { allowHttp: true });
}

/**
 * Parses catalog/search cards from Cheerio DOM
 * Supports selectors from QFilm CMS themes (.item, .card, .movie-item, .film-item, article.post)
 */
function parseCatalogCards($, baseUrl = PRIMARY_BASE_URL, defaultType = 'movie') {
  const items = [];
  const seenUrls = new Set();

  const cardSelector = '.item, .card, .movie-item, .film-item, article.post, .type-post, .pm-video-thumb';

  $(cardSelector).each((_, el) => {
    const node = $(el);
    const link = node.is('a[href]') ? node : node.find('a[href]').first();
    const rawHref = link.attr('href') || node.attr('data-url') || '';
    const url = resolveSafeUrl(rawHref, baseUrl, { allowHttp: true });
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const rawTitle =
      node.find('.title, h2, h3, .film-name, .entry-title').first().text().trim() ||
      link.attr('title')?.trim() ||
      node.find('img').first().attr('alt')?.trim() ||
      '';
    if (!rawTitle) return;

    const img = node.find('img').first();
    const rawPoster =
      img.attr('data-echo') || img.attr('data-src') ||
      img.attr('data-lazy-src') ||
      img.attr('src') ||
      '';
    const poster = resolveSafeUrl(rawPoster, baseUrl, { allowHttp: true });

    const rawQuality =
      node.find('.quality, .badge, .film-quality, ._quality_tag').first().text().trim() || '';
    const quality = rawQuality && !/^now$/i.test(rawQuality) ? rawQuality : 'HD';

    const rawRating =
      node.find('.rating, .imdb, .rate, .imdb-rate').first().text().trim() || '';
    const normalizedRating = normalizeDigits(rawRating);
    const ratingMatch = normalizedRating.match(/(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? ratingMatch[1] : '';

    const rawYearText =
      node.find('.year, .date, .meta-year').first().text().trim() ||
      extractYear(rawTitle);
    const year = extractYear(rawYearText) || '';

    const isSeries =
      defaultType === 'series' ||
      /مسلسل|حلقة|موسم|series|season|episode/i.test(`${rawTitle} ${url}`) &&
      !/فيلم|movie|film/i.test(rawTitle);
    const itemType = isSeries ? 'series' : 'movie';

    const cleanTitle = cleanTitleText(rawTitle);

    const normalized = normalizeCatalogItem(
      {
        id: `${PROVIDER_ID}:${Buffer.from(url).toString('base64url')}`,
        ref: `${PROVIDER_ID}:${Buffer.from(url).toString('base64url')}`,
        title: cleanTitle,
        originalTitle: rawTitle,
        url,
        poster,
        year,
        rating,
        quality,
        type: itemType,
        category: itemType,
        source: PROVIDER_ID
      },
      {
        providerId: PROVIDER_ID,
        baseUrl,
        defaultType: itemType,
        allowHttp: true
      }
    );

    if (normalized) {
      items.push({
        ...normalized,
        href: normalized.url,
        serverPrefix: PROVIDER_CODE,
        is_series: itemType === 'series'
      });
    }
  });

  return items;
}

/**
 * Extracts episodes from Cheerio DOM
 * Supports selectors: .episodes-list a, .EpsList a, .episodes a, [data-episode], .servers-episodes a
 */
function parseEpisodesFromDocument($, baseUrl = PRIMARY_BASE_URL, defaultSeason = 1) {
  const rawEpisodes = [];
  const epSelector =
    '.episodes-list a, .EpsList a, .episodes a, .episode-item a, [data-episode], .servers-episodes a, ul.episodes li a';

  $(epSelector).each((idx, el) => {
    const node = $(el);
    const rawHref = node.attr('href') || node.attr('data-url') || node.attr('data-href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl, { allowHttp: true });
    if (!url) return;

    const rawTitle = node.text().trim() || node.attr('title')?.trim() || '';
    const season = extractSeasonNumber(rawTitle, defaultSeason);
    const number = extractEpisodeNumber(rawTitle, url, idx + 1);

    rawEpisodes.push({
      number,
      season,
      title: rawTitle || `الحلقة ${number}`,
      url,
      source: PROVIDER_ID
    });
  });

  return normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_ID,
    baseUrl,
    defaultSeason,
    allowHttp: true
  });
}

/**
 * Extracts servers from Cheerio DOM and raw HTML text
 * Server codes strictly follow prefix: `QM-1`, `QM-2`, ...
 * verified flag is STRICTLY false for embeds and unverified streams.
 */
async function extractServersFromDocument($, html = '', pageUrl = PRIMARY_BASE_URL, options = {}) {
  const rawServers = [];
  const seenUrls = new Set();

  // 1. Direct media streams in raw HTML / scripts
  const textStreams = extractRawStreamsFromText(html, pageUrl);
  for (const s of textStreams) {
    if (s && s.url && !seenUrls.has(s.url)) {
      seenUrls.add(s.url);
      rawServers.push({
        url: s.url,
        streamType: s.streamType,
        type: s.streamType,
        quality: s.quality || (s.streamType === 'm3u8' ? 'AUTO-HLS' : 'HD'),
        name: `${PROVIDER_NAME} Direct (${s.streamType.toUpperCase()})`,
        headers: s.headers || { Referer: pageUrl },
        verified: false
      });
    }
  }

  // 2. Video elements, source tags, embed iframes, and server buttons
  const candidateEmbedUrls = [];
  const streamElementsSelector =
    'video source, video[src], source[src], [data-stream], [data-url], [data-embed], iframe[src], ul.servers-list li, .watch-servers li, a[href*=".mp4"], a[href*=".m3u8"]';

  $(streamElementsSelector).each((_, el) => {
    const node = $(el);
    const rawAttr =
      node.attr('src') ||
      node.attr('data-stream') ||
      node.attr('data-url') ||
      node.attr('data-embed') ||
      node.attr('href') ||
      '';

    const resolved = resolveSafeUrl(rawAttr, pageUrl, { allowHttp: true });
    if (!resolved || seenUrls.has(resolved)) return;

    const lower = resolved.toLowerCase();
    // Filter out obvious trackers / ads / assets
    if (
      lower.endsWith('.jpg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.svg') ||
      lower.endsWith('.css') ||
      lower.endsWith('.js') ||
      /googleads|doubleclick|popads|disqus|facebook|analytics/i.test(lower)
    ) {
      return;
    }

    seenUrls.add(resolved);

    if (isValidDirectMediaUrl(resolved)) {
      const streamType =
        lower.includes('.m3u8') || lower.includes('/hls/') ? 'm3u8' : 'mp4';
      rawServers.push({
        url: resolved,
        streamType,
        type: streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
        name: `${PROVIDER_NAME} Direct (${streamType.toUpperCase()})`,
        headers: { Referer: pageUrl },
        verified: false
      });
    } else {
      candidateEmbedUrls.push(resolved);
    }
  });

  // 3. Optional unwrapping of candidate embed URLs when explicitly requested
  if (options.unwrap === true && candidateEmbedUrls.length > 0) {
    const unwrappedGroups = await Promise.all(
      candidateEmbedUrls.slice(0, 5).map((u) => unwrapEmbedToDirectStreams(u, pageUrl).catch(() => []))
    );
    for (const grp of unwrappedGroups) {
      for (const s of grp) {
        if (s && s.url && !seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          rawServers.push({
            url: s.url,
            streamType: s.streamType,
            type: s.streamType,
            quality: s.quality || '',
            name: `${PROVIDER_NAME} Direct`,
            headers: s.headers || { Referer: pageUrl },
            verified: false
          });
        }
      }
    }
  }

  // 4. Retain embed servers: typed strictly as 'embed' and verified: false
  for (const embedUrl of candidateEmbedUrls) {
    let hostLabel = 'Embed';
    try {
      hostLabel = new URL(embedUrl).hostname.replace(/^www\./, '');
    } catch {
      // Ignore URL hostname extraction failure
    }

    rawServers.push({
      url: embedUrl,
      streamType: 'embed',
      type: 'embed',
      quality: null,
      name: `${PROVIDER_NAME} (${hostLabel})`,
      headers: { Referer: pageUrl },
      verified: false
    });
  }

  const normalized = normalizeServerList(rawServers, {
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    codePrefix: PROVIDER_CODE,
    baseUrl: pageUrl,
    allowHttp: true
  });

  return normalized.map((srv, idx) => ({
    ...srv,
    id: `${PROVIDER_CODE.toLowerCase()}-${idx + 1}`,
    code: `${PROVIDER_CODE}-${idx + 1}`,
    serverCode: `${PROVIDER_CODE}-${idx + 1}`,
    label: `${PROVIDER_CODE}-${idx + 1}`,
    provider: PROVIDER_ID,
    verified: Boolean(srv.verified === true)
  }));
}

/**
 * Scrapes catalog items from QFilm
 * @param {string} category Category name or path
 * @param {number} page Page number (1-indexed)
 * @param {object} options Scraper options including fixtureHtml
 */
export async function scrapeCatalog(category = 'movies', page = 1, options = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const catKey = String(category || 'movies').toLowerCase();
  const categoryPath = QFILM_CONFIG.categories[catKey] || `/category/${catKey}/`;

  let targetUrl = resolveSafeUrl(categoryPath, PRIMARY_BASE_URL, { allowHttp: true });
  if (safePage > 1) {
    const trailing = categoryPath.endsWith('/') ? '' : '/';
    targetUrl = resolveSafeUrl(`${categoryPath}${trailing}page/${safePage}/`, PRIMARY_BASE_URL, { allowHttp: true });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    if (!res.ok) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `QFilm catalog returned HTTP ${res.status}`,
        { url: targetUrl }
      );
    }

    const $ = cheerio.load(res.html || '');
    const items = parseCatalogCards($, res.url || targetUrl, catKey.includes('series') ? 'series' : 'movie');

    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on page',
        { url: targetUrl }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Searches QFilm
 * @param {string} query Search query string
 * @param {number} page Page number (1-indexed)
 * @param {object} options Scraper options
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return createEmptyArrayResult(
      PROVIDER_ID,
      SCRAPER_ERROR_CODES.EMPTY_RESULT,
      'Search query is empty',
      { url: PRIMARY_BASE_URL }
    );
  }

  const safePage = Math.max(1, Number(page) || 1);
  let targetUrl = `${PRIMARY_BASE_URL}/search.php?keywords=${encodeURIComponent(cleanQuery)}`;
  if (safePage > 1) {
    targetUrl = `${PRIMARY_BASE_URL}/search.php?keywords=${encodeURIComponent(cleanQuery)}&page=${safePage}`;
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    if (!res.ok) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `QFilm search returned HTTP ${res.status}`,
        { url: targetUrl, query: cleanQuery }
      );
    }

    const $ = cheerio.load(res.html || '');
    const items = parseCatalogCards($, res.url || targetUrl, 'movie');

    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `No results found for query: ${cleanQuery}`,
        { url: targetUrl, query: cleanQuery }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl,
      query: cleanQuery
    });
  }
}

/**
 * Scrapes details, metadata, episodes, and servers from a QFilm detail page or reference
 * @param {string|object} urlOrRef Reference or URL
 * @param {object} options Scraper options
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    const empty = normalizeDetailsResult(
      { title: '', sourceUrl: PRIMARY_BASE_URL, episodes: [], servers: [] },
      { providerId: PROVIDER_ID, baseUrl: PRIMARY_BASE_URL }
    );
    return attachResultMeta(empty, {
      ok: false,
      errorCode: SCRAPER_ERROR_CODES.UNSAFE_URL,
      errorMessage: 'Invalid or unsafe target URL',
      providerId: PROVIDER_ID
    });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    if (!res.ok) {
      const empty = normalizeDetailsResult(
        { title: '', sourceUrl: targetUrl, episodes: [], servers: [] },
        { providerId: PROVIDER_ID, baseUrl: PRIMARY_BASE_URL }
      );
      return attachResultMeta(empty, {
        ok: false,
        errorCode: SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        errorMessage: `QFilm detail page returned HTTP ${res.status}`,
        providerId: PROVIDER_ID,
        url: targetUrl
      });
    }

    const pageUrl = res.url || targetUrl;
    const $ = cheerio.load(res.html || '');

    const rawHeading =
      $('.post-title, h1.title, h1, .entry-title, .film-name').first().text().trim() ||
      $('title').first().text().replace(/\s*-\s*كيو فيلم.*$/i, '').trim();

    const title = cleanTitleText(rawHeading);

    const img = $('.poster img, .entry-thumb img, .thumb img, .cover img').first();
    const poster = resolveSafeUrl(
      img.attr('data-echo') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '',
      pageUrl,
      { allowHttp: true }
    );

    const overview = $(
      '.story, .overview, .entry-content p, .description, .plot'
    ).first().text().trim();

    const yearText =
      $('.meta .year, .release-date, .info .year, .date').first().text().trim() ||
      extractYear(rawHeading);
    const year = extractYear(yearText) || '';

    const ratingText = normalizeDigits($('.rating, .imdb-rate, .score, .rate').first().text().trim());
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? ratingMatch[1] : '';

    const rawQuality = $('.quality, .film-quality, ._quality_tag').first().text().trim() || '';
    const quality = rawQuality && !/^now$/i.test(rawQuality) ? rawQuality : 'HD';

    const genres = [];
    $('.genres a, .meta .genre a, .category a, .genre a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const episodes = parseEpisodesFromDocument($, pageUrl, 1);
    const servers = await extractServersFromDocument($, res.html || '', pageUrl, options);

    const isSeries =
      episodes.length > 0 ||
      /مسلسل|series|season/i.test(`${rawHeading} ${pageUrl}`) && !/فيلم|movie/i.test(rawHeading);

    const normalized = normalizeDetailsResult(
      {
        id: `${PROVIDER_ID}:${Buffer.from(pageUrl).toString('base64url')}`,
        ref: `${PROVIDER_ID}:${Buffer.from(pageUrl).toString('base64url')}`,
        title,
        originalTitle: rawHeading,
        poster,
        overview,
        story: overview,
        year,
        genres,
        rating,
        quality,
        type: isSeries ? 'series' : 'movie',
        episodes,
        servers,
        sourceUrl: pageUrl
      },
      { providerId: PROVIDER_ID, baseUrl: pageUrl, allowHttp: true }
    );

    return attachResultMeta(
      {
        ...normalized,
        status: 'success',
        movie_title: normalized.title,
        media_sources: normalized.servers
      },
      {
        ok: true,
        errorCode: null,
        providerId: PROVIDER_ID,
        url: pageUrl
      }
    );
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    const empty = normalizeDetailsResult(
      { title: '', sourceUrl: targetUrl, episodes: [], servers: [] },
      { providerId: PROVIDER_ID, baseUrl: PRIMARY_BASE_URL }
    );
    return attachResultMeta(empty, {
      ok: false,
      errorCode: classified.code,
      errorMessage: classified.message,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  }
}

/**
 * Scrapes episodes from a QFilm series page or reference
 * @param {string|object} urlOrRef Series URL or reference
 * @param {object} options Scraper options
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(
      PROVIDER_ID,
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      'Invalid target URL'
    );
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    if (!res.ok) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `QFilm returned HTTP ${res.status}`,
        { url: targetUrl }
      );
    }

    const pageUrl = res.url || targetUrl;
    const $ = cheerio.load(res.html || '');
    const episodes = parseEpisodesFromDocument($, pageUrl, 1);

    if (episodes.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No episodes found on page',
        { url: pageUrl }
      );
    }

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: pageUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Scrapes streaming servers (`QM-1`, `QM-2`, ...) from a QFilm watch/detail page
 * @param {string|object} urlOrRef Watch URL or reference
 * @param {object} options Scraper options
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(
      PROVIDER_ID,
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      'Invalid target URL'
    );
  }

  // Handle direct media URLs directly
  if (isValidDirectMediaUrl(targetUrl) && typeof options.fixtureHtml !== 'string') {
    const streamType =
      targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls/')
        ? 'm3u8'
        : 'mp4';
    const directList = [
      {
        id: `${PROVIDER_CODE.toLowerCase()}-1`,
        code: `${PROVIDER_CODE}-1`,
        serverCode: `${PROVIDER_CODE}-1`,
        name: `${PROVIDER_NAME} Direct (${streamType.toUpperCase()})`,
        label: `${PROVIDER_CODE}-1`,
        url: targetUrl,
        type: streamType,
        streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
        source: PROVIDER_ID,
        provider: PROVIDER_ID,
        headers: { Referer: PRIMARY_BASE_URL },
        verified: false
      }
    ];

    return attachResultMeta(directList, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    if (!res.ok) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `QFilm returned HTTP ${res.status}`,
        { url: targetUrl }
      );
    }

    const pageUrl = res.url || targetUrl;
    const $ = cheerio.load(res.html || '');
    const servers = await extractServersFromDocument($, res.html || '', pageUrl, options);

    if (servers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No video or embed servers found on page',
        { url: pageUrl }
      );
    }

    return attachResultMeta(servers, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: pageUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Resolves a playable direct stream (`.m3u8` / `.mp4`) or primary embed server from a QFilm reference.
 * CONTRACT: Embed URLs are NEVER marked verified: true.
 */
export async function resolveStream(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    return attachResultMeta(
      {
        ok: false,
        providerId: PROVIDER_ID,
        url: null,
        streamUrl: null,
        streamType: null,
        servers: []
      },
      {
        ok: false,
        errorCode: SCRAPER_ERROR_CODES.UNSAFE_URL,
        errorMessage: 'Invalid or unsafe URL',
        providerId: PROVIDER_ID
      }
    );
  }

  const servers = await scrapeServers(targetUrl, options);
  const directServer = servers.find((s) => s.streamType === 'm3u8' || s.streamType === 'mp4');
  const primary = directServer || servers[0] || null;

  if (!primary) {
    const errCode = servers._meta?.errorCode || SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED;
    const errMsg = servers._meta?.errorMessage || 'Failed to resolve playable stream from QFilm';
    return attachResultMeta(
      {
        ok: false,
        providerId: PROVIDER_ID,
        url: null,
        streamUrl: null,
        streamType: null,
        servers: []
      },
      {
        ok: false,
        errorCode: errCode,
        errorMessage: errMsg,
        providerId: PROVIDER_ID,
        url: targetUrl
      }
    );
  }

  return attachResultMeta(
    {
      ok: true,
      providerId: PROVIDER_ID,
      code: primary.code,
      url: primary.url,
      streamUrl: primary.url,
      streamType: primary.streamType || primary.type,
      type: primary.type || primary.streamType,
      quality: primary.quality || '',
      headers: primary.headers || { Referer: PRIMARY_BASE_URL },
      verified: primary.verified === true,
      servers
    },
    {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_ID,
      url: targetUrl
    }
  );
}

/**
 * Backward-compatible stream extractor for specialized portals
 * Replaces specialized-portals.mjs extractQFilmStreams
 */
export async function extractQFilmStreams(targetUrl, options = {}) {
  const details = await scrapeDetails(targetUrl, options);
  const result = {
    episodes: Array.isArray(details.episodes) ? details.episodes : [],
    servers: Array.isArray(details.servers) ? details.servers : [],
    title: details.title || '',
    poster: details.poster || '',
    overview: details.overview || '',
    year: details.year || '',
    source: PROVIDER_ID,
    sourceUrl: details.sourceUrl || ''
  };
  return attachResultMeta(result, details._meta || { providerId: PROVIDER_ID });
}

// Backward-compatible named aliases
export const scrapeQfilmCatalog = scrapeCatalog;
export const scrapeQfilmCategory = scrapeCatalog;
export const searchQfilm = scrapeSearch;
export const scrapeQfilmSearch = scrapeSearch;
export const scrapeQfilmDetails = scrapeDetails;
export const scrapeQfilmEpisodes = scrapeEpisodes;
export const scrapeQfilmServers = scrapeServers;

export default {
  PROVIDER_META,
  QFILM_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractQFilmStreams,
  scrapeQfilmCatalog,
  scrapeQfilmCategory,
  searchQfilm,
  scrapeQfilmSearch,
  scrapeQfilmDetails,
  scrapeQfilmEpisodes,
  scrapeQfilmServers
};
