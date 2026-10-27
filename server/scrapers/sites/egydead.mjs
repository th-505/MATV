// server/scrapers/sites/egydead.mjs
// Standalone provider scraper for EgyDead (إيجي ديد - egydead, code: ED, live stream: egydead_live, code: EL)
//
// Live State (2026-10-17):
// - w1.egydead.top, egydead.live, tv10.egydead.live are protected by Cloudflare Bot Management Challenge
//   (HTTP 403, cf-mitigated: challenge, "Just a moment...").
// - Accurately classified as ACCESS_BLOCKED. Full deterministic parsing is supported via options.fixtureHtml.

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
  cleanTitleText
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

export const PROVIDER_ID = 'egydead';
export const PROVIDER_NAME = 'إيجي ديد (EgyDead)';
export const PROVIDER_CODE = 'ED';

export const LIVE_PROVIDER_ID = 'egydead_live';
export const LIVE_PROVIDER_NAME = 'EgyDead Live TV';
export const LIVE_PROVIDER_CODE = 'EL';

export const PRIMARY_DOMAIN = 'https://w1.egydead.top';
export const SECONDARY_DOMAIN = 'https://egydead.live';
export const LIVE_DOMAIN = 'https://tv10.egydead.live';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([
    PRIMARY_DOMAIN,
    SECONDARY_DOMAIN,
    LIVE_DOMAIN
  ]),
  mirrorOf: null,
  capabilities: Object.freeze({
    catalog: true,
    search: true,
    details: true,
    episodes: true,
    servers: true,
    resolve: true,
    live: true
  }),
  searchSpec: Object.freeze({
    method: 'GET',
    pathTemplate: '/?s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: '/page/{page}/?s={query}'
  }),
  notImplemented: Object.freeze({})
});

export const EGYDEAD_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  liveKey: LIVE_PROVIDER_ID,
  liveCode: LIVE_PROVIDER_CODE,
  baseUrl: PRIMARY_DOMAIN,
  fallbackDomain: SECONDARY_DOMAIN,
  liveDomain: LIVE_DOMAIN,
  domains: PROVIDER_META.domains,
  categories: Object.freeze({
    movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    movies_all: '/movies/',
    movies_foreign: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    movies_arabic: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%b9%d8%b1%d8%a8%d9%8a/',
    movies_turkish: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    movies_asian: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    movies_indian: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a%d8%a9/',
    series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    series_all: '/series/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    series_turkish: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    series_turkish_dubbed: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9-%d9%85%d8%af%d8%a8%d9%84%d8%ac%d8%a9/',
    series_asian: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    anime_movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%83%d8%b1%d8%aa%d9%88%d9%86/',
    anime_series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d9%86%d9%85%d9%8a/'
  })
});

/**
 * Resolves a URL or encoded reference (e.g. egydead:..., egydead_tv:..., or base64url)
 * to a validated absolute URL.
 */
export function resolveTargetUrl(urlOrRef = '', baseUrl = EGYDEAD_CONFIG.baseUrl) {
  if (!urlOrRef || typeof urlOrRef !== 'string') return '';
  const trimmed = urlOrRef.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('egydead:') || trimmed.startsWith('egydead_tv:') || trimmed.startsWith('egydead_live:')) {
    const colonIdx = trimmed.indexOf(':');
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (rest.startsWith('http://') || rest.startsWith('https://')) {
      return resolveSafeUrl(rest, baseUrl);
    }
    try {
      const decoded = Buffer.from(rest, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return resolveSafeUrl(decoded, baseUrl);
      }
      if (decoded.startsWith('/')) {
        return resolveSafeUrl(decoded, baseUrl);
      }
    } catch (_) {}
    if (rest.startsWith('/')) {
      return resolveSafeUrl(rest, baseUrl);
    }
  }

  return resolveSafeUrl(trimmed, baseUrl);
}

/**
 * Parses catalog or search item cards from HTML.
 */
export function parseCatalogItems(html = '', baseUrl = EGYDEAD_CONFIG.baseUrl, defaultType = 'movie') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $('li.movieItem, .BlockItem, .movie-item, .post-item, .pinbox, article.pinbox').each((_, el) => {
    const node = $(el);
    const a = node.find('a[href]').first();
    const rawHref = a.attr('href') || node.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const rawTitle =
      node.find('h1.BottomTitle, .ItemTitle, h2.title-2, .title, h3').first().text().trim() ||
      a.attr('title')?.trim() ||
      node.find('img').attr('alt')?.trim() ||
      '';
    if (!rawTitle) return;

    const img = node.find('img').first();
    const poster = resolveSafeUrl(
      img.attr('data-src') || img.attr('src') || '',
      baseUrl
    );

    const cleanTitle = cleanTitleText(rawTitle);
    const year = extractYear(rawTitle) || node.find('.year, .ItemYear, .badge-secondary').first().text().trim();
    const quality = node.find('.quality, ._quality_tag, .label').first().text().trim() || '';
    const rating = node.find('.rate, .rating').first().text().replace(/[^\d.]/g, '').trim();

    const inferredType = inferContentType(rawTitle, url, defaultType);
    const ref = `${PROVIDER_ID}:${Buffer.from(url).toString('base64url')}`;

    const item = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: cleanTitle,
        originalTitle: rawTitle,
        url,
        poster,
        year,
        quality,
        rating,
        category: inferredType,
        type: inferredType,
        source: PROVIDER_ID
      },
      { providerId: PROVIDER_ID, baseUrl, defaultType: inferredType }
    );

    if (item) {
      item.serverPrefix = PROVIDER_CODE;
      item.is_series = inferredType === 'series';
      items.push(item);
    }
  });

  return items;
}

/**
 * Parses episode links from details or series page HTML.
 */
export function parseEpisodesFromHtml(html = '', baseUrl = EGYDEAD_CONFIG.baseUrl, defaultSeason = 1) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rawEpisodes = [];

  $('.EpsList li a, .EpisodesList a, .ep-link, ul.episodes a, .episodes-list a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const url = resolveSafeUrl(epHref, baseUrl);
    if (!url) return;

    const epText = $(el).text().trim() || $(el).attr('title') || '';
    const num = extractEpisodeNumber(epText, url, idx + 1);
    const season = extractSeasonNumber(epText, defaultSeason);

    rawEpisodes.push({
      id: `${PROVIDER_ID}:ep:${Buffer.from(url).toString('base64url')}`,
      ref: `${PROVIDER_ID}:${url}`,
      url,
      number: num,
      season,
      title: epText || `الحلقة ${num}`
    });
  });

  return normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_ID,
    baseUrl,
    defaultSeason
  });
}

/**
 * Parses watch servers and download streams from watch page HTML.
 */
export function parseServersFromHtml(html = '', targetUrl = PRIMARY_DOMAIN, isLive = false) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const servers = [];
  const seenUrls = new Set();
  const codePrefix = isLive ? LIVE_PROVIDER_CODE : PROVIDER_CODE;
  const provider = isLive ? LIVE_PROVIDER_ID : PROVIDER_ID;

  // 1. Direct download / stream links (.mp4, .m3u8)
  $('.donwload-servers-list li a.ser-link, .download-servers-list a, a.direct-download').each((_, el) => {
    const rawHref = $(el).attr('href') || '';
    const url = resolveSafeUrl(rawHref, targetUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const isHls = url.toLowerCase().includes('.m3u8') || url.toLowerCase().includes('/hls/');
    const isMp4 = url.toLowerCase().includes('.mp4');
    const label = $(el).text().trim() || (isHls ? 'HLS Direct' : 'Direct MP4');
    const idx = servers.length + 1;
    const code = `${codePrefix}-${idx}`;

    servers.push({
      id: `${provider}-${idx}`,
      code,
      serverCode: code,
      name: label,
      label,
      url,
      type: isHls ? 'm3u8' : isMp4 ? 'mp4' : 'download',
      streamType: isHls ? 'm3u8' : isMp4 ? 'mp4' : 'download',
      quality: label.includes('1080') ? '1080p' : label.includes('720') ? '720p' : 'Direct-HD',
      verified: false,
      source: provider,
      headers: { Referer: targetUrl }
    });
  });

  // 2. Embedded third-party servers from ul.serversList li[data-link]
  $('ul.serversList li, .serversList li, .server-item').each((_, el) => {
    const rawLink = $(el).attr('data-link') || $(el).attr('data-url') || $(el).attr('data-src') || $(el).find('a').attr('href') || '';
    const url = resolveSafeUrl(rawLink, targetUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const srvName = $(el).attr('data-server') || $(el).text().trim() || `Server ${servers.length + 1}`;
    const idx = servers.length + 1;
    const code = `${codePrefix}-${idx}`;
    const isHls = url.toLowerCase().includes('.m3u8');
    const isMp4 = url.toLowerCase().includes('.mp4');
    const type = isHls ? 'm3u8' : isMp4 ? 'mp4' : 'embed';

    servers.push({
      id: `${provider}-${idx}`,
      code,
      serverCode: code,
      name: srvName,
      label: srvName,
      url,
      type,
      streamType: type,
      quality: null,
      verified: false,
      source: provider,
      headers: { Referer: targetUrl }
    });
  });

  // 3. Fallback iframe embed
  $('iframe#main-player, .player-wrapper iframe, .player iframe').each((_, el) => {
    const rawIframe = $(el).attr('src') || $(el).attr('data-src') || '';
    const url = resolveSafeUrl(rawIframe, targetUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const idx = servers.length + 1;
    const code = `${codePrefix}-${idx}`;
    servers.push({
      id: `${provider}-${idx}`,
      code,
      serverCode: code,
      name: `Main Player #${idx}`,
      label: `Main Player #${idx}`,
      url,
      type: 'embed',
      streamType: 'embed',
      quality: null,
      verified: false,
      source: provider,
      headers: { Referer: targetUrl }
    });
  });

  return servers;
}

/**
 * Parses Live IPTV channels from https://tv10.egydead.live/ HTML
 */
export function parseLiveChannelsFromHtml(html = '', baseUrl = LIVE_DOMAIN) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const channels = [];
  const seenUrls = new Set();

  $('.channel-card, .channel-item, .tv-item, a[href*="/channel/"]').each((idx, el) => {
    const node = $(el);
    const link = node.is('a') ? node : node.find('a[href]').first();
    const rawHref = link.attr('href') || node.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);

    const name =
      node.find('.channel-name, h3, .title').text().trim() ||
      link.attr('title')?.trim() ||
      node.text().trim();
    if (!name) return;

    const img = node.find('img').first();
    const poster = resolveSafeUrl(img.attr('data-src') || img.attr('src') || '', baseUrl);
    const streamCode = `${LIVE_PROVIDER_CODE}-${idx + 1}`;

    channels.push({
      id: `${LIVE_PROVIDER_ID}:${Buffer.from(url).toString('base64url')}`,
      ref: `${LIVE_PROVIDER_ID}:${url}`,
      name,
      title: name,
      url,
      sourceUrl: url,
      poster,
      image: poster,
      category: 'live',
      type: 'live',
      source: LIVE_PROVIDER_ID,
      serverPrefix: LIVE_PROVIDER_CODE,
      streams: [
        {
          code: streamCode,
          serverCode: streamCode,
          name: `${name} Live`,
          url,
          type: 'embed',
          streamType: 'embed',
          source: LIVE_PROVIDER_ID,
          headers: { Referer: baseUrl }
        }
      ]
    });
  });

  return channels;
}

/**
 * 1. scrapeCatalog(category, page, options)
 */
export async function scrapeCatalog(category = 'movies', page = 1, options = {}) {
  const host = options.useLiveDomain ? EGYDEAD_CONFIG.liveDomain : EGYDEAD_CONFIG.baseUrl;
  const catPath = EGYDEAD_CONFIG.categories[category] || EGYDEAD_CONFIG.categories.movies;
  const isPagePath = catPath.endsWith('/');
  const targetUrl =
    page > 1
      ? isPagePath
        ? `${host}${catPath}page/${page}/`
        : `${host}${catPath}?page=${page}`
      : `${host}${catPath}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: host
    });

    if (!res.ok) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = parseCatalogItems(
      res.html,
      host,
      category.startsWith('series') ? 'series' : 'movie'
    );

    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_CATALOG_ITEMS_FOUND', {
        url: targetUrl
      });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      page,
      category
    });
  } catch (err) {
    if (options.strict) throw err;
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, { url: targetUrl });
  }
}

/**
 * 2. scrapeSearch(query, page, options)
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'EMPTY_QUERY');
  }

  const host = options.baseUrl || EGYDEAD_CONFIG.baseUrl;
  const encodedQ = encodeURIComponent(cleanQ);
  const targetUrl =
    page > 1
      ? `${host}/page/${page}/?s=${encodedQ}`
      : `${host}/?s=${encodedQ}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: host
    });

    if (!res.ok) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = parseCatalogItems(res.html, host, 'movie');

    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_SEARCH_RESULTS', {
        url: targetUrl,
        query: cleanQ
      });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      query: cleanQ,
      page
    });
  } catch (err) {
    if (options.strict) throw err;
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, { url: targetUrl, query: cleanQ });
  }
}

/**
 * 3. scrapeDetails(urlOrRef, options)
 */
export async function scrapeDetails(urlOrRef = '', options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef, EGYDEAD_CONFIG.baseUrl);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_DETAILS_TARGET_URL', {
      providerId: PROVIDER_ID,
      url: String(urlOrRef)
    });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: EGYDEAD_CONFIG.baseUrl
    });

    if (!res.ok) {
      throw new ScraperError(SCRAPER_ERROR_CODES.STRUCTURE_CHANGED, `HTTP_${res.status}_DETAILS`, {
        providerId: PROVIDER_ID,
        url: targetUrl,
        status: res.status
      });
    }

    const $ = cheerio.load(res.html);
    const rawTitle =
      $('h1.ItemTitle, h1.BottomTitle, h1').first().text().trim() ||
      $('title').text().replace(/-?\s*إيجي ديد.*$/i, '').trim();

    if (!rawTitle) {
      throw new ScraperError(SCRAPER_ERROR_CODES.STRUCTURE_CHANGED, 'DETAILS_TITLE_NOT_FOUND', {
        providerId: PROVIDER_ID,
        url: targetUrl
      });
    }

    const title = cleanTitleText(rawTitle);
    const img = $('.ItemPoster img, .poster img, img').first();
    const poster = resolveSafeUrl(img.attr('data-src') || img.attr('src') || '', targetUrl);
    const overview = $('.StoryContent, .story, .overview, p.story').text().trim();
    const year = extractYear(rawTitle) || $('.release-year, .ItemYear').text().trim();
    const rating = $('.item-rating, .rate').text().replace(/[^\d.]/g, '').trim();
    const quality = $('.item-quality, .quality').text().trim() || '';

    const genres = [];
    $('.genres a, .genre a').each((_, el) => {
      const g = $(el).text().trim();
      if (g) genres.push(g);
    });

    const detectedSeason = extractSeasonNumber(`${rawTitle} ${targetUrl}`, 1);
    const episodes = parseEpisodesFromHtml(res.html, targetUrl, detectedSeason);
    const servers = parseServersFromHtml(res.html, targetUrl, false);
    const isSeries = targetUrl.includes('/series/') || targetUrl.includes('/episode/') || episodes.length > 0;

    const details = normalizeDetailsResult(
      {
        id: `${PROVIDER_ID}:${Buffer.from(targetUrl).toString('base64url')}`,
        ref: `${PROVIDER_ID}:${targetUrl}`,
        title,
        originalTitle: rawTitle,
        poster,
        overview,
        story: overview,
        year,
        type: isSeries ? 'series' : 'movie',
        rating,
        quality,
        genres,
        episodes,
        servers,
        source: PROVIDER_ID,
        sourceUrl: targetUrl
      },
      { providerId: PROVIDER_ID, baseUrl: targetUrl }
    );

    details.serverPrefix = PROVIDER_CODE;
    details.is_series = isSeries;

    return attachResultMeta(details, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    throw classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
  }
}

/**
 * 4. scrapeEpisodes(urlOrRef, options)
 */
export async function scrapeEpisodes(urlOrRef = '', options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef, EGYDEAD_CONFIG.baseUrl);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_EPISODES_TARGET_URL', {
      providerId: PROVIDER_ID,
      url: String(urlOrRef)
    });
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: EGYDEAD_CONFIG.baseUrl
    });

    if (!res.ok) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const detectedSeason = extractSeasonNumber(targetUrl, 1);
    const episodes = parseEpisodesFromHtml(res.html, targetUrl, detectedSeason);
    if (episodes.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_EPISODES_FOUND', {
        url: targetUrl
      });
    }

    return attachResultMeta(episodes, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    throw classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
  }
}

/**
 * 5. scrapeServers(urlOrRef, options)
 */
export async function scrapeServers(urlOrRef = '', options = {}) {
  const isChannel = String(urlOrRef).includes('egydead_tv') || String(urlOrRef).includes('/channel/');
  const defaultHost = isChannel ? EGYDEAD_CONFIG.liveDomain : EGYDEAD_CONFIG.baseUrl;
  const targetUrl = resolveTargetUrl(urlOrRef, defaultHost);

  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_SERVERS_TARGET_URL', {
      providerId: PROVIDER_ID,
      url: String(urlOrRef)
    });
  }

  try {
    // If live domain or channel page:
    if (isChannel || targetUrl.includes('egydead.live') || targetUrl.includes('/channel/')) {
      const res = await fetchProviderHtml(targetUrl, {
        ...options,
        providerId: LIVE_PROVIDER_ID,
        referer: EGYDEAD_CONFIG.liveDomain
      });

      const servers = parseServersFromHtml(res.html, targetUrl, true);
      if (servers.length === 0) {
        // Fallback default stream for live channel
        servers.push({
          id: `${LIVE_PROVIDER_ID}-1`,
          code: `${LIVE_PROVIDER_CODE}-1`,
          serverCode: `${LIVE_PROVIDER_CODE}-1`,
          name: 'Live Stream #1',
          label: 'Live Stream #1',
          url: targetUrl,
          type: 'embed',
          streamType: 'embed',
          quality: null,
          verified: false,
          source: LIVE_PROVIDER_ID,
          headers: { Referer: EGYDEAD_CONFIG.liveDomain }
        });
      }

      return attachResultMeta(servers, {
        ok: true,
        providerId: LIVE_PROVIDER_ID,
        url: targetUrl
      });
    }

    // Movies/series: EgyDead watch page
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: EGYDEAD_CONFIG.baseUrl
    });

    const servers = parseServersFromHtml(res.html, targetUrl, false);
    if (servers.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_SERVERS_FOUND', {
        url: targetUrl
      });
    }

    return attachResultMeta(servers, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    throw classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
  }
}

/**
 * 6. resolveStream(urlOrRef, options)
 */
export async function resolveStream(urlOrRef = '', options = {}) {
  // Support offline fixture injection
  if (options.fixtureStream && typeof options.fixtureStream === 'object') {
    return options.fixtureStream;
  }

  const rawUrl = typeof urlOrRef === 'object' ? urlOrRef.url || urlOrRef.embedUrl || '' : String(urlOrRef || '');
  const serverCode = (typeof urlOrRef === 'object' && urlOrRef.code) || 'ED-1';
  const isLive = serverCode.startsWith('EL') || String(rawUrl).includes('egydead_live') || String(rawUrl).includes('/channel/');
  const provider = isLive ? LIVE_PROVIDER_ID : PROVIDER_ID;
  const referer = isLive ? EGYDEAD_CONFIG.liveDomain : EGYDEAD_CONFIG.baseUrl;

  const targetUrl = resolveSafeUrl(rawUrl, referer);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_STREAM_URL', {
      providerId: provider,
      url: rawUrl
    });
  }

  // 1. Direct media streams (.m3u8 or .mp4)
  if (isValidDirectMediaUrl(targetUrl)) {
    const isHls = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls/');
    return {
      provider,
      code: serverCode,
      serverCode,
      url: targetUrl,
      streamUrl: targetUrl,
      streamType: isHls ? 'm3u8' : 'mp4',
      type: isHls ? 'm3u8' : 'mp4',
      quality: options.quality || (isHls ? 'AUTO-HLS' : '1080p'),
      verified: options.skipVerification !== true,
      headers: { Referer: referer }
    };
  }

  // 2. Embedded third-party stream unwrapping (ok.ru, streamwish, doodstream, vidmoly, etc.)
  try {
    const unwrapped = await unwrapEmbedToDirectStreams(targetUrl, referer);
    if (Array.isArray(unwrapped) && unwrapped.length > 0) {
      const best = unwrapped[0];
      return {
        provider,
        code: serverCode,
        serverCode,
        url: best.url,
        streamUrl: best.url,
        streamType: best.streamType || 'm3u8',
        type: best.streamType || 'm3u8',
        quality: best.quality || '',
        verified: true,
        headers: best.headers || { Referer: referer }
      };
    }
  } catch (_) {}

  // 3. Unresolved embed fallback
  return {
    provider,
    code: serverCode,
    serverCode,
    url: targetUrl,
    embedUrl: targetUrl,
    streamType: 'embed',
    type: 'embed',
    quality: null,
    verified: false,
    headers: { Referer: referer }
  };
}

/**
 * 7. scrapeLive(options)
 * Scrapes live IPTV channels from https://tv10.egydead.live/
 */
export async function scrapeLive(options = {}) {
  const targetUrl = EGYDEAD_CONFIG.liveDomain;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: LIVE_PROVIDER_ID,
      referer: targetUrl
    });

    if (!res.ok) {
      return createEmptyArrayResult(LIVE_PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const channels = parseLiveChannelsFromHtml(res.html, targetUrl);
    if (channels.length === 0) {
      return createEmptyArrayResult(LIVE_PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_LIVE_CHANNELS_FOUND', {
        url: targetUrl
      });
    }

    return attachResultMeta(channels, {
      ok: true,
      providerId: LIVE_PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    throw classifyNetworkError(err, { providerId: LIVE_PROVIDER_ID, url: targetUrl });
  }
}

// =====================================================================
// BACKWARD-COMPATIBLE NAMED EXPORTS (Required by server/scrapers/index.mjs & Supervisors)
// =====================================================================

export async function scrapeEgyDeadCategory(catKey = 'movies_foreign', page = 1, useLiveDomain = false, options = {}) {
  const items = await scrapeCatalog(catKey, page, { ...options, useLiveDomain });
  return items.map((it) => ({
    id: it.id || `egydead:${Buffer.from(it.url).toString('base64url')}`,
    ref: it.ref || `egydead:${Buffer.from(it.url).toString('base64url')}`,
    title: it.title,
    poster: it.poster,
    url: it.url,
    source: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE,
    type: it.type || (catKey.startsWith('series') ? 'series' : 'movie'),
    is_series: it.type !== 'movie'
  }));
}

export async function extractEgyDeadStreamsAndEpisodes(targetUrl, options = {}) {
  const cleanUrl = resolveTargetUrl(targetUrl, EGYDEAD_CONFIG.baseUrl);
  if (!cleanUrl) return { episodes: [], servers: [] };

  try {
    const details = await scrapeDetails(cleanUrl, options);
    let servers = details.servers || [];

    if (servers.length === 0) {
      try {
        servers = await scrapeServers(cleanUrl, options);
      } catch (_) {}
    }

    return {
      ...details,
      movie_title: details.title,
      episodes: details.episodes || [],
      servers,
      media_sources: servers
    };
  } catch (err) {
    return { episodes: [], servers: [] };
  }
}

export async function scrapeEgyDeadCatalog(type = 'movie', page = 1, options = {}) {
  return scrapeCatalog(type === 'series' ? 'series' : 'movies', page, options);
}

export async function scrapeEgyDeadDetails(targetUrl, options = {}) {
  return scrapeDetails(targetUrl, options);
}

export async function scrapeEgyDeadLiveChannels(options = {}) {
  return scrapeLive(options);
}

export async function searchEgyDead(query, page = 1, options = {}) {
  return scrapeSearch(query, page, options);
}

export default {
  PROVIDER_ID,
  PROVIDER_NAME,
  PROVIDER_CODE,
  LIVE_PROVIDER_ID,
  LIVE_PROVIDER_NAME,
  LIVE_PROVIDER_CODE,
  PROVIDER_META,
  EGYDEAD_CONFIG,
  resolveTargetUrl,
  parseCatalogItems,
  parseEpisodesFromHtml,
  parseServersFromHtml,
  parseLiveChannelsFromHtml,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive,
  scrapeEgyDeadCategory,
  extractEgyDeadStreamsAndEpisodes,
  scrapeEgyDeadCatalog,
  scrapeEgyDeadDetails,
  scrapeEgyDeadLiveChannels,
  searchEgyDead
};
