// server/scrapers/sites/mycima.mjs
// Standalone provider module for ماي سيما / وي سيما (MyCima / WeCima) — Code: MA

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl
} from '../shared/http.mjs';
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
import { buildAntiBanHeaders, generateAntiBanHeaders } from '../anti-ban.mjs';

export const PROVIDER_ID = 'mycima';
export const PROVIDER_NAME = 'ماي سيما (MyCima / WeCima)';
export const PROVIDER_CODE = 'MA';
export const PRIMARY_BASE_URL = 'https://mycima.gripe';
export const MIRROR_DOMAINS = Object.freeze([
  'https://wecima.show',
  'https://mywecima.casa',
  'https://wecima.tube',
  'https://mycimanew.live'
]);

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_BASE_URL, ...MIRROR_DOMAINS]),
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
    pathTemplate: '/AjaxCenter/Searching/{query}/',
    queryParam: 'query',
    encoding: 'utf-8',
    pagination: false
  }),
  notImplemented: Object.freeze({})
});

export const MYCIMA_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  domains: Object.freeze([PRIMARY_BASE_URL, ...MIRROR_DOMAINS]),
  categories: Object.freeze({
    movies_all: '/movies/',
    movies_foreign: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    movies_arabic: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%b9%d8%b1%d8%a8%d9%8a/',
    movies_indian: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a/',
    movies_turkish: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%89/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    series_arabic: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%b9%d8%b1%d8%a8%d9%8a/',
    series_turkish: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    series_asian: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    anime_movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%83%d8%b1%d8%aa%d9%88%d9%86/',
    anime_series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%83%d8%b1%d8%aa%d9%88%d9%86/'
  })
});

function extractBgImage(styleAttr = '') {
  const m = String(styleAttr || '').match(/url\(['"]?([^'")]+)['"]?\)/i);
  return m ? m[1] : '';
}

function resolveMyCimaTargetUrl(rawUrl, baseUrl = PRIMARY_BASE_URL) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('mycima:')) {
    const raw = trimmed.slice('mycima:'.length);
    try {
      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      if (decoded.startsWith('http')) return resolveSafeUrl(decoded, baseUrl);
    } catch (_) {}
    if (raw.startsWith('http')) return resolveSafeUrl(raw, baseUrl);
  }
  return resolveSafeUrl(trimmed, baseUrl);
}

export function extractMyCimaCardsFromHtml(html = '', baseUrl = PRIMARY_BASE_URL, defaultType = 'movie') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('.Grid--WecimaPosts .GridItem, .GridItem, .GridItem--Wecima').each((_, el) => {
    const anchor = $(el).find('.Thumb--GridItem a, a').first();
    const rawHref = anchor.attr('href') || '';
    const targetUrl = resolveMyCimaTargetUrl(rawHref, baseUrl);
    if (!targetUrl || seen.has(targetUrl)) return;

    const rawTitle =
      $(el).find('strong.hasyear, .Title--GridItem, .title, strong').first().text().trim() ||
      anchor.attr('title') ||
      '';
    if (!rawTitle) return;

    const yearMatch = rawTitle.match(/\((\d{4})\)/) || $(el).find('.year, .Badge').text().match(/(\d{4})/);
    const bgStyle = $(el).find('span.BG--GridItem').attr('data-lazy-style') || $(el).find('span.BG--GridItem').attr('style') || '';
    const poster = extractBgImage(bgStyle) || $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    const cleanTitle = rawTitle.replace(/\(\d{4}\)/g, '').trim();
    const type = /مسلسل|حلقة|موسم/i.test(rawTitle) ? 'series' : defaultType;
    const ref = `mycima:${Buffer.from(targetUrl).toString('base64url')}`;

    seen.add(targetUrl);
    items.push({
      id: ref,
      ref,
      title: cleanTitle,
      year: yearMatch ? yearMatch[1] : '2025',
      poster: resolveSafeUrl(poster, baseUrl),
      image: resolveSafeUrl(poster, baseUrl),
      url: targetUrl,
      sourceUrl: targetUrl,
      source: PROVIDER_ID,
      code: PROVIDER_CODE,
      serverPrefix: PROVIDER_CODE,
      type,
      category: type,
      is_series: type === 'series'
    });
  });

  return items;
}

export async function scrapeCatalog(category = 'movies_all', page = 1, options = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const subPath = MYCIMA_CONFIG.categories[category] || MYCIMA_CONFIG.categories.movies_all || '/movies/';
  const url = p > 1 ? `${PRIMARY_BASE_URL}${subPath}page/${p}/` : `${PRIMARY_BASE_URL}${subPath}`;

  try {
    const { html } = await fetchProviderHtml(url, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const isSeriesCat = String(category).toLowerCase().includes('series');
    const items = extractMyCimaCardsFromHtml(html, PRIMARY_BASE_URL, isSeriesCat ? 'series' : 'movie');
    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'No catalog items found', { url });
    }
    return attachResultMeta(items, { providerId: PROVIDER_ID, url });
  } catch (err) {
    if (options.strict) throw err;
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, { url });
  }
}

export async function scrapeSearch(query, page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const searchUrl = `${PRIMARY_BASE_URL}/AjaxCenter/Searching/${encodeURIComponent(q)}/`;
  try {
    const { html: raw } = await fetchProviderHtml(searchUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    let html = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.output) html = parsed.output;
    } catch (_) {}

    const items = extractMyCimaCardsFromHtml(html, PRIMARY_BASE_URL, 'movie');
    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'No search results found', { url: searchUrl });
    }
    return attachResultMeta(items, { providerId: PROVIDER_ID, url: searchUrl });
  } catch (err) {
    if (options.strict) throw err;
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: searchUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, { url: searchUrl });
  }
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = resolveMyCimaTargetUrl(urlOrRef, PRIMARY_BASE_URL);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or unsafe MyCima URL', { url: urlOrRef });
  }

  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const title = $('h1.Title--Wecima, h1').first().text().trim() || 'تفاصيل العمل';
    const poster = $('.Poster--Single-begin img').attr('src') || $('.Poster--Single-begin img').attr('data-src') || '';
    const overview = $('.StoryMovieContent, .story').text().trim() || '';
    const yearMatch = title.match(/\((\d{4})\)/) || $('.year').text().match(/(\d{4})/);

    // Extract episodes
    const rawEpisodes = [];
    $('.Episodes--Seasons--Episodes a, .EpisodesList a').each((idx, el) => {
      const epHref = $(el).attr('href');
      const epTitle = $(el).find('episodetitle').text().trim() || $(el).text().trim();
      const numMatch = epTitle.match(/(\d+)/);
      const epNum = numMatch ? Number(numMatch[1]) : idx + 1;
      if (epHref) {
        rawEpisodes.push({
          number: epNum,
          title: `الحلقة ${epNum}`,
          url: resolveSafeUrl(epHref, targetUrl)
        });
      }
    });

    const episodes = normalizeEpisodeList(rawEpisodes.reverse(), {
      providerId: PROVIDER_ID,
      baseUrl: targetUrl
    });

    // Extract servers
    const serversRes = await scrapeServers(targetUrl, { ...options, fixtureHtml: html });
    const servers = Array.isArray(serversRes) ? serversRes : [];

    const isSeries = episodes.length > 0 || /مسلسل|حلقة/i.test(title);

    return normalizeDetailsResult(
      {
        id: `mycima:${Buffer.from(targetUrl).toString('base64url')}`,
        title: cleanTitleText(title),
        poster: resolveSafeUrl(poster, targetUrl),
        overview,
        year: yearMatch ? yearMatch[1] : '2025',
        type: isSeries ? 'series' : 'movie',
        episodes,
        servers,
        sourceUrl: targetUrl,
        source: PROVIDER_ID
      },
      { providerId: PROVIDER_ID, baseUrl: targetUrl }
    );
  } catch (err) {
    if (options.strict) throw err;
    return null;
  }
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const details = await scrapeDetails(urlOrRef, options);
  return Array.isArray(details?.episodes) ? details.episodes : [];
}

export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = resolveMyCimaTargetUrl(urlOrRef, PRIMARY_BASE_URL);
  if (!targetUrl) return [];

  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const directServers = [];
    const embedCandidates = [];

    // 1. Direct download mp4/m3u8 links
    $('ul.List--Download--Wecima--Single li a, .Download--Wecima--Single a').each((idx, el) => {
      const dlHref = ($(el).attr('href') || '').trim();
      const resText = $(el).find('resolution').text().trim() || $(el).text().trim();
      const qualityMatch = resText.match(/(1080p|720p|480p|360p|4K)/i);
      if (dlHref && (dlHref.includes('.mp4') || dlHref.includes('.m3u8') || dlHref.startsWith('http'))) {
        const streamType = dlHref.includes('.m3u8') ? 'm3u8' : 'mp4';
        directServers.push({
          provider: PROVIDER_ID,
          code: `${PROVIDER_CODE}-${directServers.length + 1}`,
          serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
          name: `MyCima Direct #${directServers.length + 1}`,
          label: `${PROVIDER_CODE}-${directServers.length + 1}`,
          url: dlHref,
          type: streamType,
          streamType,
          quality: qualityMatch ? qualityMatch[1] : 'HD',
          verified: true,
          headers: generateAntiBanHeaders(targetUrl)
        });
      }
    });

    // 2. Watch servers list
    $('ul.WatchServersList li, ul.WatchServersList li btn').each((_, el) => {
      const rawWatch = $(el).attr('data-watch') || $(el).attr('data-url') || '';
      if (rawWatch && rawWatch.startsWith('http')) {
        embedCandidates.push(rawWatch);
      }
    });

    // In live mode (not fixtureHtml), unwrap embed candidates
    if (!options.fixtureHtml && embedCandidates.length > 0) {
      const unwrappedList = await Promise.all(
        embedCandidates.slice(0, 6).map((u) => unwrapEmbedToDirectStreams(u, targetUrl))
      );
      for (const group of unwrappedList) {
        for (const s of group) {
          directServers.push({
            provider: PROVIDER_ID,
            code: `${PROVIDER_CODE}-${directServers.length + 1}`,
            serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
            name: `MyCima Stream #${directServers.length + 1}`,
            label: `${PROVIDER_CODE}-${directServers.length + 1}`,
            url: s.url,
            type: s.streamType,
            streamType: s.streamType,
            quality: s.quality,
            verified: true,
            headers: s.headers
          });
        }
      }
    } else {
      // Preserve embed candidates in fixture mode or fallback
      for (const u of embedCandidates) {
        directServers.push({
          provider: PROVIDER_ID,
          code: `${PROVIDER_CODE}-${directServers.length + 1}`,
          serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
          name: `MyCima Server #${directServers.length + 1}`,
          label: `${PROVIDER_CODE}-${directServers.length + 1}`,
          url: u,
          type: 'embed',
          streamType: 'embed',
          quality: 'HD',
          verified: false,
          headers: generateAntiBanHeaders(targetUrl)
        });
      }
    }

    return directServers;
  } catch (err) {
    if (options.strict) throw err;
    return [];
  }
}

export async function resolveStream(urlOrRef, options = {}) {
  const targetUrl = resolveMyCimaTargetUrl(urlOrRef, PRIMARY_BASE_URL);
  if (!targetUrl) return null;

  if (isValidDirectMediaUrl(targetUrl)) {
    const streamType = targetUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      provider: PROVIDER_ID,
      code: `${PROVIDER_CODE}-1`,
      url: targetUrl,
      type: streamType,
      streamType,
      quality: 'HD',
      verified: true,
      headers: generateAntiBanHeaders(targetUrl)
    };
  }

  const unwrapped = await unwrapEmbedToDirectStreams(targetUrl);
  if (unwrapped.length > 0) {
    return {
      provider: PROVIDER_ID,
      code: `${PROVIDER_CODE}-1`,
      ...unwrapped[0]
    };
  }

  return {
    provider: PROVIDER_ID,
    code: `${PROVIDER_CODE}-1`,
    url: targetUrl,
    type: 'embed',
    streamType: 'embed',
    quality: 'HD',
    verified: false,
    headers: generateAntiBanHeaders(targetUrl)
  };
}

// Backward-compatible named exports
export const scrapeMyCimaCategory = scrapeCatalog;
export const scrapeMyCimaCatalog = scrapeCatalog;
export const searchMyCima = scrapeSearch;
export const scrapeMyCimaDetails = scrapeDetails;
export const extractMyCimaStreamsAndEpisodes = async (url) => {
  const [details, servers] = await Promise.all([
    scrapeDetails(url),
    scrapeServers(url)
  ]);
  return {
    episodes: details?.episodes || [],
    servers: servers || []
  };
};

export default {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
};
