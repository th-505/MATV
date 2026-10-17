// server/scrapers/sites/egydead_live.mjs
// Standalone provider module for إيجي ديد لايف (EgyDead Live TV, code: EL)
// Primary domains: https://tv10.egydead.live, https://k8w4e.sbs/h3/

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl
} from '../shared/http.mjs';
import {
  cleanTitleText,
  normalizeCatalogItem,
  normalizeDetailsResult,
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

export const PROVIDER_ID = 'egydead_live';
export const PROVIDER_NAME = 'إيجي ديد لايف (EgyDead Live TV)';
export const PROVIDER_CODE = 'EL';
export const PRIMARY_BASE_URL = 'https://tv10.egydead.live';
export const ACTIVE_MIRROR_URL = 'https://k8w4e.sbs/h3/';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_BASE_URL, ACTIVE_MIRROR_URL]),
  mirrorOf: null,
  capabilities: Object.freeze({
    catalog: true,
    search: false,
    details: true,
    episodes: false,
    servers: true,
    resolve: true,
    live: true
  }),
  searchSpec: null,
  notImplemented: Object.freeze({
    search: 'Live TV portal does not provide search endpoint',
    episodes: 'Live channels do not have serialized episodes'
  })
});

export const EGYDEAD_LIVE_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  activeUrl: ACTIVE_MIRROR_URL
});

export function parseChannelsFromHtml(html = '', baseUrl = PRIMARY_BASE_URL) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const channels = [];
  const seen = new Set();

  $('.channel-item, .tv-item, .channel-card, a[href*="/channel/"], a[href*="/live/"]').each((idx, el) => {
    const anchor = $(el).is('a') ? $(el) : $(el).find('a').first();
    const rawHref = anchor.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl);
    if (!url || seen.has(url)) return;

    const rawTitle =
      $(el).find('.channel-name, .title, h3, h4').text().trim() ||
      anchor.text().trim() ||
      anchor.attr('title') ||
      `قناة ${idx + 1}`;
    const img = $(el).find('img').first();
    const rawPoster = img.attr('data-src') || img.attr('src') || '';

    seen.add(url);
    const ref = `egydead_live:${Buffer.from(url).toString('base64url')}`;
    channels.push({
      id: ref,
      ref,
      title: cleanTitleText(rawTitle),
      name: cleanTitleText(rawTitle),
      url,
      link: url,
      sourceUrl: url,
      poster: resolveSafeUrl(rawPoster, baseUrl),
      image: resolveSafeUrl(rawPoster, baseUrl),
      source: PROVIDER_ID,
      serverPrefix: PROVIDER_CODE,
      type: 'live',
      category: 'live'
    });
  });

  return channels;
}

export async function scrapeCatalog(category = 'live', page = 1, options = {}) {
  const targetUrl = options.activeUrl || ACTIVE_MIRROR_URL;
  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const channels = parseChannelsFromHtml(html, targetUrl);
    if (channels.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'No live channels found', { url: targetUrl });
    }
    return attachResultMeta(channels, { providerId: PROVIDER_ID, url: targetUrl });
  } catch (err) {
    if (options.strict) throw err;
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, { url: targetUrl });
  }
}

export async function scrapeLive(options = {}) {
  return scrapeCatalog('live', 1, options);
}

export async function scrapeSearch(query, page = 1, options = {}) {
  if (options.strict) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY, 'Search is unsupported on live TV portal');
  }
  return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY, 'Search is unsupported on live TV portal');
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = typeof urlOrRef === 'string' && urlOrRef.startsWith('http')
    ? urlOrRef
    : resolveSafeUrl(urlOrRef, PRIMARY_BASE_URL);

  if (!targetUrl) return null;

  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const title = $('.channel-title, h1').first().text().trim() || 'بث مباشر';
    const poster = $('.channel-logo img, img').attr('src') || '';

    const servers = await scrapeServers(targetUrl, { ...options, fixtureHtml: html });

    return normalizeDetailsResult(
      {
        id: `egydead_live:${Buffer.from(targetUrl).toString('base64url')}`,
        title: cleanTitleText(title),
        poster: resolveSafeUrl(poster, targetUrl),
        type: 'live',
        episodes: [],
        servers: servers || [],
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
  if (options.strict) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY, 'Episodes unsupported on live channels');
  }
  return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY, 'Episodes unsupported on live channels');
}

export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = typeof urlOrRef === 'string' && urlOrRef.startsWith('http')
    ? urlOrRef
    : resolveSafeUrl(urlOrRef, PRIMARY_BASE_URL);

  if (!targetUrl) return [];

  try {
    const { html } = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      referer: PRIMARY_BASE_URL
    });

    const $ = cheerio.load(html);
    const candidateUrls = [];
    const directServers = [];

    $('iframe[src], [data-embed], [data-url], video source').each((_, el) => {
      const u = $(el).attr('src') || $(el).attr('data-embed') || $(el).attr('data-url') || '';
      if (u && u.startsWith('http')) candidateUrls.push(u);
    });

    // Check direct streams in text
    const textStreams = extractRawStreamsFromText(html, targetUrl);
    for (const ts of textStreams) {
      directServers.push({
        provider: PROVIDER_ID,
        code: `${PROVIDER_CODE}-${directServers.length + 1}`,
        serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
        name: `EgyDead Live #${directServers.length + 1}`,
        label: `${PROVIDER_CODE}-${directServers.length + 1}`,
        url: ts.url,
        type: ts.streamType,
        streamType: ts.streamType,
        quality: ts.quality || 'LIVE',
        headers: generateAntiBanHeaders(targetUrl)
      });
    }

    if (!options.fixtureHtml && candidateUrls.length > 0) {
      const unwrapped = await Promise.all(
        candidateUrls.slice(0, 4).map((u) => unwrapEmbedToDirectStreams(u, targetUrl))
      );
      for (const grp of unwrapped) {
        for (const s of grp) {
          directServers.push({
            provider: PROVIDER_ID,
            code: `${PROVIDER_CODE}-${directServers.length + 1}`,
            serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
            name: `EgyDead Live #${directServers.length + 1}`,
            label: `${PROVIDER_CODE}-${directServers.length + 1}`,
            url: s.url,
            type: s.streamType,
            streamType: s.streamType,
            quality: s.quality || 'LIVE',
            headers: s.headers
          });
        }
      }
    } else {
      for (const u of candidateUrls) {
        directServers.push({
          provider: PROVIDER_ID,
          code: `${PROVIDER_CODE}-${directServers.length + 1}`,
          serverCode: `${PROVIDER_CODE}-${directServers.length + 1}`,
          name: `EgyDead Live #${directServers.length + 1}`,
          label: `${PROVIDER_CODE}-${directServers.length + 1}`,
          url: u,
          type: 'embed',
          streamType: 'embed',
          quality: 'LIVE',
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
  const targetUrl = typeof urlOrRef === 'string' && urlOrRef.startsWith('http')
    ? urlOrRef
    : resolveSafeUrl(urlOrRef, PRIMARY_BASE_URL);

  if (!targetUrl) return null;

  if (isValidDirectMediaUrl(targetUrl)) {
    const streamType = targetUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      provider: PROVIDER_ID,
      code: `${PROVIDER_CODE}-1`,
      url: targetUrl,
      type: streamType,
      streamType,
      quality: 'LIVE',
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

  return null;
}

// Backward-compatible named exports
export const scrapeEgyDeadLiveChannels = scrapeCatalog;

export default {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
};
