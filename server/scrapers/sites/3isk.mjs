// server/scrapers/sites/3isk.mjs
// Standalone provider module for 3isk (قصة عشق الأصلي - 3isk, code: 3K)
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
  unwrapEmbedToDirectStreams,
  isValidDirectMediaUrl
} from '../stream-unwrapper.mjs';
import {
  ISK_ORIGIN,
  ISK_UA,
  ISK_CATEGORIES,
  encode3iskRef,
  decode3iskRef,
  parse3iskCatalog,
  parse3iskDetails,
  unpack3iskPlayer,
  assert3iskStream,
  create3iskProvider
} from '../../providers/3isk.mjs';

export {
  ISK_ORIGIN,
  ISK_UA,
  ISK_CATEGORIES,
  encode3iskRef,
  decode3iskRef,
  parse3iskCatalog,
  parse3iskDetails,
  unpack3iskPlayer,
  assert3iskStream,
  create3iskProvider
};

export const PROVIDER_META = Object.freeze({
  id: '3isk',
  name: 'قصة عشق الأصلي (3isk)',
  code: '3K',
  domains: ['https://ww4.3ick.club', 'https://3iskk.xyz', 'https://3isk.onl'],
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
    pagination: '/search/{query}/page/{page}/'
  },
  notImplemented: {}
});

export const ISK_SITE_CONFIG = Object.freeze({
  key: '3isk',
  id: '3isk',
  name: 'قصة عشق الأصلي (3isk)',
  code: '3K',
  baseUrl: 'https://ww4.3ick.club',
  fallbackBaseUrl: 'https://3iskk.xyz',
  domains: ['https://ww4.3ick.club', 'https://3iskk.xyz', 'https://3isk.onl'],
  categories: {
    all: '/',
    latest: '/',
    '3isk-latest': '/',
    turkish_latest: '/w-hlqat/',
    episodes: '/w-hlqat/',
    movies: '/w-mvs/',
    movies_all: '/w-mvs/',
    movies_turkish: '/w-mvs/',
    '3isk-movies': '/w-mvs/',
    series: '/w-srs/',
    series_all: '/w-srs/',
    series_turkish: '/w-srs/',
    turkish_series: '/w-srs/',
    '3isk-turkish': '/w-srs/',
    dubbed: '/genre/series-mudablij-121/',
    turkish_dubbed: '/genre/series-mudablij-121/',
    '3isk-dubbed': '/genre/series-mudablij-121/'
  }
});

const ACTIVE_DOMAINS = ['https://ww4.3ick.club', 'https://3iskk.xyz'];

/**
 * Rewrites dead/legacy 3isk mirror hostnames (e.g. ww5.3ick.club, 3isk.onl)
 * to the active primary domain (https://ww4.3ick.club).
 */
export function rewriteToActive3iskDomain(rawUrl = '', preferredOrigin = ISK_SITE_CONFIG.baseUrl) {
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
      host === '3isk.onl' ||
      host === 'www.3isk.onl' ||
      (/^(?:ww\d+\.)?3ick\.club$/i.test(host) && host !== 'ww4.3ick.club')
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
 * Normalizes 3isk mirror domains inside raw HTML to ISK_ORIGIN so that
 * `parse3iskCatalog` and `parse3iskDetails` from `server/providers/3isk.mjs`
 * recognize links from `ww4.3ick.club` and `ww5.3ick.club`.
 */
function normalizeHtmlForLegacy3iskParser(html = '') {
  if (!html || typeof html !== 'string') return '';
  return html.replace(
    /https?:\/\/(?:(?:ww\d+\.)?3ick\.club|3isk\.onl|3iskk\.xyz)(?=\/)/gi,
    ISK_ORIGIN
  );
}

export function resolve3iskTargetUrl(urlOrRef = '', baseUrl = ISK_SITE_CONFIG.baseUrl) {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';

  // 1. Try official decode3iskRef (`3isk:<base64url(/watch/...)>`)
  if (raw.startsWith('3isk:')) {
    try {
      const decodedUrl = decode3iskRef(raw);
      return `${baseUrl.replace(/\/+$/, '')}${decodedUrl.pathname}`;
    } catch {
      const rest = raw.slice('3isk:'.length).trim();
      if (rest.startsWith('http://') || rest.startsWith('https://') || rest.startsWith('/')) {
        return resolveSafeUrl(rewriteToActive3iskDomain(rest, baseUrl), baseUrl);
      }
      try {
        const decoded = Buffer.from(rest, 'base64url').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
          return resolveSafeUrl(rewriteToActive3iskDomain(decoded, baseUrl), baseUrl);
        }
      } catch (_) {}
    }
  }

  const rewritten = rewriteToActive3iskDomain(raw, baseUrl);
  return resolveSafeUrl(rewritten, baseUrl);
}

function is3iskPlayerHost(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'miravd.com' ||
      host.endsWith('.miravd.com') ||
      host === 'mwdy.cc' ||
      host.endsWith('.mwdy.cc') ||
      host === 'ukrcdn.club' ||
      host === 'ukrcdn.com' ||
      host.endsWith('.ukrcdn.club') ||
      host.endsWith('.ukrcdn.com')
    );
  } catch {
    return false;
  }
}

function is3iskEmbedWrapperUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /^\/embed\/\d+\/\d+\/\d+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function fetch3iskHtmlWithFallback(targetUrl, options = {}) {
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
      const res = await fetchProviderHtml(url, {
        ...options,
        headers: {
          'User-Agent': ISK_UA,
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

function extractCatalogItemsFromHtml(html = '', baseUrl = ISK_SITE_CONFIG.baseUrl, defaultType = 'series') {
  const items = [];
  const seenUrls = new Set();

  // 1. Bridge `parse3iskCatalog` from `server/providers/3isk.mjs`
  const bridgedHtml = normalizeHtmlForLegacy3iskParser(html);
  const bridgedItems = parse3iskCatalog(bridgedHtml);

  const $ = cheerio.load(html);

  $('a.type_item').each((idx, node) => {
    const anchor = $(node);
    const rawHref = anchor.attr('href') || '';
    const url = resolve3iskTargetUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;

    const img = anchor.find('img').first();
    const bridged = bridgedItems[idx] || null;
    const rawTitle =
      anchor.find('.item_title').text().replace(/\u00a0/g, ' ').trim() ||
      anchor.attr('title')?.replace(/\u00a0/g, ' ').trim() ||
      img.attr('alt')?.replace(/\u00a0/g, ' ').trim() ||
      bridged?.title ||
      '';
    if (!rawTitle) return;

    const rawPoster =
      img.attr('data-image') ||
      img.attr('data-src') ||
      img.attr('src') ||
      bridged?.poster ||
      '';

    const overlapType = anchor.find('.item_overlap em').text().trim();
    let type = defaultType;
    if (url.includes('/watch/movies/') || /فيلم/.test(overlapType)) {
      type = 'movie';
    } else if (url.includes('/watch/tvshows/') || url.includes('/watch/episodes/') || /مسلسل|حلقة/.test(overlapType)) {
      type = 'series';
    } else {
      type = inferContentType(rawTitle, url, defaultType);
    }

    let ref = `${PROVIDER_META.id}:${url}`;
    try {
      const legacyUrl = new URL(url);
      ref = encode3iskRef(`${ISK_ORIGIN}${legacyUrl.pathname}`);
    } catch (_) {}

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: rawTitle,
        url,
        poster: rewriteToActive3iskDomain(rawPoster, baseUrl),
        year: extractYear(rawTitle),
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

  return items;
}

function extractEpisodesFromHtml(html = '', baseUrl = ISK_SITE_CONFIG.baseUrl, defaultSeason = 1) {
  const bridgedHtml = normalizeHtmlForLegacy3iskParser(html);
  const bridgedDetails = parse3iskDetails(bridgedHtml);
  const $ = cheerio.load(html);
  const rawEpisodes = [];

  $('a.ep-num').each((idx, node) => {
    const anchor = $(node);
    const rawHref = anchor.attr('href') || '';
    const url = resolve3iskTargetUrl(rawHref, baseUrl);
    if (!url || !url.includes('/watch/episodes/')) return;

    const dataEp = Number(anchor.attr('data-ep-num') || anchor.find('b').text().trim());
    const epNum =
      Number.isInteger(dataEp) && dataEp > 0
        ? dataEp
        : extractEpisodeNumber(anchor.attr('title') || anchor.text(), url, idx + 1) || idx + 1;
    const season = Number(url.match(/-season-(\d+)-/i)?.[1] || defaultSeason) || 1;
    const title = (anchor.attr('title') || anchor.find('.cl_srt').text() || `الحلقة ${epNum}`).trim();

    let ref = `${PROVIDER_META.id}:${url}`;
    try {
      const legacyUrl = new URL(url);
      ref = encode3iskRef(`${ISK_ORIGIN}${legacyUrl.pathname}`);
    } catch (_) {}

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

  if (rawEpisodes.length === 0 && Array.isArray(bridgedDetails?.episodes)) {
    for (const ep of bridgedDetails.episodes) {
      const url = resolve3iskTargetUrl(ep.ref || ep.link, baseUrl);
      if (url) {
        rawEpisodes.push({
          id: ep.ref,
          episode_id: ep.ref,
          ref: ep.ref,
          number: ep.num || ep.episode_number,
          season: ep.season || defaultSeason,
          title: ep.title,
          url
        });
      }
    }
  }

  const normalized = normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });

  return normalized.map((ep) => {
    let encodedRef = ep.ref;
    try {
      const parsed = new URL(ep.url);
      encodedRef = encode3iskRef(`${ISK_ORIGIN}${parsed.pathname}`);
    } catch (_) {}
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

function extractStreamsFromPlayerHtml(playerHtml = '', playerUrl = '') {
  if (!playerHtml || typeof playerHtml !== 'string') return [];
  const streams = [];
  let unpacked = playerHtml;
  try {
    unpacked = unpack3iskPlayer(playerHtml);
  } catch (_) {}

  const combined = `${unpacked}\n${playerHtml}`;
  const matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi) || [];

  let referer = `${ISK_SITE_CONFIG.baseUrl}/`;
  try {
    const parsedPlayer = new URL(playerUrl);
    referer = `${parsedPlayer.origin}/`;
  } catch (_) {}

  const seen = new Set();
  for (const rawMatch of matches) {
    const cleanUrl = rawMatch.replace(/\\\//g, '/');
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    const isHls = cleanUrl.toLowerCase().includes('.m3u8');
    streams.push({
      name: `قصة عشق المباشر (${isHls ? 'HLS' : 'MP4'})`,
      label: `قصة عشق المباشر (${isHls ? 'HLS' : 'MP4'})`,
      url: cleanUrl,
      type: isHls ? 'm3u8' : 'mp4',
      streamType: isHls ? 'm3u8' : 'mp4',
      quality: isHls ? 'AUTO-HLS' : 'HD',
      headers: {
        Referer: referer,
        'User-Agent': ISK_UA
      }
    });
  }

  return streams;
}

async function resolve3iskPlayerUrl(playerUrl, embedWrapperUrl = '', options = {}) {
  if (typeof options.ajaxFixtureResponse === 'string' && options.ajaxFixtureResponse) {
    return extractStreamsFromPlayerHtml(options.ajaxFixtureResponse, playerUrl);
  }
  if (typeof options.fixtureHtml === 'string' && /eval\(function\(p,a,c,k,e,d\)/.test(options.fixtureHtml)) {
    return extractStreamsFromPlayerHtml(options.fixtureHtml, playerUrl);
  }

  try {
    const res = await fetchSafeResponse(playerUrl, {
      referer: embedWrapperUrl || `${ISK_SITE_CONFIG.baseUrl}/`,
      headers: { 'User-Agent': ISK_UA },
      timeoutMs: options.timeoutMs || 10000,
      providerId: PROVIDER_META.id
    });
    if (!res.ok || !res.html) return [];

    // 1. Packed JWPlayer (miravd.com, mwdy.cc, etc.)
    const directStreams = extractStreamsFromPlayerHtml(res.html, playerUrl);
    if (directStreams.length > 0) return directStreams;

    // 2. Ukrcdn playback JSON API (`/api/videos/<uuid>/playback?...`)
    const apiLiteral = res.html.match(/\bfetch\(\s*("(?:\\.|[^"\\])*")/);
    if (apiLiteral) {
      const apiPath = JSON.parse(apiLiteral[1]);
      const apiUrl = new URL(apiPath, playerUrl).toString();
      const apiRes = await fetchSafeResponse(apiUrl, {
        referer: playerUrl,
        headers: {
          'User-Agent': ISK_UA,
          Accept: 'application/json'
        },
        timeoutMs: options.timeoutMs || 10000,
        providerId: PROVIDER_META.id
      });
      if (apiRes.ok && apiRes.html) {
        const payload = JSON.parse(apiRes.html);
        if (payload?.url && typeof payload.url === 'string') {
          const streamUrl = payload.url.replace(/\\\//g, '/');
          const parsedPlayer = new URL(playerUrl);
          return [
            {
              name: 'قصة عشق المباشر (Ukrcdn HLS)',
              label: 'قصة عشق المباشر (Ukrcdn HLS)',
              url: streamUrl,
              type: streamUrl.endsWith('.mp4') ? 'mp4' : 'm3u8',
              streamType: streamUrl.endsWith('.mp4') ? 'mp4' : 'm3u8',
              quality: 'AUTO-HLS',
              headers: {
                Referer: `${parsedPlayer.origin}/`,
                'User-Agent': ISK_UA
              }
            }
          ];
        }
      }
    }
  } catch (_) {}

  return [];
}

async function resolve3iskEmbedWrapper(embedUrl, seePageUrl = '', cookieHeader = '', options = {}) {
  const streams = [];
  if (typeof options.embedFixtureHtml === 'string' && options.embedFixtureHtml) {
    const $emb = cheerio.load(options.embedFixtureHtml);
    const iframeSrc = resolveSafeUrl($emb('iframe[src]').first().attr('src') || '', embedUrl);
    if (iframeSrc) {
      const playerStreams = await resolve3iskPlayerUrl(iframeSrc, embedUrl, options);
      streams.push(...playerStreams);
      streams.push({
        name: 'مشغل قصة عشق',
        label: 'مشغل قصة عشق',
        url: iframeSrc,
        type: 'embed',
        streamType: 'embed',
        quality: 'HD',
        headers: { Referer: embedUrl, 'User-Agent': ISK_UA }
      });
    }
    return streams;
  }

  try {
    const embRes = await fetchSafeResponse(embedUrl, {
      referer: seePageUrl || `${ISK_SITE_CONFIG.baseUrl}/`,
      cookies: cookieHeader,
      headers: { 'User-Agent': ISK_UA },
      timeoutMs: options.timeoutMs || 10000,
      providerId: PROVIDER_META.id
    });
    if (!embRes.ok || !embRes.html) return [];

    const $emb = cheerio.load(embRes.html);
    const iframeSrc = resolveSafeUrl($emb('iframe[src]').first().attr('src') || '', embedUrl);
    if (!iframeSrc) return [];

    const playerStreams = await resolve3iskPlayerUrl(iframeSrc, embedUrl, options);
    streams.push(...playerStreams);
    streams.push({
      name: `مشغل قصة عشق (${new URL(iframeSrc).hostname})`,
      label: `مشغل قصة عشق (${new URL(iframeSrc).hostname})`,
      url: iframeSrc,
      type: 'embed',
      streamType: 'embed',
      quality: 'HD',
      headers: { Referer: embedUrl, 'User-Agent': ISK_UA }
    });
  } catch (_) {}

  return streams;
}

export async function scrapeCatalog(category = 'series_turkish', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    ISK_SITE_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : ISK_SITE_CONFIG.categories.series_turkish);
  const cleanSubPath = subPath.endsWith('/') ? subPath : `${subPath}/`;
  const targetUrl =
    pageNum > 1
      ? `${ISK_SITE_CONFIG.baseUrl}${cleanSubPath}page/${pageNum}/`
      : `${ISK_SITE_CONFIG.baseUrl}${cleanSubPath}`;

  const defaultType = /movie|mvs|أفلام/i.test( `${category} ${cleanSubPath}`) ? 'movie' : 'series';

  try {
    const res = await fetch3iskHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return ISK_SITE_CONFIG.baseUrl;
      }
    })();

    const items = extractCatalogItemsFromHtml(res.html, activeOrigin, defaultType);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on 3isk page',
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
      ? `${ISK_SITE_CONFIG.baseUrl}/search/${encoded}/page/${pageNum}/`
      : `${ISK_SITE_CONFIG.baseUrl}/?s=${encoded}`;

  try {
    const res = await fetch3iskHtmlWithFallback(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || targetUrl).origin;
      } catch {
        return ISK_SITE_CONFIG.baseUrl;
      }
    })();

    const items = extractCatalogItemsFromHtml(res.html, activeOrigin, 'series');
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
  const cleanUrl = resolve3iskTargetUrl(urlOrRef, ISK_SITE_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for 3isk details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetch3iskHtmlWithFallback(cleanUrl, options);
  if (!res.ok || !res.html) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch 3isk details HTTP_${res.status}`, {
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      status: res.status
    });
  }

  const activeOrigin = (() => {
    try {
      return new URL(res.url || cleanUrl).origin;
    } catch {
      return ISK_SITE_CONFIG.baseUrl;
    }
  })();

  const bridgedDetails = parse3iskDetails(normalizeHtmlForLegacy3iskParser(res.html));
  const $ = cheerio.load(res.html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    bridgedDetails?.movie_title ||
    '';

  const rawPoster =
    $('meta[property="og:image"]').attr('content') ||
    $('.single-thumb img, .poster img, img.item_img').first().attr('data-image') ||
    $('.single-thumb img, .poster img, img.item_img').first().attr('src') ||
    bridgedDetails?.poster ||
    '';
  const poster = rewriteToActive3iskDomain(rawPoster, activeOrigin);

  const overview =
    $('p.description, .story p, .single-description').first().text().trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  const genres = [];
  $('a[href*="/genre/"], .genres a, .tax-genres a').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const defaultSeason = extractSeasonNumber(title, 1);
  const episodes = extractEpisodesFromHtml(res.html, activeOrigin, defaultSeason);
  const isMovie = cleanUrl.includes('/watch/movies/') && episodes.length === 0;

  let encodedRef = `${PROVIDER_META.id}:${cleanUrl}`;
  try {
    const parsed = new URL(cleanUrl);
    encodedRef = encode3iskRef(`${ISK_ORIGIN}${parsed.pathname}`);
  } catch (_) {}

  const normalized = normalizeDetailsResult(
    {
      id: encodedRef,
      ref: encodedRef,
      title,
      poster,
      overview,
      year: extractYear(title),
      quality: 'HD',
      genres,
      episodes,
      type: isMovie ? 'movie' : 'series',
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
  const cleanUrl = resolve3iskTargetUrl(urlOrRef, ISK_SITE_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3isk series/episode URL');
  }

  try {
    const res = await fetch3iskHtmlWithFallback(cleanUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const activeOrigin = (() => {
      try {
        return new URL(res.url || cleanUrl).origin;
      } catch {
        return ISK_SITE_CONFIG.baseUrl;
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
  const cleanUrl = is3iskPlayerHost(rawInput)
    ? resolveSafeUrl(rawInput)
    : resolve3iskTargetUrl(rawInput, ISK_SITE_CONFIG.baseUrl);

  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3isk watch/embed URL');
  }

  const isFixtureMode =
    typeof options.fixtureHtml === 'string' ||
    typeof options.ajaxFixtureResponse === 'string' ||
    typeof options.embedFixtureHtml === 'string';

  const rawServers = [];

  try {
    // Case 1: Direct player host URL (miravd.com, mwdy.cc, ukrcdn.club)
    if (is3iskPlayerHost(cleanUrl)) {
      const playerStreams = await resolve3iskPlayerUrl(cleanUrl, `${ISK_SITE_CONFIG.baseUrl}/`, options);
      rawServers.push(...playerStreams);
      rawServers.push({
        name: 'مشغل قصة عشق المباشر',
        label: 'مشغل قصة عشق المباشر',
        url: cleanUrl,
        type: 'embed',
        streamType: 'embed',
        quality: 'HD',
        headers: { Referer: `${ISK_SITE_CONFIG.baseUrl}/`, 'User-Agent': ISK_UA }
      });

      const normalized = normalizeServerList(rawServers, {
        providerId: PROVIDER_META.id,
        providerName: PROVIDER_META.name,
        codePrefix: PROVIDER_META.code,
        baseUrl: ISK_SITE_CONFIG.baseUrl
      });

      return attachResultMeta(normalized, {
        ok: normalized.length > 0,
        providerId: PROVIDER_META.id,
        url: cleanUrl
      });
    }

    // Case 2: 3isk /embed/<server>/<post>/<type>/ wrapper URL
    if (is3iskEmbedWrapperUrl(cleanUrl) && typeof options.fixtureHtml !== 'string') {
      const wrapperStreams = await resolve3iskEmbedWrapper(cleanUrl, `${ISK_SITE_CONFIG.baseUrl}/`, '', options);
      rawServers.push(...wrapperStreams);
      rawServers.push({
        name: 'سيرفر قصة عشق #1',
        label: 'سيرفر قصة عشق #1',
        url: cleanUrl,
        type: 'embed',
        streamType: 'embed',
        quality: 'HD',
        headers: { Referer: `${ISK_SITE_CONFIG.baseUrl}/`, 'User-Agent': ISK_UA }
      });

      const normalized = normalizeServerList(rawServers, {
        providerId: PROVIDER_META.id,
        providerName: PROVIDER_META.name,
        codePrefix: PROVIDER_META.code,
        baseUrl: ISK_SITE_CONFIG.baseUrl
      });

      return attachResultMeta(normalized, {
        ok: normalized.length > 0,
        providerId: PROVIDER_META.id,
        url: cleanUrl
      });
    }

    // Case 3: Episode/Movie/See page (or fixture HTML)
    let cookieHeader = '';
    let pageHtml = '';
    let seeHtml = '';
    let activeOrigin = ISK_SITE_CONFIG.baseUrl;

    if (typeof options.fixtureHtml === 'string') {
      pageHtml = options.fixtureHtml;
      seeHtml = options.fixtureHtml;
    } else {
      const baseEpisodeUrl = cleanUrl.replace(/\/see\/?$/, '/');
      const epRes = await fetch3iskHtmlWithFallback(baseEpisodeUrl, options);
      if (!epRes.ok || !epRes.html) {
        return createEmptyArrayResult(
          PROVIDER_META.id,
          SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
          `HTTP_${epRes.status}`,
          { url: baseEpisodeUrl }
        );
      }

      pageHtml = epRes.html;
      try {
        activeOrigin = new URL(epRes.url || baseEpisodeUrl).origin;
      } catch (_) {}

      const setCookies =
        typeof epRes.headers?.getSetCookie === 'function'
          ? epRes.headers.getSetCookie()
          : [epRes.headers?.get?.('set-cookie')].filter(Boolean);
      cookieHeader = setCookies.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');

      // If a series page (/watch/tvshows/) was passed instead of an episode page, hop to latest episode
      if (baseEpisodeUrl.includes('/watch/tvshows/')) {
        const eps = extractEpisodesFromHtml(pageHtml, activeOrigin, 1);
        if (eps.length > 0) {
          return scrapeServers(eps[eps.length - 1].url, options);
        }
      }

      const seeUrl = `${ (epRes.url || baseEpisodeUrl).replace(/\/+$/, '') }/see/`;
      try {
        const seeRes = await fetchSafeResponse(seeUrl, {
          referer: epRes.url || baseEpisodeUrl,
          cookies: cookieHeader,
          headers: { 'User-Agent': ISK_UA },
          timeoutMs: options.timeoutMs || 10000,
          providerId: PROVIDER_META.id
        });
        if (seeRes.ok && seeRes.html) {
          seeHtml = seeRes.html;
          const moreCookies =
            typeof seeRes.headers?.getSetCookie === 'function'
              ? seeRes.headers.getSetCookie()
              : [seeRes.headers?.get?.('set-cookie')].filter(Boolean);
          const mergedCookies = [
            ...cookieHeader.split('; ').filter(Boolean),
            ...moreCookies.map((c) => String(c).split(';')[0]).filter(Boolean)
          ];
          cookieHeader = Array.from(new Set(mergedCookies)).join('; ');
        }
      } catch (_) {}

      if (!seeHtml) seeHtml = pageHtml;
    }

    // Check if the HTML itself is already a packed player or Embed page
    const directFromHtml = extractStreamsFromPlayerHtml(seeHtml, cleanUrl);
    rawServers.push(...directFromHtml);

    if (typeof options.ajaxFixtureResponse === 'string' && options.ajaxFixtureResponse) {
      rawServers.push(...extractStreamsFromPlayerHtml(options.ajaxFixtureResponse, cleanUrl));
    }

    const $see = cheerio.load(seeHtml);
    const $ep = cheerio.load(pageHtml);

    const bodyClass = `${$see('body').attr('class') || ''} ${$ep('body').attr('class') || ''}`;
    const postId = bodyClass.match(/\bpostid-(\d+)\b/)?.[1] || '';
    const isMovie = bodyClass.includes('single-movies') || cleanUrl.includes('/watch/movies/');
    const embedTypeNum = isMovie ? 1 : 2;

    const candidateEmbeds = [];
    const addCandidate = (rawHref, label) => {
      const resolved = resolve3iskTargetUrl(rawHref, activeOrigin);
      if (resolved && !candidateEmbeds.some((c) => c.url === resolved)) {
        candidateEmbeds.push({ url: resolved, label });
      }
    };

    // 1. Server tabs `#player_servers li.server_nth[data-post][data-nume]`
    $see('#player_servers li.server_nth, ul.player-servers li[data-post]').each((idx, el) => {
      const post = $see(el).attr('data-post') || postId;
      const nume = $see(el).attr('data-nume') || String(idx + 1);
      const dataType = $see(el).attr('data-type') || '';
      const typeFlag = dataType === 'movie' || dataType === 'movies' || isMovie ? 1 : 2;
      const label = $see(el).find('.server_name').text().trim() || `سيرفر ${nume}`;
      if (post && nume) {
        addCandidate(`${activeOrigin}/embed/${nume}/${post}/${typeFlag}/`, label);
      }
    });

    // 2. Active iframe `#iframe_player[src]` or `<div class="Video"><iframe src="...">`
    $see('iframe#iframe_player[src], .Video iframe[src], iframe[src]').each((idx, el) => {
      const src = $see(el).attr('src') || '';
      if (!src) return;
      if (is3iskPlayerHost(src)) {
        rawServers.push({
          name: `مشغل قصة عشق #${idx + 1}`,
          label: `مشغل قصة عشق #${idx + 1}`,
          url: src,
          type: 'embed',
          streamType: 'embed',
          quality: 'HD',
          headers: { Referer: cleanUrl, 'User-Agent': ISK_UA }
        });
      } else {
        addCandidate(src, `سيرفر ${idx + 1}`);
      }
    });

    // 3. Regex match for `/embed/<srv>/<post>/<type>/`
    const regexEmbeds = seeHtml.match(/https?:\/\/[^\s"'<>]+\/embed\/\d+\/\d+\/\d+\/?/gi) || [];
    regexEmbeds.forEach((u, idx) => addCandidate(u, `سيرفر ${idx + 1}`));

    // 4. Fallback using postId from WordPress body class
    if (candidateEmbeds.length === 0 && postId) {
      addCandidate(`${activeOrigin}/embed/1/${postId}/${embedTypeNum}/`, 'سيرفر 1');
      addCandidate(`${activeOrigin}/embed/2/${postId}/${embedTypeNum}/`, 'سيرفر 2');
    }

    // Unwrap candidate embeds in live mode (or when embedFixtureHtml/ajaxFixtureResponse provided)
    for (const cand of candidateEmbeds.slice(0, 4)) {
      if (!isFixtureMode || options.embedFixtureHtml || options.ajaxFixtureResponse) {
        const unwrapped = await resolve3iskEmbedWrapper(
          cand.url,
          `${cleanUrl.replace(/\/+$/, '')}/see/`,
          cookieHeader,
          options
        );
        for (const s of unwrapped) {
          rawServers.push({
            ...s,
            name: s.type === 'm3u8' || s.type === 'mp4' ? `${cand.label} (مباشر)` : `${cand.label} (مشغل)`,
            label: s.type === 'm3u8' || s.type === 'mp4' ? `${cand.label} (مباشر)` : `${cand.label} (مشغل)`
          });
        }
      }

      rawServers.push({
        name: cand.label,
        label: cand.label,
        url: cand.url,
        type: 'embed',
        streamType: 'embed',
        quality: 'HD',
        headers: {
          Referer: `${cleanUrl.replace(/\/+$/, '')}/see/`,
          'User-Agent': ISK_UA
        }
      });
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: activeOrigin
    }).map((srv, i) => ({
      ...srv,
      provider: PROVIDER_META.id,
      code: `${PROVIDER_META.code}-${i + 1}`,
      serverCode: `${PROVIDER_META.code}-${i + 1}`
    }));

    if (normalized.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable servers extracted from 3isk page',
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
  const cleanUrl =
    is3iskPlayerHost(rawInput) || isValidDirectMediaUrl(rawInput)
      ? resolveSafeUrl(rawInput)
      : resolve3iskTargetUrl(rawInput, ISK_SITE_CONFIG.baseUrl);

  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream or embed URL for 3isk', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  if (isValidDirectMediaUrl(cleanUrl)) {
    const streamType = cleanUrl.toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      headers: options.headers || { Referer: `${ISK_SITE_CONFIG.baseUrl}/`, 'User-Agent': ISK_UA }
    };
  }

  // Direct player unpack in fixture or live mode
  if (
    typeof options.ajaxFixtureResponse === 'string' ||
    (typeof options.fixtureHtml === 'string' && /eval\(function\(p,a,c,k,e,d\)/.test(options.fixtureHtml))
  ) {
    const extracted = extractStreamsFromPlayerHtml(
      options.ajaxFixtureResponse || options.fixtureHtml,
      cleanUrl
    );
    if (extracted.length > 0) {
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        ...extracted[0]
      };
    }
  }

  if (is3iskPlayerHost(cleanUrl)) {
    const playerStreams = await resolve3iskPlayerUrl(cleanUrl, `${ISK_SITE_CONFIG.baseUrl}/`, options);
    if (playerStreams.length > 0) {
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        ...playerStreams[0]
      };
    }
  }

  if (is3iskEmbedWrapperUrl(cleanUrl)) {
    const wrapperStreams = await resolve3iskEmbedWrapper(cleanUrl, `${ISK_SITE_CONFIG.baseUrl}/`, '', options);
    const direct = wrapperStreams.find((s) => s.type === 'm3u8' || s.type === 'mp4') || wrapperStreams[0];
    if (direct) {
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        ...direct
      };
    }
  }

  const servers = await scrapeServers(cleanUrl, options);
  if (servers.length > 0) {
    const direct = servers.find((s) => s.type === 'm3u8' || s.type === 'mp4') || servers[0];
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: direct.url,
      type: direct.type,
      streamType: direct.streamType,
      quality: direct.quality,
      headers: direct.headers || { Referer: cleanUrl, 'User-Agent': ISK_UA }
    };
  }

  const unwrapped = await unwrapEmbedToDirectStreams(cleanUrl, `${ISK_SITE_CONFIG.baseUrl}/`);
  if (unwrapped.length > 0) {
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: unwrapped[0].url,
      type: unwrapped[0].streamType,
      streamType: unwrapped[0].streamType,
      quality: unwrapped[0].quality || 'HD',
      headers: unwrapped[0].headers || { Referer: cleanUrl, 'User-Agent': ISK_UA }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve 3isk stream URL', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

export async function scrapeLive(options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    '3isk is a VOD drama site and does not offer live broadcasts'
  );
}

// Backward-compatible named exports for supervisors and legacy callers
export const scrape3iskCategory = scrapeCatalog;
export const scrape3iskCatalog = scrapeCatalog;
export const search3isk = scrapeSearch;
export const scrape3iskSearch = scrapeSearch;
export const scrape3iskDetails = scrapeDetails;
export const scrape3iskEpisodes = scrapeEpisodes;
export const extract3iskServers = scrapeServers;
export const resolve3iskStream = resolveStream;

export async function extract3iskStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}
