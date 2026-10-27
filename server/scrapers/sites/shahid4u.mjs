// server/scrapers/sites/shahid4u.mjs
// Standalone provider module for شاهد فور يو (Shahid4U) — Code: SU

import * as cheerio from 'cheerio';
import { contentIdentity } from '../../../shared/content-identity.js';
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

export const PROVIDER_ID = 'shahid4u';
export const PROVIDER_NAME = 'شاهد فور يو (Shahid4U)';
export const PROVIDER_CODE = 'SU';
export const PRIMARY_BASE_URL = 'https://shahidfu.cam';
export const MIRROR_DOMAINS = Object.freeze([
  'https://cdn.shahid4u.asia',
  'https://sh4u.news',
  'https://shahid4u.vip',
  'https://shahid4u.energy'
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
    pathTemplate: '/search?q={query}',
    queryParam: 'q',
    encoding: 'utf-8',
    pagination: false
  }),
  notImplemented: Object.freeze({})
});

export const SHAHID4U_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  mirrorUrl: 'https://shii4u.cam',
  domains: Object.freeze([PRIMARY_BASE_URL, ...MIRROR_DOMAINS]),
  categories: Object.freeze({
    movies_foreign: '/category/افلام-اجنبي',
    movies_arabic: '/category/افلام-عربي',
    movies_indian: '/category/افلام-هندي',
    movies_turkish: '/category/افلام-تركي',
    series_foreign: '/category/مسلسلات-اجنبي',
    series_arabic: '/category/مسلسلات-عربي',
    series_turkish: '/category/مسلسلات-تركي',
    series_asian: '/category/مسلسلات-اسيوي',
    anime_series: '/category/مسلسلات-انمي',
    anime_movies: '/category/افلام-انمي'
  })
});

function resolveShahid4uTargetUrl(rawUrl, baseUrl = PRIMARY_BASE_URL) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('shahid4u:')) {
    const raw = trimmed.slice('shahid4u:'.length);
    try {
      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      if (decoded.startsWith('http')) return resolveSafeUrl(decoded, baseUrl);
    } catch (_) {}
    if (raw.startsWith('http')) return resolveSafeUrl(raw, baseUrl);
  }
  return resolveSafeUrl(trimmed, baseUrl);
}

export function extractShahid4uCardsFromHtml(html = '', baseUrl = PRIMARY_BASE_URL, defaultType = 'movie') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('.content-box, .media-card, .show-card, article.post, article.br-card').each((_, el) => {
    const anchor = $(el).find('a').first();
    const rawHref = anchor.attr('href') || '';
    const targetUrl = resolveShahid4uTargetUrl(rawHref, baseUrl);
    if (!targetUrl || seen.has(targetUrl)) return;

    const rawTitle =
      $(el).find('.title, h3, h4, .br-card-title').first().text().trim() ||
      anchor.attr('title') ||
      '';
    if (!rawTitle) return;

    const bgStyle = $(el).find('.image, [style*="background"]').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const poster = (bgMatch ? bgMatch[1] : '') || $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    const cleanTitle = cleanTitleText(rawTitle);
    const type = /مسلسل|حلقة|موسم/i.test(rawTitle) ? 'series' : defaultType;
    const ref = `shahid4u:${Buffer.from(targetUrl).toString('base64url')}`;

    seen.add(targetUrl);
    items.push({
      id: ref,
      ref,
      title: cleanTitle,
      year: extractYear(rawTitle) || null,
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

export async function scrapeCatalog(category = 'movies_foreign', page = 1, options = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const subPath = SHAHID4U_CONFIG.categories[category] || SHAHID4U_CONFIG.categories.movies_foreign || '/category/افلام-اجنبي';
  const url = p > 1 ? `${PRIMARY_BASE_URL}${encodeURI(subPath)}?page=${p}` : `${PRIMARY_BASE_URL}${encodeURI(subPath)}`;

  try {
    const { html } = await fetchProviderHtml(url, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const isSeriesCat = String(category).toLowerCase().includes('series');
    const items = extractShahid4uCardsFromHtml(html, PRIMARY_BASE_URL, isSeriesCat ? 'series' : 'movie');
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

  const searchUrl = `${PRIMARY_BASE_URL}/search?q=${encodeURIComponent(q)}`;
  try {
    const { html } = await fetchProviderHtml(searchUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const items = extractShahid4uCardsFromHtml(html, PRIMARY_BASE_URL, 'movie');
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
  const targetUrl = resolveShahid4uTargetUrl(urlOrRef, PRIMARY_BASE_URL);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or unsafe Shahid4u URL', { url: urlOrRef });
  }

  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const title = $('h1.title, h1').first().text().trim() || 'تفاصيل العمل';
    const poster = $('.media-poster img, .image img').attr('src') || $('.media-poster img, .image img').attr('data-src') || '';
    const overview = $('.story, .overview, p.description').text().trim() || '';
    const yearMatch = title.match(/\((\d{4})\)/) || $('.year').text().match(/(\d{4})/);

    // Extract episodes
    const rawEpisodes = [];
    const episodeLinks = $('.sh-single-episode-grid a, .EpisodesList a, .episodes-list a');
    const links = episodeLinks.length ? episodeLinks : $('a[href*="/episode/"]');
    links.each((_,el)=>{
      const epHref=$(el).attr('href');
      const epText=$(el).find('.sh-episode-tile-title').text().trim() || $(el).attr('title') || $(el).text().trim();
      const identity=contentIdentity({title:epText,url:epHref,type:'series'});
      if(epHref && identity.episode_number)rawEpisodes.push({number:identity.episode_number,season:identity.season_number||1,title:epText,url:resolveSafeUrl(epHref,targetUrl)});
    });

    const episodes = normalizeEpisodeList(rawEpisodes, {
      providerId: PROVIDER_ID,
      baseUrl: targetUrl
    });

    const serversRes = await scrapeServers(targetUrl, { ...options, fixtureHtml: html });
    const servers = Array.isArray(serversRes) ? serversRes : [];

    const isSeries = episodes.length > 0 || /مسلسل|حلقة/i.test(title);

    return normalizeDetailsResult(
      {
        id: `shahid4u:${Buffer.from(targetUrl).toString('base64url')}`,
        title: cleanTitleText(title),
        poster: resolveSafeUrl(poster, targetUrl),
        overview,
        year: yearMatch ? yearMatch[1] : null,
        type: isSeries ? 'series' : 'movie',
        is_series: isSeries,
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
  const targetUrl = resolveShahid4uTargetUrl(urlOrRef, PRIMARY_BASE_URL);
  if (!targetUrl) return [];

  const watchUrl = targetUrl.includes('/watch/')
    ? targetUrl
    : targetUrl.replace(/\/(film|episode|post|series)\//, '/watch/');

  try {
    const { html } = await fetchProviderHtml(watchUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const candidateUrls = [];
    const directServers = [];

    // 1. JSON parsed servers in script
    const jsonServersMatch =
      html.match(/let\s+servers\s*=\s*JSON\.parse\(['"]([\s\S]*?)['"]\)/i) ||
      html.match(/servers\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])/i);
    if (jsonServersMatch) {
      try {
        const rawJson = jsonServersMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          for (const srv of parsed) {
            if (srv?.url && srv.url.startsWith('http')) candidateUrls.push(srv.url);
          }
        }
      } catch (_) {}
    }

    // 2. Buttons data-embed/data-url
    $('[data-embed], [data-url], .servers-list li').each((_, el) => {
      const u = $(el).attr('data-embed') || $(el).attr('data-url') || '';
      if (u && u.startsWith('http')) candidateUrls.push(u);
    });

    const uniqueCandidateUrls = Array.from(new Set(candidateUrls));

    if (!options.fixtureHtml && uniqueCandidateUrls.length > 0) {
      const unwrapped = await Promise.all(
        uniqueCandidateUrls.slice(0, 6).map((u) => unwrapEmbedToDirectStreams(u, watchUrl))
      );
      for (const grp of unwrapped) {
        for (const s of grp) {
          directServers.push({
            provider: PROVIDER_ID,
            code: `${PROVIDER_CODE}-${directServers.length + 1}`,
            serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
            name: `Shahid4U Stream #${directServers.length + 1}`,
            label: `${PROVIDER_CODE}-${directServers.length + 1}`,
            url: s.url,
            type: s.streamType,
            streamType: s.streamType,
            quality: s.quality,
            headers: s.headers
          });
        }
      }
    } else {
      for (const u of uniqueCandidateUrls) {
        directServers.push({
          provider: PROVIDER_ID,
          code: `${PROVIDER_CODE}-${directServers.length + 1}`,
          serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
          name: `Shahid4U Server #${directServers.length + 1}`,
          label: `${PROVIDER_CODE}-${directServers.length + 1}`,
          url: u,
          type: 'embed',
          streamType: 'embed',
          quality: 'HD',
          verified: false,
          headers: generateAntiBanHeaders(watchUrl)
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
  const targetUrl = resolveShahid4uTargetUrl(urlOrRef, PRIMARY_BASE_URL);
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
export const scrapeShahid4uCategory = scrapeCatalog;
export const scrapeShahid4uCatalog = scrapeCatalog;
export const searchShahid4u = scrapeSearch;
export const scrapeShahid4uDetails = scrapeDetails;
export const extractShahid4uStreamsAndEpisodes = async (url, options = {}) => {
  const [details, servers] = await Promise.all([
    scrapeDetails(url, options),
    scrapeServers(url, options)
  ]);
  return {
    ...details,
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
