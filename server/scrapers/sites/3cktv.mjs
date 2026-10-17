// server/scrapers/sites/3cktv.mjs
// Standalone provider module for 3ckTV (3cktv, code: 3V)
// Independent Turkish drama provider, fully isolated from 3isk
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
  inferContentType,
  normalizeDigits
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  attachResultMeta,
  createEmptyArrayResult,
  classifyNetworkError
} from '../shared/errors.mjs';
import {
  unwrapEmbedToDirectStreams,
  unwrapBase64BridgeUrl,
  unpackDeanEdwards
} from '../stream-unwrapper.mjs';

export const PROVIDER_META = Object.freeze({
  id: '3cktv',
  name: '3ckTV',
  code: '3V',
  domains: ['https://e.3cktv.com', 'https://3cktv.com', 'https://ei.3cktv.com'],
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
    pathTemplate: '/?s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: '/page/{page}/?s={query}'
  },
  notImplemented: {}
});

export const THREE_CKTV_CONFIG = Object.freeze({
  key: '3cktv',
  id: '3cktv',
  name: '3ckTV',
  code: '3V',
  baseUrl: 'https://e.3cktv.com',
  fallbackBaseUrl: 'https://3cktv.com',
  domains: ['https://e.3cktv.com', 'https://3cktv.com', 'https://ei.3cktv.com'],
  categories: {
    turkish_latest: '/episodes/',
    turkish_subbed: '/category/مسلسلات-تركية-مترجمة/',
    turkish_dubbed: '/category/مسلسلات-تركية-مدبلجة/',
    turkish_movies: '/category/أفلام-تركية/',
    movies: '/category/أفلام-تركية/',
    series: '/category/مسلسلات-تركية-مترجمة/',
    latest: '/episodes/',
    all: '/episodes/',
    dubbed: '/category/مسلسلات-تركية-مدبلجة/'
  }
});

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/**
 * Encodes a target URL into standard 3ckTV ref format: 3cktv:<base64url>
 */
export function encode3cktvRef(url = '') {
  if (!url || typeof url !== 'string') return '';
  return `3cktv:${Buffer.from(url.trim()).toString('base64url')}`;
}

/**
 * Decodes a 3ckTV reference or URL back to an absolute HTTP URL.
 */
export function decode3cktvRef(refOrUrl = '') {
  if (!refOrUrl || typeof refOrUrl !== 'string') return '';
  const trimmed = refOrUrl.trim();
  if (trimmed.startsWith('3cktv:') || trimmed.startsWith('3ck:')) {
    const rawVal = trimmed.replace(/^(3cktv:|3ck:)/, '');
    if (rawVal.startsWith('http://') || rawVal.startsWith('https://')) {
      return rawVal;
    }
    try {
      const decoded = Buffer.from(rawVal, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded;
      }
      return `${THREE_CKTV_CONFIG.baseUrl}${decoded.startsWith('/') ? '' : '/'}${decoded}`;
    } catch {
      return rawVal;
    }
  }
  return trimmed;
}

/**
 * Safely resolves a 3ckTV target URL from a ref or URL input, preventing SSRF.
 */
export function resolve3cktvTargetUrl(refOrUrl = '', baseUrl = THREE_CKTV_CONFIG.baseUrl) {
  const decoded = decode3cktvRef(refOrUrl);
  if (!decoded) return '';
  if (decoded.startsWith('/')) {
    return resolveSafeUrl(decoded, baseUrl);
  }
  try {
    return resolveSafeUrl(decoded, baseUrl);
  } catch {
    return '';
  }
}

/**
 * Cleans titles scraped from 3ckTV, removing generic branding and normalizing digits.
 */
function clean3cktvTitle(rawTitle = '') {
  return normalizeDigits(String(rawTitle || ''))
    .replace(/قصة عشق|قصص عشق|موقع قصة عشق|3cktv/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts catalog and search result cards from 3ckTV HTML.
 */
export function extractCatalogItemsFromHtml(html = '', baseUrl = THREE_CKTV_CONFIG.baseUrl, defaultType = 'series') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];

  $('article.post, .block-post, .BlockItem, .item-box, .post-item').each((_, el) => {
    const node = $(el);
    const a = node.find('a').first();
    const rawHref = a.attr('href') || node.attr('data-url') || '';
    const href = resolveSafeUrl(rawHref, baseUrl);
    if (!href) return;

    const rawTitle =
      node.find('.title, h2, h3').text().trim() ||
      a.attr('title') ||
      node.find('img').first().attr('alt') ||
      '';
    const title = clean3cktvTitle(rawTitle);
    if (!title) return;

    const bgStyle = node.find('.imgBg, .poster').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const rawPoster =
      (bgMatch ? bgMatch[1] : '') ||
      node.find('img').attr('data-src') ||
      node.find('img').attr('data-img') ||
      node.find('img').attr('src') ||
      '';
    const poster = resolveSafeUrl(rawPoster, baseUrl);

    const year =
      node.find('.year, .date').text().trim() ||
      extractYear(title) ||
      '';

    const isMovie = /فيلم|movie|film/i.test(`${title} ${href}`) || defaultType === 'movie';
    const type = isMovie ? 'movie' : 'series';
    const ref = encode3cktvRef(href);

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title,
        url: href,
        sourceUrl: href,
        poster,
        image: poster,
        year,
        type,
        category: 'turkish',
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: type }
    );

    if (normalized) {
      normalized.serverPrefix = PROVIDER_META.code;
      normalized.is_series = type !== 'movie';
      items.push(normalized);
    }
  });

  return items;
}

/**
 * Extracts episodes list from series or watch page HTML, sorted ascending and deduplicated.
 */
export function extractEpisodesFromHtml(html = '', baseUrl = THREE_CKTV_CONFIG.baseUrl, defaultSeason = 1) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rawEpisodes = [];

  $('.episodesList a, ul.listEpisodes a, .episodes-list a, .list-episodes a, .watch-container .episodesList a').each(
    (idx, el) => {
      const node = $(el);
      const rawHref = node.attr('href') || '';
      const href = resolveSafeUrl(rawHref, baseUrl);
      if (!href) return;

      const rawText = node.text().trim() || node.attr('title') || '';
      const title = normalizeDigits(rawText).replace(/\s+/g, ' ').trim() || `الحلقة ${idx + 1}`;
      const epNum = extractEpisodeNumber(title, href, idx + 1);
      const season = extractSeasonNumber(title, defaultSeason);

      rawEpisodes.push({
        number: epNum,
        season,
        title,
        name: title,
        url: href,
        link: href,
        sourceUrl: href,
        ref: encode3cktvRef(href),
        source: PROVIDER_META.id
      });
    }
  );

  return normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });
}

/**
 * Extracts video servers from 3ckTV watch page HTML.
 */
export async function extractServersFromHtml(html = '', pageUrl = THREE_CKTV_CONFIG.baseUrl, options = {}) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const candidateUrls = [];
  const seenUrls = new Set();

  function unwrapCandidateUrl(raw = '') {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (/^[A-Za-z0-9+/=_-]{16,}$/.test(trimmed)) {
      try {
        const normalizedB64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedB64, 'base64').toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      } catch {}
    }
    return unwrapBase64BridgeUrl(trimmed);
  }

  function addCandidate(rawUrl, name = '') {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const unwrapped = unwrapCandidateUrl(rawUrl);
    const safeUrl = resolveSafeUrl(unwrapped, pageUrl);
    if (!safeUrl || seenUrls.has(safeUrl)) return;
    seenUrls.add(safeUrl);
    candidateUrls.push({ url: safeUrl, name: name || 'سيرفر مشاهدة' });
  }

  // 1. Check data-url / data-watch on serversList items
  $('ul.serversList li, .watchServers li, [data-url], [data-watch]').each((idx, el) => {
    const raw = $(el).attr('data-url') || $(el).attr('data-watch') || '';
    const name = $(el).attr('data-name') || $(el).text().trim() || `سيرفر ${idx + 1}`;
    if (raw) addCandidate(raw, name);
  });

  // 2. Check iframe players
  $('iframe[src]').each((idx, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.includes('facebook') && !src.includes('twitter')) {
      addCandidate(src, `مشغل مدمج ${idx + 1}`);
    }
  });

  // 3. Check for Dean Edwards packed JS or direct video sources
  const unpackedScript = unpackDeanEdwards(html);
  const combinedText = `${html}\n${unpackedScript}`;
  const mediaMatches = combinedText.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/gi) || [];
  for (const m of mediaMatches) {
    addCandidate(m, 'رابط مباشر');
  }

  const rawServers = [];

  // Deep unwrapping for candidates in live or fixture mode if unwrapper provided
  for (const cand of candidateUrls) {
    const isDirectMedia = cand.url.includes('.m3u8') || cand.url.includes('.mp4');
    if (isDirectMedia) {
      const streamType = cand.url.includes('.m3u8') ? 'm3u8' : 'mp4';
      rawServers.push({
        name: cand.name,
        label: cand.name,
        url: cand.url,
        type: streamType,
        streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
        headers: { Referer: `${pageUrl}/`, 'User-Agent': DEFAULT_UA },
        verified: options.verified === true
      });
    } else {
      // Embed player
      rawServers.push({
        name: cand.name,
        label: cand.name,
        url: cand.url,
        type: 'embed',
        streamType: 'embed',
        quality: 'HD',
        headers: { Referer: pageUrl, 'User-Agent': DEFAULT_UA },
        verified: false
      });
    }
  }

  return normalizeServerList(rawServers, {
    providerId: PROVIDER_META.id,
    providerName: PROVIDER_META.name,
    codePrefix: PROVIDER_META.code,
    baseUrl: pageUrl
  }).map((srv, idx) => ({
    ...srv,
    provider: PROVIDER_META.id,
    code: `${PROVIDER_META.code}-${idx + 1}`,
    serverCode: `${PROVIDER_META.code}-${idx + 1}`,
    verified: Boolean(rawServers[idx]?.verified)
  }));
}

/**
 * Scrapes catalog items for a given 3ckTV category and page.
 */
export async function scrapeCatalog(category = 'turkish_latest', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    THREE_CKTV_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : THREE_CKTV_CONFIG.categories.turkish_latest);
  const cleanSubPath = subPath.endsWith('/') ? subPath : `${subPath}/`;
  const targetUrl =
    pageNum > 1
      ? `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(cleanSubPath)}page/${pageNum}/`
      : `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(cleanSubPath)}`;

  const defaultType = /movie|أفلام/i.test(`${category} ${cleanSubPath}`) ? 'movie' : 'series';

  try {
    const res = await fetchProviderHtml(targetUrl, {
      providerId: PROVIDER_META.id,
      fixtureHtml: options.fixtureHtml,
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, THREE_CKTV_CONFIG.baseUrl, defaultType);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on 3ckTV page',
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

/**
 * Searches 3ckTV for Turkish drama series or movies.
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const encoded = encodeURIComponent(q);
  const targetUrl =
    pageNum > 1
      ? `${THREE_CKTV_CONFIG.baseUrl}/page/${pageNum}/?s=${encoded}`
      : `${THREE_CKTV_CONFIG.baseUrl}/?s=${encoded}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      providerId: PROVIDER_META.id,
      fixtureHtml: options.fixtureHtml,
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, THREE_CKTV_CONFIG.baseUrl, 'series');
    return attachResultMeta(items, {
      ok: true,
      errorCode: items.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      errorMessage: items.length === 0 ? 'No search results found' : null,
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

/**
 * Scrapes metadata, synopsis, and episode list for a series or movie.
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for 3ckTV details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      providerId: PROVIDER_META.id,
      fixtureHtml: options.fixtureHtml,
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA }
    });

    if (!res.ok || !res.html) {
      throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch 3ckTV details HTTP_${res.status}`, {
        providerId: PROVIDER_META.id,
        url: cleanUrl,
        status: res.status
      });
    }

    const $ = cheerio.load(res.html);
    const rawTitle =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('.title').first().text().trim() ||
      '';
    const title = clean3cktvTitle(rawTitle);

    const rawPoster =
      $('meta[property="og:image"]').attr('content') ||
      $('.poster-box img, .poster img, .imgBg img').first().attr('src') ||
      '';
    const poster = resolveSafeUrl(rawPoster, THREE_CKTV_CONFIG.baseUrl);

    const overview =
      $('.story p, .story, .overview, .description').first().text().trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';

    const genres = [];
    $('.genres a, a[href*="/category/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const defaultSeason = extractSeasonNumber(title, 1);
    const episodes = extractEpisodesFromHtml(res.html, THREE_CKTV_CONFIG.baseUrl, defaultSeason);
    const isMovie = /فيلم|movie|film/i.test(`${title} ${cleanUrl}`) && episodes.length === 0;

    const ref = encode3cktvRef(cleanUrl);

    const normalized = normalizeDetailsResult(
      {
        id: ref,
        ref,
        title,
        poster,
        overview,
        story: overview,
        year: $('.year').first().text().trim() || extractYear(title),
        quality: 'HD',
        genres,
        episodes,
        type: isMovie ? 'movie' : 'series',
        source: PROVIDER_META.id,
        sourceUrl: cleanUrl
      },
      { providerId: PROVIDER_META.id, baseUrl: THREE_CKTV_CONFIG.baseUrl }
    );

    return attachResultMeta(normalized, {
      ok: Boolean(title),
      providerId: PROVIDER_META.id,
      url: res.url || cleanUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
  }
}

/**
 * Scrapes all episodes for a given series URL or reference.
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3ckTV URL');
  }

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      providerId: PROVIDER_META.id,
      fixtureHtml: options.fixtureHtml,
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const $ = cheerio.load(res.html);
    const title = $('h1').first().text().trim();
    const defaultSeason = extractSeasonNumber(title, 1);
    const episodes = extractEpisodesFromHtml(res.html, THREE_CKTV_CONFIG.baseUrl, defaultSeason);

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

/**
 * Scrapes video servers from a 3ckTV watch page.
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3ckTV watch URL');
  }

  const watchUrl = cleanUrl.includes('?do=views') ? cleanUrl : `${cleanUrl.replace(/\/+$/, '')}/?do=views`;

  try {
    const res = await fetchProviderHtml(watchUrl, {
      providerId: PROVIDER_META.id,
      fixtureHtml: options.fixtureHtml,
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA }
    });

    const htmlToUse = res.ok && res.html ? res.html : null;
    if (!htmlToUse && !options.fixtureHtml) {
      // Fallback to base url if ?do=views returned 404
      const fallbackRes = await fetchProviderHtml(cleanUrl, {
        providerId: PROVIDER_META.id,
        timeoutMs: options.timeoutMs || 10000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      if (!fallbackRes.ok || !fallbackRes.html) {
        return createEmptyArrayResult(
          PROVIDER_META.id,
          SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
          `HTTP_${fallbackRes.status}`,
          { url: cleanUrl }
        );
      }
      const servers = await extractServersFromHtml(fallbackRes.html, cleanUrl, options);
      return attachResultMeta(servers, {
        ok: servers.length > 0,
        providerId: PROVIDER_META.id,
        url: cleanUrl
      });
    }

    const servers = await extractServersFromHtml(htmlToUse, watchUrl, options);
    if (servers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No servers extracted from 3ckTV watch page',
        { url: watchUrl }
      );
    }

    return attachResultMeta(servers, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: watchUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: watchUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: watchUrl
    });
  }
}

/**
 * Resolves an embed or media URL into a playable stream object.
 */
export async function resolveStream(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream URL for 3ckTV', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const isDirect = cleanUrl.includes('.m3u8') || cleanUrl.includes('.mp4');
  if (isDirect) {
    const streamType = cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      headers: options.headers || { Referer: `${THREE_CKTV_CONFIG.baseUrl}/`, 'User-Agent': DEFAULT_UA },
      verified: options.verified === true
    };
  }

  // Handle embed fixture HTML or player script
  if (typeof options.fixtureHtml === 'string' && /eval\(function\(p,a,c,k,e,d\)/.test(options.fixtureHtml)) {
    const unpacked = unpackDeanEdwards(options.fixtureHtml);
    const m = unpacked.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i);
    if (m) {
      const streamUrl = m[0];
      const streamType = streamUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: streamUrl,
        type: streamType,
        streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
        headers: { Referer: cleanUrl, 'User-Agent': DEFAULT_UA },
        verified: true
      };
    }
  }

  // Live unwrapping
  try {
    const unwrappedStreams = await unwrapEmbedToDirectStreams(cleanUrl, `${THREE_CKTV_CONFIG.baseUrl}/`);
    if (Array.isArray(unwrappedStreams) && unwrappedStreams.length > 0) {
      const best = unwrappedStreams[0];
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: best.url,
        type: best.streamType,
        streamType: best.streamType,
        quality: best.quality || 'HD',
        headers: best.headers || { Referer: cleanUrl, 'User-Agent': DEFAULT_UA },
        verified: false
      };
    }
  } catch (_) {}

  // Fallback to embed
  return {
    ok: true,
    providerId: PROVIDER_META.id,
    url: cleanUrl,
    type: 'embed',
    streamType: 'embed',
    quality: 'HD',
    headers: { Referer: `${THREE_CKTV_CONFIG.baseUrl}/`, 'User-Agent': DEFAULT_UA },
    verified: false
  };
}

// =========================================================================
// BACKWARD-COMPATIBLE NAMED EXPORTS (imported by server/scrapers/index.mjs)
// =========================================================================

export async function scrape3cktvCategory(catKey = 'turkish_latest', page = 1, options = {}) {
  return scrapeCatalog(catKey, page, options);
}

export async function extract3cktvStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return {
    episodes: Array.isArray(episodes) ? episodes : [],
    servers: Array.isArray(servers) ? servers : []
  };
}
