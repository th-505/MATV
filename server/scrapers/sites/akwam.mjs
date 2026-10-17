// server/scrapers/sites/akwam.mjs
// Standalone provider module for Akwam / Akoam (أكوام, code: AK)
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
  extractYear,
  extractSeasonNumber,
  extractEpisodeNumber,
  inferContentType,
  cleanTitleText,
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
  isValidDirectMediaUrl
} from '../stream-unwrapper.mjs';

export const PROVIDER_META = Object.freeze({
  id: 'akwam',
  name: 'أكوام (Akwam)',
  code: 'AK',
  domains: ['https://akwam.ss', 'https://ak.sv'],
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
    pathTemplate: '/search?q={query}',
    queryParam: 'q',
    encoding: 'utf-8',
    pagination: '/search?q={query}&page={page}'
  },
  notImplemented: {}
});

export const AKWAM_CONFIG = Object.freeze({
  key: 'akwam',
  id: 'akwam',
  name: 'أكوام (Akwam)',
  code: 'AK',
  baseUrl: 'https://akwam.ss',
  fallbackBaseUrl: 'https://ak.sv',
  domains: ['https://akwam.ss', 'https://ak.sv'],
  mediaHostSuffixes: ['.downet.net'],
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  categories: {
    all: '/movies',
    movies: '/movies',
    movies_all: '/movies',
    'movie-all': '/movies',
    movies_foreign: '/movies?section=29',
    'movie-foreign': '/movies?section=29',
    movies_arabic: '/movies?section=30',
    'movie-arabic': '/movies?section=30',
    movies_indian: '/movies?section=31',
    'movie-indian': '/movies?section=31',
    movies_turkish: '/movies?section=32',
    'movie-turkish': '/movies?section=32',
    movies_asian: '/movies?section=33',
    'movie-asian': '/movies?section=33',
    series: '/series',
    series_all: '/series',
    'series-all': '/series',
    series_foreign: '/series?section=29',
    'series-foreign': '/series?section=29',
    series_arabic: '/series?section=30',
    'series-arabic': '/series?section=30',
    series_turkish: '/series?section=32',
    'series-turkish': '/series?section=32',
    series_asian: '/series?section=33',
    'series-asian': '/series?section=33',
    anime: '/series?category=30',
    anime_all: '/series?category=30',
    'anime-all': '/series?category=30'
  }
});

/**
 * Resolves an Akwam URL or reference into a fully-qualified canonical URL.
 * Handles `akwam:<url>`, `akoam:<url>`, base64url refs, and relative paths.
 */
export function resolveAkwamTargetUrl(urlOrRef, baseUrl = AKWAM_CONFIG.baseUrl) {
  if (!urlOrRef || typeof urlOrRef !== 'string') return '';
  const trimmed = urlOrRef.trim();
  if (!trimmed) return '';

  let candidate = trimmed;
  if (candidate.startsWith('akwam:') || candidate.startsWith('akoam:')) {
    const rawPayload = candidate.replace(/^(akwam|akoam):/, '');
    if (rawPayload.startsWith('http://') || rawPayload.startsWith('https://')) {
      candidate = rawPayload;
    } else if (rawPayload.startsWith('/')) {
      candidate = `${baseUrl}${rawPayload}`;
    } else {
      try {
        const decoded = Buffer.from(rawPayload, 'base64url').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          candidate = decoded;
        } else if (decoded.startsWith('/')) {
          candidate = `${baseUrl}${decoded}`;
        }
      } catch (_) {
        candidate = rawPayload;
      }
    }
  }

  // Rewrite legacy or mirror domains to the preferred base URL
  try {
    const parsed = new URL(candidate, baseUrl);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    if (parsed.hostname.toLowerCase() === 'ak.sv' || parsed.hostname.toLowerCase() === 'akoam.to') {
      const baseParsed = new URL(baseUrl);
      parsed.hostname = baseParsed.hostname;
    }
    return resolveSafeUrl(parsed.toString(), baseUrl, { allowHttp: true });
  } catch (_) {
    return resolveSafeUrl(candidate, baseUrl, { allowHttp: true });
  }
}

/**
 * Encodes an Akwam URL into a standard reference format `akwam:<base64url>`.
 */
export function encodeAkwamRef(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return `akwam:${Buffer.from(url.trim()).toString('base64url')}`;
  } catch (_) {
    return `akwam:${url.trim()}`;
  }
}

/**
 * Fetches HTML from Akwam with fallback domain support and offline fixture injection.
 */
async function fetchAkwamHtmlWithFallback(targetUrl, options = {}) {
  // 1. Direct fixtureHtml injection
  if (typeof options.fixtureHtml === 'string') {
    return fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });
  }

  // 2. Multi-URL fixture dictionary support (`options.fixtures: { [url]: html }`)
  if (options.fixtures && typeof options.fixtures === 'object') {
    const matchedKey = Object.keys(options.fixtures).find((k) => {
      if (k === targetUrl) return true;
      try {
        const parsedKey = new URL(k);
        const parsedTarget = new URL(targetUrl);
        return (
          parsedKey.pathname === parsedTarget.pathname &&
          parsedKey.search === parsedTarget.search
        );
      } catch (_) {
        return false;
      }
    });

    if (matchedKey && typeof options.fixtures[matchedKey] === 'string') {
      return fetchProviderHtml(targetUrl, {
        ...options,
        fixtureHtml: options.fixtures[matchedKey],
        providerId: PROVIDER_META.id
      });
    }
  }

  // 3. Network fetch with mirror fallback (akwam.ss -> ak.sv)
  const primaryUrl = targetUrl;
  let fallbackUrl = '';
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname === 'akwam.ss') {
      fallbackUrl = targetUrl.replace('https://akwam.ss', 'https://ak.sv');
    }
  } catch (_) {}

  try {
    return await fetchProviderHtml(primaryUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      headers: {
        'User-Agent': AKWAM_CONFIG.userAgent,
        Referer: `${AKWAM_CONFIG.baseUrl}/`,
        ...(options.headers || {})
      }
    });
  } catch (err) {
    if (fallbackUrl) {
      try {
        return await fetchProviderHtml(fallbackUrl, {
          ...options,
          providerId: PROVIDER_META.id,
          headers: {
            'User-Agent': AKWAM_CONFIG.userAgent,
            Referer: `${AKWAM_CONFIG.fallbackBaseUrl}/`,
            ...(options.headers || {})
          }
        });
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Extracts catalog cards from Akwam HTML.
 */
function extractCatalogItemsFromHtml(html = '', baseUrl = AKWAM_CONFIG.baseUrl, defaultType = 'movie') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $('.entry-box-1, .entry-box, .widget-body .entry-box, .movie-box').each((_, el) => {
    const card = $(el);
    const rawHref =
      card.find('h3.entry-title a, h2.entry-title a, .entry-title a').first().attr('href') ||
      card.find('a.box-link, a.box, a[href*="/movie/"], a[href*="/series/"], a[href*="/episode/"]').first().attr('href') ||
      card.find('a').first().attr('href') ||
      '';
    const url = resolveAkwamTargetUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;

    // Filter out non-content navigation anchors
    if (!url.includes('/movie/') && !url.includes('/movies/') && !url.includes('/series/') && !url.includes('/episode/')) {
      return;
    }

    const rawTitle =
      card.find('h3.entry-title a, h3.entry-title, h2.entry-title a, h2.entry-title, .entry-title a, .entry-title, .title').first().text().trim() ||
      card.find('a[title]').first().attr('title') ||
      card.find('img[alt]').first().attr('alt') ||
      '';
    if (!rawTitle) return;

    const img = card.find('picture img, img.lazy, img').first();
    const poster = resolveSafeUrl(
      img.attr('data-src') || img.attr('src') || '',
      baseUrl,
      { allowHttp: true }
    );

    const yearText = card.find('.badge-secondary, .year, .badge').first().text().trim();
    const year = extractYear(yearText) || extractYear(rawTitle) || '';
    const rating = card.find('.label.rating, .rating').text().replace(/[^\d.]/g, '').trim() || '';
    const quality = card.find('.quality, .badge-quality').text().trim() || 'HD';

    const inferredType = url.includes('/series/') || url.includes('/episode/')
      ? 'series'
      : url.includes('/movie/') || url.includes('/movies/')
        ? 'movie'
        : inferContentType(rawTitle, url, defaultType);

    const ref = encodeAkwamRef(url);
    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: cleanTitleText(rawTitle),
        url,
        poster,
        year,
        rating,
        quality,
        type: inferredType,
        category: inferredType,
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: inferredType }
    );

    if (normalized) {
      normalized.id = ref;
      normalized.ref = ref;
      normalized.is_series = inferredType !== 'movie';
      normalized.serverPrefix = PROVIDER_META.code;
      seenUrls.add(url);
      items.push(normalized);
    }
  });

  return items;
}

/**
 * Extracts episodes list from Akwam series HTML.
 */
function extractEpisodesFromHtml(html = '', baseUrl = AKWAM_CONFIG.baseUrl, defaultSeason = 1) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rawEpisodes = [];
  const seenUrls = new Set();

  $('#series-episodes a[href*="/episode/"], .widget-body a[href*="/episode/"], a[href*="/episode/"]').each((idx, el) => {
    const anchor = $(el);
    const rawHref = anchor.attr('href') || '';
    const url = resolveAkwamTargetUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const labelText = (anchor.attr('aria-label') || anchor.find('h2, span').text() || anchor.text()).trim();
    const epNum = extractEpisodeNumber(labelText, url, idx + 1) || (idx + 1);
    const season = extractSeasonNumber(labelText, defaultSeason) || defaultSeason;
    const title = labelText ? normalizeDigits(labelText).replace(/\s+/g, ' ').trim() : `الحلقة ${epNum}`;
    const ref = encodeAkwamRef(url);

    rawEpisodes.push({
      id: ref,
      episode_id: ref,
      ref,
      number: epNum,
      season,
      title,
      url
    });
  });

  const normalized = normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });

  return normalized.map((ep) => {
    const encodedRef = encodeAkwamRef(ep.url);
    return {
      ...ep,
      id: encodedRef,
      episode_id: encodedRef,
      ref: encodedRef,
      episode_number: ep.number,
      num: ep.number,
      watch_available: true
    };
  });
}

/**
 * Extracts candidate watch and download bridge URLs from an Akwam page.
 */
function extractBridgeLinks(html = '', baseUrl = AKWAM_CONFIG.baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  $('a[href*="/watch/"], a[href*="/download/"], a[href*="/link/"]').each((_, el) => {
    const rawHref = $(el).attr('href') || '';
    const resolved = resolveAkwamTargetUrl(rawHref, baseUrl);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      const text = $(el).text().trim();
      const qualityMatch = text.match(/(1080p|720p|480p|4K|360p|FHD|HD|SD)/i);
      links.push({
        url: resolved,
        label: text || 'رابط المشاهدة والتحميل',
        quality: qualityMatch ? qualityMatch[1].toUpperCase() : 'HD',
        isWatch: resolved.includes('/watch/'),
        isDownload: resolved.includes('/download/')
      });
    }
  });

  return links;
}

/**
 * Resolves an Akwam bridge URL (.downet.net) to direct playable MP4 streams.
 */
export async function resolveAkwamBridgeToDirectMp4(bridgeLinkUrl, refererUrl = AKWAM_CONFIG.baseUrl, options = {}) {
  const cleanUrl = resolveAkwamTargetUrl(bridgeLinkUrl, AKWAM_CONFIG.baseUrl);
  if (!cleanUrl) return [];

  const streams = [];

  try {
    const step1 = await fetchAkwamHtmlWithFallback(cleanUrl, {
      ...options,
      headers: { Referer: refererUrl }
    });

    if (!step1.ok || !step1.html) return [];
    const $1 = cheerio.load(step1.html);

    // Check for direct video tags on step 1 HTML
    $1('video source, source[src*=".mp4"], source[src*=".m3u8"]').each((_, el) => {
      const src = $1(el).attr('src') || '';
      const size = $1(el).attr('size') || '';
      if (src && (src.startsWith('http') || src.includes('.downet.net'))) {
        const streamType = src.includes('.m3u8') ? 'm3u8' : 'mp4';
        streams.push({
          url: src,
          type: streamType,
          streamType,
          quality: size ? `${size}p` : '1080p',
          headers: {
            Referer: cleanUrl,
            'User-Agent': AKWAM_CONFIG.userAgent
          }
        });
      }
    });

    // Check for direct download buttons on step 1 HTML
    $1('a.download-link, a.link[href*=".mp4"], .btn-loader a[href*=".mp4"], a[href*=".downet.net"]').each((_, el) => {
      const href = $1(el).attr('href') || '';
      if (href && (href.startsWith('http') || href.includes('.downet.net'))) {
        const isHls = href.includes('.m3u8');
        const qMatch = ($1(el).text() + ' ' + href).match(/(1080p|720p|480p|4k|360p)/i);
        streams.push({
          url: href,
          type: isHls ? 'm3u8' : 'mp4',
          streamType: isHls ? 'm3u8' : 'mp4',
          quality: qMatch ? qMatch[1].toUpperCase() : 'Direct-MP4',
          headers: {
            Referer: cleanUrl,
            'User-Agent': AKWAM_CONFIG.userAgent
          }
        });
      }
    });

    // Check script variables on step 1 HTML
    const scriptMatches = step1.html.match(/https?:\/\/[^\s"'<>\\]+\.downet\.net[^\s"'<>\\]*\.(?:mp4|m3u8)(?:\?[^\s"'<>\\]*)?/gi) || [];
    for (const matchUrl of scriptMatches) {
      const cleanStreamUrl = matchUrl.replace(/\\\//g, '/');
      if (!streams.some((s) => s.url === cleanStreamUrl)) {
        const isHls = cleanStreamUrl.includes('.m3u8');
        streams.push({
          url: cleanStreamUrl,
          type: isHls ? 'm3u8' : 'mp4',
          streamType: isHls ? 'm3u8' : 'mp4',
          quality: isHls ? 'AUTO-HLS' : '1080p',
          headers: {
            Referer: cleanUrl,
            'User-Agent': AKWAM_CONFIG.userAgent
          }
        });
      }
    }

    // Step 2: Next hop link if present and no direct streams found yet
    const nextUrlAttr = $1('a.download-link, a[href*="/watch/"], a[href*="/download/"], .btn-loader a').attr('href');
    if (streams.length === 0 && nextUrlAttr && nextUrlAttr !== cleanUrl) {
      const nextUrl = resolveAkwamTargetUrl(nextUrlAttr, cleanUrl);
      if (nextUrl) {
        const step2 = await fetchAkwamHtmlWithFallback(nextUrl, {
          ...options,
          headers: { Referer: cleanUrl }
        });
        if (step2.ok && step2.html) {
          const $2 = cheerio.load(step2.html);
          $2('video source, source[src*=".mp4"], source[src*=".m3u8"]').each((_, el) => {
            const src = $2(el).attr('src') || '';
            const size = $2(el).attr('size') || '';
            if (src && src.startsWith('http')) {
              const streamType = src.includes('.m3u8') ? 'm3u8' : 'mp4';
              streams.push({
                url: src,
                type: streamType,
                streamType,
                quality: size ? `${size}p` : '720p',
                headers: {
                  Referer: nextUrl,
                  'User-Agent': AKWAM_CONFIG.userAgent
                }
              });
            }
          });

          $2('a.link[href*=".mp4"], .btn-loader a[href*=".mp4"]').each((_, el) => {
            const href = $2(el).attr('href') || '';
            if (href && href.startsWith('http')) {
              streams.push({
                url: href,
                type: 'mp4',
                streamType: 'mp4',
                quality: 'Direct-MP4',
                headers: {
                  Referer: nextUrl,
                  'User-Agent': AKWAM_CONFIG.userAgent
                }
              });
            }
          });
        }
      }
    }

    // Fallback: unwrap standard embed wrappers if no direct mp4 found
    if (streams.length === 0) {
      const unwrapped = await unwrapEmbedToDirectStreams(cleanUrl, refererUrl);
      if (Array.isArray(unwrapped)) {
        for (const item of unwrapped) {
          streams.push({
            url: item.url,
            type: item.streamType || 'mp4',
            streamType: item.streamType || 'mp4',
            quality: item.quality || 'HD',
            headers: item.headers || { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
          });
        }
      }
    }
  } catch (_) {}

  return streams;
}

export async function scrapeCatalog(category = 'movies', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    AKWAM_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : AKWAM_CONFIG.categories.movies);

  const sep = subPath.includes('?') ? '&' : '?';
  const targetUrl = pageNum > 1
    ? `${AKWAM_CONFIG.baseUrl}${subPath}${sep}page=${pageNum}`
    : `${AKWAM_CONFIG.baseUrl}${subPath}`;

  const defaultType = /series|مسلسل/i.test(`${category} ${subPath}`) ? 'series' : 'movie';

  try {
    const res = await fetchAkwamHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return AKWAM_CONFIG.baseUrl;
      }
    })();

    const items = extractCatalogItemsFromHtml(res.html, activeOrigin, defaultType);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on Akwam page',
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
  const targetUrl = pageNum > 1
    ? `${AKWAM_CONFIG.baseUrl}/search?q=${encoded}&page=${pageNum}`
    : `${AKWAM_CONFIG.baseUrl}/search?q=${encoded}`;

  try {
    const res = await fetchAkwamHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return AKWAM_CONFIG.baseUrl;
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
  const cleanUrl = resolveAkwamTargetUrl(urlOrRef, AKWAM_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for Akwam details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetchAkwamHtmlWithFallback(cleanUrl, options);
  if (!res.ok || !res.html) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch Akwam details HTTP_${res.status}`, {
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      status: res.status
    });
  }

  const activeOrigin = (() => {
    try {
      return new URL(res.url || cleanUrl).origin;
    } catch {
      return AKWAM_CONFIG.baseUrl;
    }
  })();

  const $ = cheerio.load(res.html);

  const title =
    $('h1.entry-title, h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    '';

  const rawPoster =
    $('img.poster, .post-details img, picture img').first().attr('data-src') ||
    $('img.poster, .post-details img, picture img').first().attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';
  const poster = resolveSafeUrl(rawPoster, activeOrigin, { allowHttp: true });

  const overview =
    $('.story, .overview, .font-size-16, p.text-white').first().text().trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  const yearText = $('.badge-secondary, .year, .meta-info').first().text().trim();
  const year = extractYear(yearText) || extractYear(title) || '';
  const rating = $('.label.rating, .rating').first().text().replace(/[^\d.]/g, '').trim() || '';
  const quality = $('.badge-quality, .quality').first().text().trim() || 'HD';

  const genres = [];
  $('a[href*="/category/"], a[href*="/genre/"], .badge-info').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const defaultSeason = extractSeasonNumber(title, 1);
  const episodes = extractEpisodesFromHtml(res.html, activeOrigin, defaultSeason);
  const isSeries = cleanUrl.includes('/series/') || episodes.length > 0;

  const encodedRef = encodeAkwamRef(cleanUrl);
  const normalized = normalizeDetailsResult(
    {
      id: encodedRef,
      ref: encodedRef,
      title: cleanTitleText(title),
      poster,
      overview,
      year,
      rating,
      quality,
      genres,
      episodes,
      type: isSeries ? 'series' : 'movie',
      source: PROVIDER_META.id,
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: activeOrigin }
  );

  normalized.movie_title = normalized.title;
  normalized.status = 'success';

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: res.url || cleanUrl
  });
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolveAkwamTargetUrl(urlOrRef, AKWAM_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid Akwam series URL');
  }

  try {
    const res = await fetchAkwamHtmlWithFallback(cleanUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || cleanUrl).origin;
      } catch {
        return AKWAM_CONFIG.baseUrl;
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
  const rawInput = String(urlOrRef || '').trim();
  const cleanUrl = resolveAkwamTargetUrl(rawInput, AKWAM_CONFIG.baseUrl);

  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid Akwam URL for servers');
  }

  const rawServers = [];

  try {
    // If the input is already a direct media stream
    if (isValidDirectMediaUrl(cleanUrl) || cleanUrl.includes('.downet.net/media/')) {
      const isHls = cleanUrl.includes('.m3u8');
      rawServers.push({
        name: `سيرفر أكوام مباشر (1080p)`,
        label: `أكوام مباشر (1080p)`,
        url: cleanUrl,
        type: isHls ? 'm3u8' : 'mp4',
        streamType: isHls ? 'm3u8' : 'mp4',
        quality: isHls ? 'AUTO-HLS' : '1080p',
        headers: { Referer: AKWAM_CONFIG.baseUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
      });
    } else {
      // Step 1: Fetch the target page (movie, episode, or watch/download bridge)
      const res = await fetchAkwamHtmlWithFallback(cleanUrl, options);
      if (!res.ok || !res.html) {
        return createEmptyArrayResult(
          PROVIDER_META.id,
          SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
          `HTTP_${res.status}`,
          { url: cleanUrl }
        );
      }

      // Check if page already has direct media tags
      const $page = cheerio.load(res.html);
      $page('video source, source[src*=".mp4"], source[src*=".m3u8"]').each((_, el) => {
        const src = $page(el).attr('src') || '';
        const size = $page(el).attr('size') || '1080';
        if (src && src.startsWith('http')) {
          const streamType = src.includes('.m3u8') ? 'm3u8' : 'mp4';
          rawServers.push({
            name: `أكوام مباشر (${size}p)`,
            label: `أكوام مباشر (${size}p)`,
            url: src,
            type: streamType,
            streamType,
            quality: `${size}p`,
            headers: { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
          });
        }
      });

      // Check for direct download buttons on the current page
      $page('a.download-link[href*=".mp4"], a.link[href*=".mp4"], .btn-loader a[href*=".mp4"]').each((_, el) => {
        const href = $page(el).attr('href') || '';
        if (href && href.startsWith('http')) {
          const qMatch = ($page(el).text() + ' ' + href).match(/(1080p|720p|480p|4k|360p)/i);
          const qLabel = qMatch ? qMatch[1].toUpperCase() : '1080p';
          rawServers.push({
            name: `أكوام تحميل مباشر (${qLabel})`,
            label: `أكوام تحميل مباشر (${qLabel})`,
            url: href,
            type: 'mp4',
            streamType: 'mp4',
            quality: qLabel,
            headers: { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
          });
        }
      });

      // Extract watch and download bridge links
      const bridgeLinks = extractBridgeLinks(res.html, AKWAM_CONFIG.baseUrl);

      // If no direct video on the page, unwrap each bridge link
      if (rawServers.length === 0 && bridgeLinks.length > 0) {
        for (const bridge of bridgeLinks.slice(0, 4)) {
          const streams = await resolveAkwamBridgeToDirectMp4(bridge.url, cleanUrl, options);
          for (const s of streams) {
            rawServers.push({
              name: `أكوام مباشر (${s.quality || bridge.quality})`,
              label: `أكوام مباشر (${s.quality || bridge.quality})`,
              url: s.url,
              type: s.type,
              streamType: s.streamType,
              quality: s.quality || bridge.quality,
              headers: s.headers
            });
          }
          // If bridge link didn't unwrap, retain it as an embed/bridge server
          if (streams.length === 0) {
            rawServers.push({
              name: `مشاهدة أكوام (${bridge.quality})`,
              label: `مشاهدة أكوام (${bridge.quality})`,
              url: bridge.url,
              type: 'embed',
              streamType: 'embed',
              quality: bridge.quality,
              headers: { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
            });
          }
        }
      }
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: AKWAM_CONFIG.baseUrl
    }).map((srv, i) => ({
      ...srv,
      provider: PROVIDER_META.id,
      code: `${PROVIDER_META.code}-${i + 1}`,
      serverCode: `${PROVIDER_META.code}-${i + 1}`,
      verified: srv.type === 'mp4' || srv.type === 'm3u8'
    }));

    if (normalized.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable servers extracted from Akwam page',
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
  const cleanUrl = resolveAkwamTargetUrl(rawInput, AKWAM_CONFIG.baseUrl);

  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream or bridge URL for Akwam', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  // Case 1: Already a direct media URL
  if (isValidDirectMediaUrl(cleanUrl) || cleanUrl.includes('.downet.net/download/') || cleanUrl.includes('.downet.net/media/')) {
    const isHls = cleanUrl.includes('.m3u8');
    const streamType = isHls ? 'm3u8' : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : '1080p',
      headers: options.headers || { Referer: `${AKWAM_CONFIG.baseUrl}/`, 'User-Agent': AKWAM_CONFIG.userAgent }
    };
  }

  // Case 2: Bridge URL or episode/movie page
  const servers = await scrapeServers(cleanUrl, options);
  if (servers.length > 0) {
    // Prefer direct MP4 / HLS over embed
    const direct = servers.find((s) => s.type === 'mp4' || s.type === 'm3u8') || servers[0];
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: direct.url,
      type: direct.type,
      streamType: direct.streamType,
      quality: direct.quality,
      headers: direct.headers || { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
    };
  }

  // Case 3: Stream unwrapper fallback
  const unwrapped = await unwrapEmbedToDirectStreams(cleanUrl, `${AKWAM_CONFIG.baseUrl}/`);
  if (unwrapped.length > 0) {
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: unwrapped[0].url,
      type: unwrapped[0].streamType,
      streamType: unwrapped[0].streamType,
      quality: unwrapped[0].quality || 'HD',
      headers: unwrapped[0].headers || { Referer: cleanUrl, 'User-Agent': AKWAM_CONFIG.userAgent }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve Akwam stream URL', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

export async function scrapeLive(options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'Akwam is a VOD movie & series portal and does not offer live sports or TV broadcasts'
  );
}

// Backward-compatible named exports for index.mjs, supervisors, and existing callers
export const scrapeAkwamCategory = scrapeCatalog;
export const scrapeAkwamCatalog = scrapeCatalog;
export const scrapeAkoamCatalog = scrapeCatalog;
export const searchAkwam = scrapeSearch;
export const scrapeAkwamSearch = scrapeSearch;
export const scrapeAkwamDetails = scrapeDetails;
export const scrapeAkwamEpisodes = scrapeEpisodes;
export const extractAkwamServers = scrapeServers;
export const resolveAkwamStream = resolveStream;

export async function extractAkwamStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}
