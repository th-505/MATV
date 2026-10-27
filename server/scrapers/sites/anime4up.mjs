// server/scrapers/sites/anime4up.mjs
// Standalone scraper module for Anime4Up (anime4up) — Code: AP
//
// Live Empirical Findings (2026-10-17):
// 1. https://www.anime4up.bond/ returns HTTP 200 (18,164 bytes) on `/` with the official
//    Anime4Up gateway page ("بوابة موقع انمي فور اب"), which links directly to the active
//    WordPress mirror https://4g.7jcsvwa.shop/. Subpaths on www.anime4up.bond return HTTP 404.
// 2. https://4f.7grcy6t.shop/ returns HTTP 307 Temporary Redirect to https://w1.anime4up.rest/,
//    and https://w1.anime4up.rest/ fails with ECONNRESET.
// 3. https://4g.7jcsvwa.shop/ is live (HTTP 200) running the Anime4up WordPress theme (vnxweb.com)
//    with full catalog (/anime-type/tv2/, /anime-type/movie-3/, /%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/),
//    search (/?search_param=animes&s=...), anime details (/anime/...), episodes (/episode/...),
//    and VnxPlayer S1/S2 direct HLS streams (/Anime4up-S1/..., /Anime4up-S2/...).

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  resolveSafeUrl
} from '../shared/http.mjs';
import {
  normalizeCatalogItem,
  normalizeEpisodeList,
  normalizeDetailsResult,
  normalizeServerList,
  extractEpisodeNumber,
  extractYear
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

const PROVIDER_ID = 'anime4up';
const PROVIDER_NAME = 'Anime4Up';
const PROVIDER_CODE = 'AP';

const ACTIVE_MIRROR_URL = 'https://4g.7jcsvwa.shop';
const BOND_GATEWAY_URL = 'https://www.anime4up.bond';
const LEGACY_CORE_URL = 'https://4f.7grcy6t.shop';
const LEGACY_REST_URL = 'https://w1.anime4up.rest';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: [
    BOND_GATEWAY_URL,
    LEGACY_CORE_URL,
    LEGACY_REST_URL,
    ACTIVE_MIRROR_URL
  ],
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
    pathTemplate: '/?search_param=animes&s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: '/page/{page}/?search_param=animes&s={query}'
  }),
  notImplemented: Object.freeze({})
});

export const ANIME4UP_CONFIG = Object.freeze({
  id: PROVIDER_ID,
  key: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  activeUrl: ACTIVE_MIRROR_URL,
  coreUrl: LEGACY_CORE_URL,
  bondUrl: BOND_GATEWAY_URL,
  restUrl: LEGACY_REST_URL,
  domains: PROVIDER_META.domains,
  categories: Object.freeze({
    anime_series: '/anime-type/tv2/',
    series: '/anime-type/tv2/',
    tv: '/anime-type/tv2/',
    anime_list: '/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/',
    anime_movies: '/anime-type/movie-3/',
    movie: '/anime-type/movie-3/',
    movies: '/anime-type/movie-3/',
    anime_ona: '/anime-type/ona/',
    anime_ova: '/anime-type/ova/',
    genre_action: '/anime-genre/%d8%a3%d9%83%d8%b4%d9%86/',
    genre_shonen: '/anime-genre/%d8%b4%d9%88%d9%86%d9%8a%d9%86/',
    genre_fantasy: '/anime-genre/%d9%81%d9%86%d8%aa%d8%a7%d8%b2%d9%8a%d8%a7/',
    genre_magic: '/anime-genre/%d8%b3%d8%ad%d8%b1/',
    genre_romance: '/anime-genre/%d8%b1%d9%88%d9%85%d8%a7%d9%86%d8%b3%d9%8a/',
    genre_mystery: '/anime-genre/%d8%ba%d9%85%d9%88%d8%b6/'
  })
});

let cachedDynamicMirrorOrigin = ACTIVE_MIRROR_URL;

/**
 * Extracts the active mirror origin advertised on the Anime4Up gateway page (https://www.anime4up.bond/).
 */
export function extractMirrorOriginFromGatewayHtml(html = '') {
  if (!html || typeof html !== 'string') return '';
  try {
    const $ = cheerio.load(html);
    const candidates = [];
    $('.home-site-btn-container a[href], .main-categories-list a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http')) candidates.push(href);
    });
    const scriptMatch = html.match(/https?:\/\/[a-z0-9.-]+\/\?search_param=animes/i);
    if (scriptMatch) candidates.push(scriptMatch[0]);

    for (const c of candidates) {
      const parsed = new URL(c);
      if (
        parsed.hostname !== 'www.anime4up.bond' &&
        parsed.hostname !== 'anime4up.bond' &&
        parsed.hostname !== 'w1.anime4up.rest'
      ) {
        return parsed.origin;
      }
    }
  } catch {
    // Ignore malformed gateway HTML
  }
  return '';
}

function isGatewayOnlyHtml(html = '') {
  if (!html) return false;
  return (
    html.includes('بوابة موقع انمي فور اب') &&
    html.includes('home-site-btn-container') &&
    !html.includes('anime-card-container') &&
    !html.includes('episode-servers')
  );
}

/**
 * Decodes a provider reference (`anime4up:...`, `anime4up:ep:...`, base64url, or relative URL)
 * into a safe absolute URL.
 */
export function resolveTargetUrl(urlOrRef, fallbackPath = '/') {
  if (!urlOrRef) {
    return resolveSafeUrl(fallbackPath, cachedDynamicMirrorOrigin, { allowHttp: true });
  }

  if (typeof urlOrRef === 'object') {
    const candidate =
      urlOrRef.url || urlOrRef.sourceUrl || urlOrRef.href || urlOrRef.link || urlOrRef.ref || '';
    return resolveTargetUrl(candidate, fallbackPath);
  }

  let raw = String(urlOrRef).trim();
  for (const prefix of ['anime4up_rest:', 'anime4up:ep:', 'anime4up:', 'ap:ep:', 'ap:']) {
    if (raw.toLowerCase().startsWith(prefix)) {
      raw = raw.slice(prefix.length).trim();
      break;
    }
  }

  if (!raw) {
    return resolveSafeUrl(fallbackPath, cachedDynamicMirrorOrigin, { allowHttp: true });
  }

  if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) {
    try {
      const decoded = Buffer.from(raw, 'base64url').toString('utf8').trim();
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
        raw = decoded;
      }
    } catch {
      // Ignore base64url decode errors
    }
    if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) {
      try {
        const decodedStd = Buffer.from(raw, 'base64').toString('utf8').trim();
        if (decodedStd.startsWith('http://') || decodedStd.startsWith('https://') || decodedStd.startsWith('/')) {
          raw = decodedStd;
        }
      } catch {
        // Ignore base64 decode errors
      }
    }
  }

  return resolveSafeUrl(raw, cachedDynamicMirrorOrigin, { allowHttp: true });
}

/**
 * Fetches an Anime4Up page with automatic fallback across the active mirror and gateway discovery.
 */
async function fetchAnime4UpPage(pathOrUrl, options = {}) {
  const resolvedInitial = resolveTargetUrl(pathOrUrl);
  if (!resolvedInitial) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, `Invalid Anime4Up URL: ${pathOrUrl}`, {
      providerId: PROVIDER_ID,
      url: String(pathOrUrl || '')
    });
  }

  // Deterministic offline fixture path
  if (typeof options.fixtureHtml === 'string') {
    return fetchProviderHtml(resolvedInitial, {
      ...options,
      providerId: PROVIDER_ID
    });
  }

  const parsed = new URL(resolvedInitial);
  const subPathAndQuery = `${parsed.pathname}${parsed.search}`;

  // Build candidate origins prioritizing the active mirror
  const originsToTry = [];
  const isDeadOrGatewayHost =
    parsed.hostname.includes('7grcy6t.shop') ||
    parsed.hostname.includes('anime4up.rest') ||
    (parsed.hostname.includes('anime4up.bond') && parsed.pathname !== '/');

  if (!isDeadOrGatewayHost) {
    originsToTry.push(parsed.origin);
  }
  if (!originsToTry.includes(cachedDynamicMirrorOrigin)) {
    originsToTry.push(cachedDynamicMirrorOrigin);
  }
  if (!originsToTry.includes(ACTIVE_MIRROR_URL)) {
    originsToTry.push(ACTIVE_MIRROR_URL);
  }

  let lastError = null;
  for (const origin of originsToTry) {
    const candidateUrl = `${origin}${subPathAndQuery}`;
    try {
      const res = await fetchProviderHtml(candidateUrl, {
        ...options,
        providerId: PROVIDER_ID,
        referer: `${origin}/`
      });

      // If we hit www.anime4up.bond gateway, extract its advertised mirror and fetch from there
      if (res.ok && isGatewayOnlyHtml(res.html)) {
        const discovered = extractMirrorOriginFromGatewayHtml(res.html);
        if (discovered && !originsToTry.includes(discovered)) {
          cachedDynamicMirrorOrigin = discovered;
          originsToTry.push(discovered);
          continue;
        }
      }

      if (res.ok && res.html && res.html.length > 200) {
        return res;
      }
      if (res.status === 404) {
        lastError = new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_404: ${candidateUrl}`, {
          providerId: PROVIDER_ID,
          url: candidateUrl,
          status: 404
        });
      }
    } catch (err) {
      lastError = classifyNetworkError(err, { providerId: PROVIDER_ID, url: candidateUrl });
    }
  }

  // Final attempt: query www.anime4up.bond gateway to discover if a new mirror domain was published
  try {
    const gwRes = await fetchProviderHtml(`${BOND_GATEWAY_URL}/`, {
      ...options,
      providerId: PROVIDER_ID,
      timeoutMs: 6000
    });
    const discovered = extractMirrorOriginFromGatewayHtml(gwRes.html);
    if (discovered && !originsToTry.includes(discovered)) {
      cachedDynamicMirrorOrigin = discovered;
      const retryUrl = `${discovered}${subPathAndQuery}`;
      const retryRes = await fetchProviderHtml(retryUrl, {
        ...options,
        providerId: PROVIDER_ID,
        referer: `${discovered}/`
      });
      if (retryRes.ok && retryRes.html) {
        return retryRes;
      }
    }
  } catch {
    // Ignore gateway fallback error and throw primary error
  }

  if (lastError) throw lastError;
  throw new ScraperError(SCRAPER_ERROR_CODES.NETWORK_TIMEOUT, 'Failed to fetch Anime4Up page', {
    providerId: PROVIDER_ID,
    url: resolvedInitial
  });
}

/**
 * Parses catalog/search cards from Anime4Up HTML (supports both vnxweb theme and legacy theme).
 */
export function parseCatalogItems($, baseUrl = ACTIVE_MIRROR_URL, defaultType = 'series') {
  const items = [];
  const seenUrls = new Set();

  $('.anime-card-container, .episodes-card-container, .anime-list-item, .item-list').each((_, el) => {
    const card = $(el);

    const titleAnchor = card
      .find('.anime-card-title h3 a, .episodes-card-title h3 a, .anime-card-title a, .title a, h3 a')
      .first();
    const posterAnchor = card.find('.anime-card-poster a, .episodes-card-poster a, a[href]').first();

    const rawHref = titleAnchor.attr('href') || posterAnchor.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl, { allowHttp: true });
    if (!url || seenUrls.has(url)) return;

    const img = card.find('img').first();
    const rawTitle =
      titleAnchor.text().trim() ||
      titleAnchor.attr('title') ||
      card.find('.anime-card-title').attr('title') ||
      posterAnchor.attr('aria-label') ||
      posterAnchor.attr('title') ||
      img.attr('alt') ||
      '';

    if (!rawTitle) return;

    const rawPoster =
      img.attr('data-src') ||
      img.attr('data-image') ||
      img.attr('data-lazy-src') ||
      img.attr('src') ||
      '';

    const typeText = card.find('.anime-card-type').text().trim();
    const isMovie = /movie|فيلم/i.test(typeText) || defaultType === 'movie';
    const contentType = isMovie ? 'movie' : 'series';

    const normalized = normalizeCatalogItem(
      {
        title: rawTitle,
        url,
        poster: rawPoster,
        type: contentType,
        category: 'anime',
        source: PROVIDER_ID
      },
      {
        providerId: PROVIDER_ID,
        baseUrl,
        defaultType: contentType,
        allowHttp: true
      }
    );

    if (normalized) {
      seenUrls.add(url);
      const b64Id = `${PROVIDER_ID}:${Buffer.from(url).toString('base64url')}`;
      items.push({
        ...normalized,
        id: b64Id,
        ref: b64Id,
        href: url,
        category: 'anime',
        serverPrefix: PROVIDER_CODE,
        is_series: contentType !== 'movie'
      });
    }
  });

  return items;
}

/**
 * Extracts episodes from an Anime4Up details or episode page.
 * Supports:
 * - Current vnxweb details page (`#episodesList .anime-card-container .ep_num a`)
 * - Current vnxweb episode page (`#ULEpisodesList li a`, `ul.all-episodes-list li a`)
 * - Legacy Anime4Up theme (`#DivEpisodesList .episodes-card-container a`, `ul.episodes-links a`)
 */
export function parseEpisodesFromHtml($, baseUrl = ACTIVE_MIRROR_URL) {
  const rawEpisodes = [];

  // 1. Details page episode cards (#episodesList / #DivEpisodesList / .episodes-card-container)
  $(
    '#episodesList .anime-card-container, #DivEpisodesList .episodes-card-container, .episodes-card-container'
  ).each((idx, el) => {
    const card = $(el);
    const epAnchor = card
      .find('.ep_num a, .episodes-card-title h3 a, a[href*="/episode/"]')
      .first();
    const href = epAnchor.attr('href') || card.find('a[href*="/episode/"]').first().attr('href') || '';
    if (!href) return;

    const epText =
      epAnchor.text().trim() ||
      card.find('.ep_num').text().trim() ||
      epAnchor.attr('title') ||
      card.find('a.overlay').attr('aria-label') ||
      '';
    const num = extractEpisodeNumber(epText, href, idx + 1);
    rawEpisodes.push({
      number: num,
      title: epText || `الحلقة ${num}`,
      url: href
    });
  });

  // 2. Episode page full list (#ULEpisodesList / ul.all-episodes-list / ul.episodes-links)
  $('#ULEpisodesList li a, ul.all-episodes-list li a, ul.episodes-links a, .ep-card a').each((idx, el) => {
    const href = $(el).attr('href') || '';
    if (!href) return;
    const epText = $(el).text().trim() || $(el).attr('title') || '';
    const num = extractEpisodeNumber(epText, href, idx + 1);
    rawEpisodes.push({
      number: num,
      title: epText || `الحلقة ${num}`,
      url: href
    });
  });

  const normalized = normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_ID,
    baseUrl,
    allowHttp: true
  });

  return normalized.map((ep) => ({
    ...ep,
    episodeNumber: ep.number,
    num: ep.number,
    label: `الحلقة ${ep.number}`,
    episode_id: `${PROVIDER_ID}:ep:${Buffer.from(ep.url).toString('base64url')}`
  }));
}

function isSocialOrIgnoredLink(url = '') {
  return /facebook\.com|twitter\.com|x\.com|reddit\.com\/submit|t\.me\/|telegram\.org|youtube\.com|instagram\.com|vnxweb\.com|pinterest\.com|cloudflareinsights\.com/i.test(
    url
  );
}

function isDirectPlayableStreamUrl(url = '') {
  if (!url || typeof url !== 'string') return false;
  return (
    /\.(?:m3u8|mp4)(?:$|[?#&])/i.test(url) ||
    /\/hls\/|master\.txt|workers\.dev\/\?token=/i.test(url)
  );
}

function normalizeAndSequenceServers(list = [], baseUrl = ACTIVE_MIRROR_URL) {
  const metaByUrl = new Map();
  const cleaned = list.map((srv) => {
    if (!srv || typeof srv !== 'object') return srv;
    const { code: _c, serverCode: _sc, id: _id, ...rest } = srv;
    if (rest.url) {
      const prev = metaByUrl.get(rest.url);
      metaByUrl.set(rest.url, {
        type: rest.type || rest.streamType || prev?.type,
        verified: rest.verified === true || prev?.verified === true,
        expiresHint: rest.expiresHint || prev?.expiresHint || (/[?&]token=/i.test(rest.url) ? 'tokenized_url' : null),
        headers: Object.keys(rest.headers || {}).length > 0 ? rest.headers : (prev?.headers || {})
      });
    }
    return rest;
  });
  return normalizeServerList(cleaned, {
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    codePrefix: PROVIDER_CODE,
    baseUrl,
    allowHttp: true
  }).map((srv, idx) => {
    const meta = metaByUrl.get(srv.url) || {};
    const streamType = meta.type || srv.type || srv.streamType || 'embed';
    return {
      ...srv,
      id: `${PROVIDER_ID}-${idx + 1}`,
      code: `${PROVIDER_CODE}-${idx + 1}`,
      serverCode: `${PROVIDER_CODE}-${idx + 1}`,
      type: streamType,
      streamType,
      verified: meta.verified === true,
      expiresHint: meta.expiresHint || (/[?&]token=/i.test(srv.url) ? 'tokenized_url' : null),
      headers: Object.keys(meta.headers || {}).length > 0 ? meta.headers : srv.headers || {},
      provider: PROVIDER_ID
    };
  });
}

/**
 * Extracts raw server descriptors from an Anime4Up episode/watch page.
 * Handles:
 * 1. `input[name="wl"]` Base64 JSON encoded server map
 * 2. `#episode-servers li[data-watch]` and `#episode-servers li a[data-ep-url]`
 * 3. `#Synchronize-download a[href^="http"]` and `a.btn.labeled.secondary[href^="http"]`
 * 4. VnxPlayer inline `streamUrl` (`let streamUrl = "https://...workers.dev/?token=..."`)
 */
export function extractRawServersFromHtml(html = '', baseUrl = ACTIVE_MIRROR_URL) {
  if (!html || typeof html !== 'string') return [];

  const $ = cheerio.load(html);
  const rawServers = [];
  const seenUrls = new Set();

  const pushCandidate = (url, meta = {}) => {
    const safeUrl = resolveSafeUrl(url, baseUrl, { allowHttp: true });
    if (!safeUrl || seenUrls.has(safeUrl) || isSocialOrIgnoredLink(safeUrl)) return;
    seenUrls.add(safeUrl);
    const inferredType =
      meta.streamType ||
      meta.type ||
      (isDirectPlayableStreamUrl(safeUrl)
        ? /\.mp4(?:$|[?#&])/i.test(safeUrl)
          ? 'mp4'
          : 'm3u8'
        : 'embed');
    rawServers.push({
      url: safeUrl,
      name: meta.name || '',
      label: meta.label || meta.name || '',
      quality: meta.quality || '',
      streamType: inferredType,
      type: inferredType,
      verified: Boolean(meta.verified === true),
      expiresHint: meta.expiresHint || (/[?&]token=/i.test(safeUrl) ? 'tokenized_url' : null),
      headers: meta.headers || {}
    });
  };

  // 0. Check if HTML itself is a VnxPlayer shell with inline `streamUrl`
  const vnxStreamMatch = html.match(/(?:let|const|var)\s+streamUrl\s*=\s*["'](https?:\/\/[^"'\s]+)["']/i);
  if (vnxStreamMatch && vnxStreamMatch[1]) {
    pushCandidate(vnxStreamMatch[1], {
      name: 'Anime4Up VnxPlayer Direct HLS',
      quality: 'AUTO-HLS',
      streamType: 'm3u8',
      type: 'm3u8',
      verified: false,
      headers: { Referer: baseUrl }
    });
  }

  // 1. Decode `input[name="wl"]` Base64 JSON field
  const wlBase64 = $('input[name="wl"]').attr('value') || '';
  if (wlBase64) {
    try {
      const decodedStr = Buffer.from(wlBase64, 'base64').toString('utf8').trim();
      const decodedJson = JSON.parse(decodedStr);
      if (decodedJson && typeof decodedJson === 'object') {
        for (const [qualityKey, val] of Object.entries(decodedJson)) {
          if (typeof val === 'string' && val.startsWith('http')) {
            pushCandidate(val, {
              name: `WL-${qualityKey.toUpperCase()}`,
              quality: qualityKey.toUpperCase()
            });
          } else if (Array.isArray(val)) {
            for (const entry of val) {
              const u = typeof entry === 'string' ? entry : entry?.link || entry?.url || entry?.src || '';
              if (u) {
                pushCandidate(u, {
                  name: entry?.name || entry?.server || `WL-${qualityKey.toUpperCase()}`,
                  quality: (entry?.quality || qualityKey || '').toUpperCase()
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore malformed Base64/JSON in input[name="wl"]
    }
  }

  // 2. Extract watch servers from `#episode-servers li[data-watch]` and `a[data-ep-url]`
  $('#episode-servers li, [data-watch], a[data-ep-url]').each((_, el) => {
    const node = $(el);
    const anchor = node.is('a') ? node : node.find('a').first();
    const iframeSrc = node.find('noscript iframe, iframe').attr('src') || '';
    const candidateUrl =
      node.attr('data-watch') ||
      node.attr('data-ep-url') ||
      anchor.attr('data-ep-url') ||
      anchor.attr('data-watch') ||
      anchor.attr('href') ||
      iframeSrc ||
      '';

    if (!candidateUrl || candidateUrl.startsWith('#') || candidateUrl.startsWith('javascript:')) return;

    const serverName =
      node.find('.watch-server-name').text().trim() ||
      anchor.text().trim() ||
      node.text().trim() ||
      'Server';
    const qualityText = node.find('.quality').text().trim() || '';

    pushCandidate(candidateUrl, {
      name: serverName.replace(/\s+/g, ' ').slice(0, 50),
      quality: qualityText === 'متعدد الجودات' ? 'MULTI' : qualityText,
      streamType: 'embed',
      type: 'embed',
      verified: false
    });
  });

  // 3. Extract download links from `#Synchronize-download` and live download tables (`a.btn.labeled.secondary`)
  $('#Synchronize-download a[href^="http"], .download-links a[href^="http"], a.btn.labeled.secondary[href^="http"]').each(
    (_, el) => {
      const href = $(el).attr('href') || '';
      if (!href) return;
      const row = $(el).closest('tr');
      const serverName =
        row.find('.server-name').text().trim() ||
        $(el).text().trim() ||
        'Download';
      const qualityText = row.find('.td-quality, .quality').text().trim() || '';
      pushCandidate(href, {
        name: serverName,
        quality: qualityText,
        streamType: 'download',
        type: 'download',
        verified: false
      });
    }
  );

  return normalizeAndSequenceServers(rawServers, baseUrl);
}

/**
 * Resolves a single server/embed URL (including Anime4Up's VnxPlayer S1/S2 endpoints)
 * into playable stream descriptors (`AP-1`, `AP-2`, ...).
 */
async function unwrapSingleCandidateServer(serverObj, parentReferer = ACTIVE_MIRROR_URL, options = {}) {
  const url = typeof serverObj === 'string' ? serverObj : serverObj?.url || '';
  if (!url) return [];

  // Direct media URL (.m3u8, .mp4, or workers.dev token stream)
  if (
    isDirectPlayableStreamUrl(url) ||
    serverObj?.streamType === 'm3u8' ||
    serverObj?.streamType === 'mp4'
  ) {
    const streamType =
      serverObj?.streamType === 'mp4' || /\.mp4(?:$|[?#&])/i.test(url) ? 'mp4' : 'm3u8';
    let verified = Boolean(serverObj?.verified === true);
    if (!verified && options.verify !== false && !options.fixtureHtml) {
      try {
        const probeRes = await fetchProviderHtml(url, {
          providerId: PROVIDER_ID,
          referer: serverObj?.headers?.Referer || parentReferer,
          timeoutMs: options.timeoutMs || 5000
        });
        if (probeRes.ok && (probeRes.html?.includes('#EXTM3U') || probeRes.status === 206)) {
          verified = true;
        }
      } catch {
        verified = false;
      }
    } else if (options.fixtureVerified === true) {
      verified = true;
    }
    return [
      {
        url,
        name: serverObj?.name || 'Anime4Up Direct',
        quality: serverObj?.quality || (streamType === 'm3u8' ? 'AUTO-HLS' : 'HD'),
        streamType,
        type: streamType,
        verified,
        expiresHint: /[?&]token=/i.test(url) ? 'tokenized_url' : null,
        headers: serverObj?.headers || { Referer: parentReferer }
      }
    ];
  }

  // VnxPlayer first-party Anime4up-S1 / Anime4up-S2 embed endpoints
  if (/\/Anime4up-S\d+\//i.test(url) || typeof options.vnxPlayerFixtureHtml === 'string') {
    try {
      const vnxRes = await fetchProviderHtml(url, {
        providerId: PROVIDER_ID,
        referer: parentReferer,
        timeoutMs: options.timeoutMs || 8000,
        fixtureHtml: options.vnxPlayerFixtureHtml
      });
      if (vnxRes.ok && vnxRes.html) {
        const m = vnxRes.html.match(/(?:let|const|var)\s+streamUrl\s*=\s*["'](https?:\/\/[^"'\s]+)["']/i);
        if (m && m[1]) {
          const directStreamUrl = m[1];
          let verified = false;
          if (options.verify !== false && !options.fixtureHtml && !options.vnxPlayerFixtureHtml) {
            try {
              const probeRes = await fetchProviderHtml(directStreamUrl, {
                providerId: PROVIDER_ID,
                referer: url,
                timeoutMs: options.timeoutMs || 5000
              });
              if (probeRes.ok && (probeRes.html?.includes('#EXTM3U') || probeRes.status === 206)) {
                verified = true;
              }
            } catch {
              verified = false;
            }
          } else if (options.fixtureVerified === true) {
            verified = true;
          }
          return [
            {
              url: directStreamUrl,
              name: serverObj?.name || 'Anime4Up VnxPlayer',
              quality: 'AUTO-HLS',
              streamType: 'm3u8',
              type: 'm3u8',
              verified,
              expiresHint: /[?&]token=/i.test(directStreamUrl) ? 'tokenized_url' : null,
              headers: { Referer: url }
            }
          ];
        }
      }
    } catch {
      // Fall through to generic unwrapper
    }
  }

  if (options.unwrap === false || typeof options.fixtureHtml === 'string') {
    return [];
  }

  try {
    const unwrapped = await unwrapEmbedToDirectStreams(url, parentReferer);
    if (Array.isArray(unwrapped) && unwrapped.length > 0) {
      return unwrapped
        .filter((s) => s?.url && !/\.mp4upload\.com\/(?:embed-)?[a-z0-9]+(?:\.html)?$/i.test(s.url))
        .map((s) => ({
          url: s.url,
          name: serverObj?.name || 'Anime4Up Stream',
          quality: s.quality || serverObj?.quality || '',
          streamType: s.streamType || 'm3u8',
          type: s.streamType || 'm3u8',
          verified: Boolean(s.verified === true),
          expiresHint: /[?&]token=/i.test(s.url) ? 'tokenized_url' : null,
          headers: s.headers || { Referer: parentReferer }
        }));
    }
  } catch {
    // Ignore individual embed unwrap failure
  }

  return [];
}

/**
 * Standardized Catalog Scraper (`scrapeCatalog`)
 */
export async function scrapeCatalog(category = 'anime_series', page = 1, options = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const catKey = String(category || 'anime_series').toLowerCase();
  const isMovieCat = /movie|movies|anime_movies/i.test(catKey);

  // Build candidate category paths (trying live vnxweb taxonomy slugs first, then legacy slugs)
  const basePaths = [];
  if (ANIME4UP_CONFIG.categories[catKey]) {
    basePaths.push(ANIME4UP_CONFIG.categories[catKey]);
  }
  if (isMovieCat) {
    if (!basePaths.includes('/anime-type/movie-3/')) basePaths.push('/anime-type/movie-3/');
    if (!basePaths.includes('/anime-type/movie/')) basePaths.push('/anime-type/movie/');
  } else {
    if (!basePaths.includes('/anime-type/tv2/')) basePaths.push('/anime-type/tv2/');
    if (!basePaths.includes('/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/')) {
      basePaths.push('/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/');
    }
    if (!basePaths.includes('/anime-type/tv/')) basePaths.push('/anime-type/tv/');
  }

  let lastError = null;
  for (const baseSub of basePaths) {
    const subPath = pageNum > 1 ? `${baseSub.replace(/\/?$/, '/')}page/${pageNum}/` : baseSub;
    try {
      const res = await fetchAnime4UpPage(subPath, options);
      if (!res.ok || !res.html) continue;

      const $ = cheerio.load(res.html);
      const items = parseCatalogItems($, res.url || ACTIVE_MIRROR_URL, isMovieCat ? 'movie' : 'series');
      if (items.length > 0) {
        return attachResultMeta(items, {
          ok: true,
          providerId: PROVIDER_ID,
          url: res.url
        });
      }

      // If fixtureHtml was explicitly supplied and had 0 cards (e.g., gateway HTML), stop immediately
      if (typeof options.fixtureHtml === 'string') {
        return createEmptyArrayResult(
          PROVIDER_ID,
          SCRAPER_ERROR_CODES.EMPTY_RESULT,
          'No catalog items found in provided fixture HTML',
          { url: res.url }
        );
      }
    } catch (err) {
      lastError = classifyNetworkError(err, { providerId: PROVIDER_ID, url: subPath });
      if (typeof options.fixtureHtml === 'string') break;
    }
  }

  if (lastError) {
    return createEmptyArrayResult(PROVIDER_ID, lastError.code, lastError.message, {
      url: lastError.url
    });
  }

  return createEmptyArrayResult(
    PROVIDER_ID,
    SCRAPER_ERROR_CODES.EMPTY_RESULT,
    `No catalog items found for category=${category} page=${pageNum}`
  );
}

/**
 * Standardized Search Scraper (`scrapeSearch`)
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery && typeof options.fixtureHtml !== 'string') {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const encoded = encodeURIComponent(cleanQuery);
  const searchPath =
    pageNum > 1
      ? `/page/${pageNum}/?search_param=animes&s=${encoded}`
      : `/?search_param=animes&s=${encoded}`;

  try {
    const res = await fetchAnime4UpPage(searchPath, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search response', {
        url: res.url
      });
    }

    const $ = cheerio.load(res.html);
    const items = parseCatalogItems($, res.url || ACTIVE_MIRROR_URL, 'series');
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `No search results for "${cleanQuery}"`,
        { url: res.url }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: res.url
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: searchPath });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: classified.url
    });
  }
}

/**
 * Standardized Details Scraper (`scrapeDetails`)
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);
  if (!targetUrl) {
    return attachResultMeta(
      {
        status: 'error',
        source: PROVIDER_ID,
        episodes: [],
        servers: []
      },
      {
        ok: false,
        errorCode: SCRAPER_ERROR_CODES.UNSAFE_URL,
        errorMessage: 'Invalid details URL',
        providerId: PROVIDER_ID
      }
    );
  }

  try {
    const res = await fetchAnime4UpPage(targetUrl, options);
    const effectiveUrl = res.url || targetUrl;
    const $ = cheerio.load(res.html || '');

    const rawTitle =
      $('h1.anime-details-title, .anime-details-title, h1.entry-title, h1').first().text().trim() ||
      $('title').first().text().replace(/\s*-\s*Anime4up.*$/i, '').trim();

    const thumbImg = $('.anime-thumbnail img, .anime-poster img, .anime-card-poster img').first();
    const rawPoster =
      thumbImg.attr('data-src') ||
      thumbImg.attr('data-image') ||
      thumbImg.attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      '';

    const overview =
      $('p.anime-story, .anime-story, p.story, .story').first().text().trim() ||
      $('meta[name="description"]').attr('content') ||
      '';

    const genres = [];
    $('ul.anime-genres li a, .anime-genres a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const infoText = $('.anime-info').text();
    const year = extractYear(`${rawTitle} ${infoText}`);

    const episodes = parseEpisodesFromHtml($, effectiveUrl);
    const servers = extractRawServersFromHtml(res.html, effectiveUrl);

    const normalized = normalizeDetailsResult(
      {
        title: rawTitle,
        poster: rawPoster,
        overview,
        year,
        genres,
        episodes,
        servers,
        source: PROVIDER_ID,
        sourceUrl: effectiveUrl
      },
      {
        providerId: PROVIDER_ID,
        baseUrl: effectiveUrl,
        allowHttp: true
      }
    );

    const enriched = {
      ...normalized,
      status: rawTitle || episodes.length > 0 ? 'success' : 'empty',
      movie_title: normalized.title || 'تفاصيل الأنمي',
      episodes
    };

    const hasContent = Boolean(normalized.title || episodes.length > 0 || servers.length > 0);
    return attachResultMeta(enriched, {
      ok: hasContent,
      errorCode: hasContent ? null : SCRAPER_ERROR_CODES.STRUCTURE_CHANGED,
      errorMessage: hasContent ? null : 'No title, episodes, or servers found in details HTML',
      providerId: PROVIDER_ID,
      url: effectiveUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return attachResultMeta(
      {
        status: 'error',
        source: PROVIDER_ID,
        title: '',
        movie_title: '',
        poster: '',
        overview: '',
        episodes: [],
        servers: []
      },
      {
        ok: false,
        errorCode: classified.code,
        errorMessage: classified.message,
        providerId: PROVIDER_ID,
        url: targetUrl
      }
    );
  }
}

/**
 * Standardized Episodes Scraper (`scrapeEpisodes`)
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid episodes URL');
  }

  try {
    const res = await fetchAnime4UpPage(targetUrl, options);
    const effectiveUrl = res.url || targetUrl;
    const $ = cheerio.load(res.html || '');
    const episodes = parseEpisodesFromHtml($, effectiveUrl);

    if (episodes.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No episodes found on page',
        { url: effectiveUrl }
      );
    }

    return attachResultMeta(episodes, {
      ok: true,
      providerId: PROVIDER_ID,
      url: effectiveUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Standardized Servers Scraper (`scrapeServers`)
 * Extracts watch/download servers (`AP-1`, `AP-2`, ...) from an episode page,
 * decoding `input[name="wl"]` Base64 JSON, `#episode-servers li[data-watch]`,
 * `#episode-servers li a[data-ep-url]`, and `#Synchronize-download` links.
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid episode URL');
  }

  try {
    const res = await fetchAnime4UpPage(targetUrl, options);
    const effectiveUrl = res.url || targetUrl;
    const rawServers = extractRawServersFromHtml(res.html || '', effectiveUrl);

    if (rawServers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No servers found on Anime4Up episode page',
        { url: effectiveUrl }
      );
    }

    // If options.unwrap === true, resolve embeds to direct streams and prepend them before fallback servers
    if (options.unwrap === true) {
      const unwrappedNested = await Promise.all(
        rawServers.slice(0, 7).map((srv) => unwrapSingleCandidateServer(srv, effectiveUrl, options))
      );
      const directList = unwrappedNested.flat();
      if (directList.length > 0) {
        const combined = normalizeAndSequenceServers([...directList, ...rawServers], effectiveUrl);
        return attachResultMeta(combined, {
          ok: true,
          providerId: PROVIDER_ID,
          url: effectiveUrl
        });
      }
    }

    return attachResultMeta(rawServers, {
      ok: true,
      providerId: PROVIDER_ID,
      url: effectiveUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Standardized Stream Resolver (`resolveStream`)
 * Resolves an Anime4Up episode URL, VnxPlayer URL (`/Anime4up-S1/...`), or embed URL into playable stream(s).
 */
export async function resolveStream(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream URL');
  }

  try {
    // 1. If targetUrl is already a direct .m3u8 / .mp4 or workers.dev HLS stream
    if (isDirectPlayableStreamUrl(targetUrl) && typeof options.fixtureHtml !== 'string') {
      let verified = Boolean(options.fixtureVerified === true);
      if (!verified && options.verify !== false) {
        try {
          const probeRes = await fetchProviderHtml(targetUrl, {
            providerId: PROVIDER_ID,
            referer: options.referer || ACTIVE_MIRROR_URL,
            timeoutMs: options.timeoutMs || 5000
          });
          if (probeRes.ok && (probeRes.html?.includes('#EXTM3U') || probeRes.status === 206)) {
            verified = true;
          }
        } catch {
          verified = false;
        }
      }
      const streamType = /\.mp4(?:$|[?#&])/i.test(targetUrl) ? 'mp4' : 'm3u8';
      const normalized = normalizeAndSequenceServers(
        [
          {
            url: targetUrl,
            name: 'Anime4Up Direct Stream',
            quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
            streamType,
            type: streamType,
            verified,
            expiresHint: /[?&]token=/i.test(targetUrl) ? 'tokenized_url' : null,
            headers: options.referer ? { Referer: options.referer } : {}
          }
        ],
        targetUrl
      );
      return attachResultMeta(normalized, {
        ok: true,
        providerId: PROVIDER_ID,
        url: targetUrl
      });
    }

    // 2. Fetch the target page (episode page or VnxPlayer shell)
    const res = await fetchAnime4UpPage(targetUrl, options);
    const effectiveUrl = res.url || targetUrl;
    const html = res.html || '';

    // Check for direct streams in page text or VnxPlayer `let streamUrl = "..."`
    const candidates = extractRawServersFromHtml(html, effectiveUrl);
    const rawTextStreams = extractRawStreamsFromText(html, effectiveUrl).filter(
      (s) => s?.url && !/\.mp4upload\.com/i.test(s.url)
    );

    // Unwrap top candidate servers (including VnxPlayer S1/S2 -> direct HLS)
    const unwrappedGroups = await Promise.all(
      candidates.slice(0, 7).map((srv) => unwrapSingleCandidateServer(srv, effectiveUrl, options))
    );
    const resolvedStreams = [...rawTextStreams, ...unwrappedGroups.flat()];

    const finalServers = normalizeAndSequenceServers([...resolvedStreams, ...candidates], effectiveUrl);

    if (finalServers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable streams resolved from Anime4Up page',
        { url: effectiveUrl }
      );
    }

    return attachResultMeta(finalServers, {
      ok: true,
      providerId: PROVIDER_ID,
      url: effectiveUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Backward-compatible combined extractor (`extractAnime4UpStreamsAndEpisodes`)
 * used by `server/scrapers/index.mjs`.
 */
export async function extractAnime4UpStreamsAndEpisodes(targetUrl, options = {}) {
  const resolvedUrl = resolveTargetUrl(targetUrl);
  if (!resolvedUrl) {
    return { episodes: [], servers: [] };
  }

  try {
    const res = await fetchAnime4UpPage(resolvedUrl, options);
    const effectiveUrl = res.url || resolvedUrl;
    const html = res.html || '';
    const $ = cheerio.load(html);

    const episodes = parseEpisodesFromHtml($, effectiveUrl);
    const rawServers = extractRawServersFromHtml(html, effectiveUrl);

    // Unwrap candidate servers into direct .m3u8 / .mp4 streams and prepend before fallback servers
    const unwrappedGroups = await Promise.all(
      rawServers.slice(0, 7).map((srv) => unwrapSingleCandidateServer(srv, effectiveUrl, options))
    );
    const unwrappedDirect = unwrappedGroups.flat();

    const servers = normalizeAndSequenceServers([...unwrappedDirect, ...rawServers], effectiveUrl);

    return attachResultMeta(
      {
        episodes,
        servers
      },
      {
        ok: episodes.length > 0 || servers.length > 0,
        providerId: PROVIDER_ID,
        url: effectiveUrl
      }
    );
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: resolvedUrl });
    return attachResultMeta(
      { episodes: [], servers: [] },
      {
        ok: false,
        errorCode: classified.code,
        errorMessage: classified.message,
        providerId: PROVIDER_ID,
        url: resolvedUrl
      }
    );
  }
}

// Backward-compatible aliases required by supervisors and master index
export const scrapeAnime4UpCategory = scrapeCatalog;
export const scrapeAnime4upCatalog = scrapeCatalog;
export const searchAnime4Up = scrapeSearch;
export const scrapeAnime4UpSearch = scrapeSearch;
export const scrapeAnime4upDetails = scrapeDetails;
export const scrapeAnime4UpEpisodes = scrapeEpisodes;
export const extractAnime4UpServers = scrapeServers;
export const resolveAnime4UpStream = resolveStream;

export default {
  PROVIDER_META,
  ANIME4UP_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeAnime4UpCategory,
  scrapeAnime4upCatalog,
  searchAnime4Up,
  scrapeAnime4UpSearch,
  scrapeAnime4upDetails,
  scrapeAnime4UpEpisodes,
  extractAnime4UpServers,
  resolveAnime4UpStream,
  extractAnime4UpStreamsAndEpisodes
};
