// server/scrapers/sites/alooy.mjs
// Standalone provider module for Alooy TV (علوي تي في - alooy, code: AY)
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
import { isValidDirectMediaUrl } from '../stream-unwrapper.mjs';

// Bridge & maintain 100% backward compatibility with server/providers/alooy.mjs
import {
  ALOOY_ORIGIN,
  ALOOY_UA,
  alooyPage,
  encodeAlooyRef,
  decodeAlooyRef,
  alooyMedia,
  parseAlooyCatalog,
  parseAlooyDetails,
  createAlooyProvider
} from '../../providers/alooy.mjs';

export {
  ALOOY_ORIGIN,
  ALOOY_UA,
  alooyPage,
  encodeAlooyRef,
  decodeAlooyRef,
  alooyMedia,
  parseAlooyCatalog,
  parseAlooyDetails,
  createAlooyProvider
};

export const PROVIDER_META = Object.freeze({
  id: 'alooy',
  name: 'علوي تي في (Alooy TV)',
  code: 'AY',
  domains: ['https://fa.alooytv16.xyz', 'https://alooytv5.xyz'],
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
    pathTemplate: '/home/autocompleteajax?term={query}',
    queryParam: 'term',
    encoding: 'utf-8',
    pagination: false
  },
  notImplemented: Object.freeze({
    live: 'Alooy TV is an on-demand series/movies portal and does not support live IPTV broadcast'
  })
});

export const ALOOY_CONFIG = Object.freeze({
  key: 'alooy',
  id: 'alooy',
  name: 'علوي تي في (Alooy TV)',
  code: 'AY',
  baseUrl: 'https://fa.alooytv16.xyz',
  mirrorBaseUrl: 'https://alooytv5.xyz',
  domains: ['https://fa.alooytv16.xyz', 'https://alooytv5.xyz'],
  categories: {
    all: '/tv-series.html',
    series: '/tv-series.html',
    'alooy-series': '/tv-series.html',
    kleeji: '/genre/kleeji.html',
    arabic: '/genre/arabic.html',
    turki: '/genre/turki.html',
    farisi: '/genre/farisi.html',
    anmi: '/genre/anmi.html',
    'foreign-movies': '/genre/foreign-movies.html',
    'korean-movies': '/genre/Korean-movies.html',
    'arabic-movies': '/genre/arabic-movies.html',
    'foreign-series': '/genre/Foreign-series.html',
    'korean-series': '/genre/Korean-series.html',
    'asia-series': '/genre/asia-series.html',
    'ramadan-kleeji-2026': '/genre/ramadan-kleeji-2026.html',
    'ramadan-arabi-2026': '/genre/ramadan-arabi-2026.html',
    'ramadan-kleeji-2025': '/genre/ramadan-kleeji-2025.html',
    'ramadan-arabi-2025': '/genre/ramadan-arabi-2025.html',
    'ramadan-kleeji-2024': '/genre/ramadan-kleeji-2024.html',
    'ramadan-arabi-2024': '/genre/ramadan-arabi-2024.html'
  }
});

/**
 * Rewrites any legacy or mirror Alooy URL to the active streaming host https://fa.alooytv16.xyz
 */
export function rewriteToActiveAlooyDomain(urlOrPath = '') {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return ALOOY_CONFIG.baseUrl;

  if (raw.startsWith('alooy:')) {
    try {
      const u = decodeAlooyRef(raw);
      return u.href;
    } catch (_) {
      return ALOOY_CONFIG.baseUrl;
    }
  }

  try {
    const parsed = new URL(raw, ALOOY_CONFIG.baseUrl);
    parsed.protocol = 'https:';
    parsed.host = 'fa.alooytv16.xyz';
    return parsed.toString();
  } catch (_) {
    return ALOOY_CONFIG.baseUrl;
  }
}

/**
 * Normalizes input ref, relative path, or URL to an absolute Alooy target URL
 */
export function resolveAlooyTargetUrl(urlOrRef = '') {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';

  if (raw.startsWith('alooy:')) {
    try {
      const u = decodeAlooyRef(raw);
      return u.href;
    } catch (_) {
      const rest = raw.slice('alooy:'.length);
      try {
        const decoded = Buffer.from(rest, 'base64url').toString('utf8');
        return new URL(decoded, ALOOY_CONFIG.baseUrl).href;
      } catch (__) {
        return '';
      }
    }
  }

  return rewriteToActiveAlooyDomain(raw);
}

/**
 * Validates direct media URLs against active Alooy CDN hosts and formats
 */
export function safeAlooyMedia(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return alooyMedia(value);
  } catch (_) {
    try {
      const u = new URL(value);
      if (
        (u.protocol === 'https:' || u.protocol === 'http:') &&
        !u.port &&
        !u.username &&
        !u.password &&
        !u.hash &&
        /\.(mp4|webm)$/i.test(u.pathname) &&
        /^(?:(?:[\w-]+\.)?(?:ujeklsj\.site|d-s-finsh847\.xyz|zvde-dsn-01\.site)|s\d+-[^.]+\.s1q2105\.com)$/i.test(u.hostname)
      ) {
        return u;
      }
    } catch (__) {}
    return null;
  }
}

/**
 * Helper to extract catalog cards from an Alooy HTML document
 */
function extractCardsFromDom($, baseUrl) {
  const items = [];
  const seenRefs = new Set();

  $('.latest-movie-img-container').each((_, node) => {
    const a = $(node).find('a[href*="/watch/"]').first();
    const href = a.attr('href');
    if (!href) return;

    const fullUrl = rewriteToActiveAlooyDomain(href);
    let ref = '';
    try {
      ref = encodeAlooyRef(fullUrl);
    } catch (_) {
      ref = `alooy:${Buffer.from(new URL(fullUrl).pathname + new URL(fullUrl).search).toString('base64url')}`;
    }

    if (seenRefs.has(ref)) return;
    seenRefs.add(ref);

    const img = $(node).find('img').first();
    const rawTitle =
      $(node).find('.movie-title h3 a').text().trim() ||
      img.attr('alt') ||
      a.text().trim();
    if (!rawTitle) return;

    const rawPoster = img.attr('data-src') || img.attr('src') || '';
    const poster = rawPoster ? resolveSafeUrl(rawPoster, baseUrl) : '';

    const qualityBadge = $(node).find('.video_quality .label').first().text().trim();
    const quality = qualityBadge || '';

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: rawTitle,
        url: fullUrl,
        poster,
        quality,
        type: 'series',
        category: 'series',
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: 'series' }
    );

    if (normalized) {
      normalized.is_series = true;
      normalized.serverPrefix = PROVIDER_META.code;
      items.push(normalized);
    }
  });

  return items;
}

/**
 * Scrapes the Alooy TV catalog by category and page number
 */
export async function scrapeCatalog(category = 'all', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const catKey = String(category || 'all').toLowerCase();
  const subPath = ALOOY_CONFIG.categories[catKey] || ALOOY_CONFIG.categories.all;

  let targetUrl = '';
  const isGenre = subPath.includes('/genre/');
  if (isGenre) {
    targetUrl =
      pageNum > 1
        ? `${ALOOY_CONFIG.baseUrl}${subPath.replace(/\.html$/, '')}/${(pageNum - 1) * 50}.html`
        : `${ALOOY_CONFIG.baseUrl}${subPath}`;
  } else {
    targetUrl =
      pageNum > 1
        ? `${ALOOY_CONFIG.baseUrl}/tvseries/home/${(pageNum - 1) * 24}.html`
        : `${ALOOY_CONFIG.baseUrl}${subPath}`;
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      headers: {
        'User-Agent': ALOOY_UA,
        Referer: `${ALOOY_CONFIG.baseUrl}/`,
        ...(options.headers || {})
      },
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const $ = cheerio.load(res.html);
    const items = extractCardsFromDom($, ALOOY_CONFIG.baseUrl);

    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on page',
        { url: targetUrl }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Searches Alooy TV series via the autocomplete AJAX endpoint
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Query too short or empty');
  }

  const targetUrl = `${ALOOY_CONFIG.baseUrl}/home/autocompleteajax?term=${encodeURIComponent(q)}`;

  try {
    let jsonText = '';
    if (typeof options.fixtureJson === 'string') {
      jsonText = options.fixtureJson;
    } else if (typeof options.fixtureHtml === 'string') {
      jsonText = options.fixtureHtml;
    } else {
      const res = await fetchSafeResponse(targetUrl, {
        ...options,
        headers: {
          'User-Agent': ALOOY_UA,
          Referer: `${ALOOY_CONFIG.baseUrl}/`,
          ...(options.headers || {})
        },
        providerId: PROVIDER_META.id
      });

      if (!res.ok || !res.html) {
        return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
          url: targetUrl
        });
      }
      jsonText = res.html;
    }

    let parsed = [];
    try {
      parsed = JSON.parse(jsonText);
    } catch (_) {
      parsed = [];
    }

    const rawList = Array.isArray(parsed) ? parsed : [];
    const items = [];

    for (const row of rawList) {
      if (!row || !row.url) continue;
      const fullUrl = rewriteToActiveAlooyDomain(row.url);
      let ref = '';
      try {
        ref = encodeAlooyRef(fullUrl);
      } catch (_) {
        ref = `alooy:${Buffer.from(new URL(fullUrl).pathname + new URL(fullUrl).search).toString('base64url')}`;
      }

      const title = String(row.title || '').trim();
      const poster = row.image ? resolveSafeUrl(row.image, ALOOY_CONFIG.baseUrl) : '';

      const normalized = normalizeCatalogItem(
        {
          id: ref,
          ref,
          title,
          url: fullUrl,
          poster,
          type: 'series',
          category: 'series',
          source: PROVIDER_META.id
        },
        { providerId: PROVIDER_META.id, baseUrl: ALOOY_CONFIG.baseUrl, defaultType: 'series' }
      );

      if (normalized) {
        normalized.is_series = true;
        normalized.serverPrefix = PROVIDER_META.code;
        items.push(normalized);
      }
    }

    return attachResultMeta(items, {
      ok: true,
      errorCode: items.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      providerId: PROVIDER_META.id,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Extracts episodes from an Alooy details/watch DOM
 */
function extractEpisodesFromDom($, pageUrl) {
  const episodesMap = new Map();

  $('a[href*="?key="]').each((idx, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const fullUrl = rewriteToActiveAlooyDomain(href);
    let ref = '';
    try {
      ref = encodeAlooyRef(fullUrl);
    } catch (_) {
      ref = `alooy:${Buffer.from(new URL(fullUrl).pathname + new URL(fullUrl).search).toString('base64url')}`;
    }

    const rawText = $(el).text().trim();
    const num = extractEpisodeNumber(rawText, fullUrl, idx + 1) || (idx + 1);

    if (!episodesMap.has(num)) {
      episodesMap.set(num, {
        id: ref,
        ref,
        number: num,
        season: 1,
        title: rawText && !rawText.includes('undefined') ? rawText : `الحلقة ${num}`,
        url: fullUrl,
        source: PROVIDER_META.id
      });
    }
  });

  const list = Array.from(episodesMap.values());
  list.sort((a, b) => a.number - b.number);
  return list;
}

/**
 * Scrapes series details, metadata, and episode list
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolveAlooyTargetUrl(urlOrRef);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing Alooy details reference', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetchProviderHtml(cleanUrl, {
    ...options,
    headers: {
      'User-Agent': ALOOY_UA,
      Referer: `${ALOOY_CONFIG.baseUrl}/`,
      ...(options.headers || {})
    },
    providerId: PROVIDER_META.id
  });

  if (!res.ok || !res.html) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch Alooy details HTTP_${res.status}`, {
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      status: res.status
    });
  }

  const $ = cheerio.load(res.html);
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().split('|')[0].trim();

  const rawPoster =
    $('video').attr('poster') ||
    $('meta[property="og:image"]').attr('content') ||
    $('.movie-details img').attr('src') ||
    '';
  const poster = rawPoster ? resolveSafeUrl(rawPoster, ALOOY_CONFIG.baseUrl) : '';

  let overview = $('meta[property="og:description"]').attr('content') || '';
  let year = '';
  let rating = '';
  const genres = [];

  $('p, .desc p').each((_, el) => {
    const text = $(el).text().trim();
    if (/Genre:\s*(.*)/i.test(text)) {
      const g = text.replace(/Genre:\s*/i, '').trim();
      if (g) genres.push(g);
    } else if (/Release:\s*(.*)/i.test(text)) {
      year = extractYear(text);
    } else if (/Rating:\s*(.*)/i.test(text)) {
      const r = text.replace(/Rating:\s*/i, '').trim();
      if (r && r !== '0') rating = r;
    } else if (!overview && text.length > 20 && !text.includes('Copyright') && !text.includes('alooytv')) {
      overview = text;
    }
  });

  if (!year) year = extractYear(title);

  const episodes = extractEpisodesFromDom($, cleanUrl);

  const normalized = normalizeDetailsResult(
    {
      title,
      poster,
      overview,
      year,
      rating,
      genres,
      episodes,
      type: 'series',
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: ALOOY_CONFIG.baseUrl }
  );

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

/**
 * Scrapes episode list for an Alooy series
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = resolveAlooyTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid series URL or ref');
  }

  // Strip ?key= if present so we always request the series overview page containing all episodes
  let cleanUrl = targetUrl;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.searchParams.has('key')) {
      parsed.search = '';
      cleanUrl = parsed.toString();
    }
  } catch (_) {}

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      ...options,
      headers: {
        'User-Agent': ALOOY_UA,
        Referer: `${ALOOY_CONFIG.baseUrl}/`,
        ...(options.headers || {})
      },
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const $ = cheerio.load(res.html);
    const episodes = extractEpisodesFromDom($, cleanUrl);

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: episodes.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
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

/**
 * Resolves an iframe /m3u8/ page to extract tokenized HLS master manifest
 */
async function resolveM3u8Iframe(iframeSrc, refererUrl, options = {}) {
  const results = [];
  const fullIframeUrl = new URL(iframeSrc, ALOOY_CONFIG.baseUrl).href;

  // Extract direct MP4 candidate from hash: #ujeklsj.site/Path/01.mp4
  const hashIdx = iframeSrc.indexOf('#');
  if (hashIdx !== -1) {
    const hashPart = iframeSrc.slice(hashIdx + 1).replace(/^ujeklsj\.site\/?/, '');
    if (hashPart) {
      const vidMp4Url = `https://vid1.ujeklsj.site/${hashPart}`;
      results.push({
        name: 'علوي تي في - سيرفر MP4 مباشر (vid1)',
        label: 'علوي تي في - سيرفر MP4 مباشر (vid1)',
        url: vidMp4Url,
        type: 'mp4',
        streamType: 'mp4',
        quality: null,
        verified: true,
        headers: {
          Referer: refererUrl,
          Origin: ALOOY_CONFIG.baseUrl,
          'User-Agent': ALOOY_UA
        }
      });
    }
  }

  // Fetch /m3u8/ player HTML to extract tokenized master.m3u8
  let html = '';
  if (typeof options.m3u8FixtureHtml === 'string') {
    html = options.m3u8FixtureHtml;
  } else if (typeof options.fixtureHtml === 'string' && options.fixtureHtml.includes('مشغل M3U8')) {
    html = options.fixtureHtml;
  } else if (!options.fixtureHtml) {
    try {
      const res = await fetchSafeResponse(fullIframeUrl, {
        headers: {
          'User-Agent': ALOOY_UA,
          Referer: refererUrl
        },
        timeoutMs: options.timeoutMs || 8000,
        providerId: PROVIDER_META.id
      });
      if (res.ok && res.html) {
        html = res.html;
      }
    } catch (_) {}
  }

  if (html) {
    const m3u8Match =
      html.match(/const\s+url\s*=\s*["']([^"']+)["']/i) ||
      html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
    if (m3u8Match) {
      const hlsUrl = m3u8Match[1] || m3u8Match[0];
      results.push({
        name: 'علوي تي في - سيرفر HLS مباشر (m3u8)',
        label: 'علوي تي في - سيرفر HLS مباشر (m3u8)',
        url: hlsUrl,
        type: 'm3u8',
        streamType: 'm3u8',
        quality: 'AUTO-HLS',
        verified: true,
        expiresHint: 'tokenized',
        headers: {
          Referer: refererUrl,
          Origin: ALOOY_CONFIG.baseUrl,
          'User-Agent': ALOOY_UA
        }
      });
    }
  }

  // Preserve the internal player embed itself
  results.push({
    name: 'علوي تي في - مشغل داخلي (Embed)',
    label: 'علوي تي في - مشغل داخلي (Embed)',
    url: fullIframeUrl,
    type: 'embed',
    streamType: 'embed',
    quality: null,
    verified: false,
    headers: {
      Referer: refererUrl
    }
  });

  return results;
}

/**
 * Scrapes playable stream servers for an Alooy episode or watch page
 */
export async function scrapeServers(urlOrRef, options = {}) {
  let targetUrl = resolveAlooyTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid Alooy URL or ref');
  }

  // If a series URL without ?key= was provided, find its first episode
  let hasKey = false;
  try {
    hasKey = new URL(targetUrl).searchParams.has('key');
  } catch (_) {}

  if (!hasKey && !options.fixtureHtml) {
    try {
      const epList = await scrapeEpisodes(targetUrl, options);
      if (epList && epList.length > 0 && epList[0].url) {
        targetUrl = epList[0].url;
      }
    } catch (_) {}
  }

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      headers: {
        'User-Agent': ALOOY_UA,
        Referer: `${ALOOY_CONFIG.baseUrl}/`,
        ...(options.headers || {})
      },
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        `HTTP_${res.status}`,
        { url: targetUrl }
      );
    }

    const $ = cheerio.load(res.html);
    const rawServers = [];
    const seenMediaUrls = new Set();

    // 1. Direct <video source> and <video[src]>
    const candidateSources = $('video source, video[src]')
      .toArray()
      .map((n) => $(n).attr('src'))
      .filter(Boolean);

    // 2. Direct MP4/webm in scripts
    $('script').each((_, n) => {
      const scriptText = $(n).html() || '';
      const matches = scriptText.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|webm)(?:\?[^\s"'<>]*)?/g);
      if (matches) candidateSources.push(...matches);
    });

    // 2b. Direct video links encoded in download_video.php?video_url=
    const rawDlMatches = [];
    $('a[href*="download_video.php"]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (href) rawDlMatches.push(href);
    });
    const htmlMatches = res.html.match(/download_video\.php\?video_url=[^'"\s<>]+/g) || [];
    for (const m of htmlMatches) rawDlMatches.push(m);

    for (const dlLink of rawDlMatches) {
      try {
        const u = new URL(dlLink, ALOOY_CONFIG.baseUrl);
        const b64 = u.searchParams.get('video_url');
        if (!b64) continue;
        const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          candidateSources.push(decoded);
        } else if (decoded.startsWith('/m3u8/')) {
          iframes.push(decoded);
        }
        if (decoded.includes('#')) {
          const hashPart = decoded.split('#')[1].replace(/^ujeklsj\.site\/?/, '');
          if (hashPart) {
            candidateSources.push(`https://vid1.ujeklsj.site/${hashPart}`);
          }
        }
      } catch (_) {}
    }

    for (const raw of candidateSources) {
      try {
        const u = safeAlooyMedia(raw);
        if (!u) continue;
        if (seenMediaUrls.has(u.href)) continue;
        seenMediaUrls.add(u.href);

        rawServers.push({
          name: `علوي تي في - مصدر مباشر ${rawServers.length + 1} (${u.pathname.endsWith('.webm') ? 'webm' : 'mp4'})`,
          label: `علوي تي في - مصدر مباشر ${rawServers.length + 1} (${u.pathname.endsWith('.webm') ? 'webm' : 'mp4'})`,
          url: u.href,
          type: u.pathname.endsWith('.webm') ? 'webm' : 'mp4',
          streamType: u.pathname.endsWith('.webm') ? 'webm' : 'mp4',
          quality: null,
          verified: true,
          headers: {
            Referer: targetUrl,
            Origin: ALOOY_CONFIG.baseUrl,
            'User-Agent': ALOOY_UA
          }
        });
      } catch (_) {}
    }

    // 3. Iframe embeds (e.g. /m3u8/?src=...)
    const iframes = $('iframe[src]')
      .toArray()
      .map((ifr) => $(ifr).attr('src'))
      .filter(Boolean);

    for (const ifrSrc of iframes) {
      if (ifrSrc.includes('/m3u8/')) {
        const iframeResolved = await resolveM3u8Iframe(ifrSrc, targetUrl, options);
        for (const s of iframeResolved) {
          if (!seenMediaUrls.has(s.url)) {
            seenMediaUrls.add(s.url);
            rawServers.push(s);
          }
        }
      } else {
        const fullIfr = resolveSafeUrl(ifrSrc, targetUrl);
        if (fullIfr && !seenMediaUrls.has(fullIfr)) {
          seenMediaUrls.add(fullIfr);
          rawServers.push({
            name: `علوي تي في - مشغل خارجي #${rawServers.length + 1}`,
            label: `علوي تي في - مشغل خارجي #${rawServers.length + 1}`,
            url: fullIfr,
            type: 'embed',
            streamType: 'embed',
            quality: null,
            verified: false,
            headers: { Referer: targetUrl }
          });
        }
      }
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: ALOOY_CONFIG.baseUrl
    });

    // Ensure verified flag and required headers are preserved
    normalized.forEach((s, idx) => {
      const orig = rawServers[idx];
      if (orig) {
        if (orig.verified !== undefined) s.verified = orig.verified;
        if (orig.expiresHint) s.expiresHint = orig.expiresHint;
        if (orig.headers) s.headers = orig.headers;
      }
    });

    if (normalized.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable stream servers extracted from Alooy page',
        { url: targetUrl }
      );
    }

    return attachResultMeta(normalized, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Resolves a stream reference or URL into a direct playable stream object
 */
export async function resolveStream(urlOrRef, options = {}) {
  const cleanUrl = resolveAlooyTargetUrl(urlOrRef);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream URL or ref for Alooy', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  // If already a direct media URL (MP4 / WebM / M3U8)
  if (isValidDirectMediaUrl(cleanUrl) || cleanUrl.includes('.mp4') || cleanUrl.includes('.m3u8')) {
    const streamType = cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      verified: true,
      headers: options.headers || {
        Referer: `${ALOOY_CONFIG.baseUrl}/`,
        Origin: ALOOY_CONFIG.baseUrl,
        'User-Agent': ALOOY_UA
      }
    };
  }

  // If an episode watch page or series ref was passed, extract servers and pick best direct
  const servers = await scrapeServers(cleanUrl, options);
  if (servers && servers.length > 0) {
    // Prefer direct verified MP4 or M3U8 over embed
    const direct = servers.find((s) => s.type === 'mp4' || s.type === 'm3u8') || servers[0];
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: direct.url,
      type: direct.type,
      streamType: direct.streamType,
      quality: direct.quality,
      verified: direct.verified ?? (direct.type !== 'embed'),
      headers: direct.headers || {
        Referer: cleanUrl,
        Origin: ALOOY_CONFIG.baseUrl,
        'User-Agent': ALOOY_UA
      }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve direct Alooy stream', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

// Backward-compatible named exports required by index.mjs, supervisors, and tests
export const scrapeAlooyCatalog = scrapeCatalog;
export const scrapeAlooyCategory = scrapeCatalog;
export const searchAlooy = scrapeSearch;
export const scrapeAlooySearch = scrapeSearch;
export const scrapeAlooyDetails = scrapeDetails;
export const scrapeAlooyEpisodes = scrapeEpisodes;
export const extractAlooyServers = scrapeServers;
export const resolveAlooyStream = resolveStream;

export async function scrapeLive(options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'Alooy TV is a VOD drama/movies portal and does not broadcast live channels'
  );
}
export const scrapeAlooyLive = scrapeLive;

export async function extractAlooyStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}

