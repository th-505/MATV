// server/scrapers/sites/arabseed.mjs
// Standalone provider module for عرب سيد (ArabSeed, code: AD)
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
  cleanTitleText,
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
  unwrapBase64BridgeUrl,
  isValidDirectMediaUrl
} from '../stream-unwrapper.mjs';
import { generateAntiBanHeaders } from '../anti-ban.mjs';

export const PROVIDER_META = Object.freeze({
  id: 'arabseed',
  name: 'عرب سيد (ArabSeed)',
  code: 'AD',
  domains: ['https://www.arabseed.wine', 'https://arabseed.show', 'https://asd.homes'],
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
    pathTemplate: '/find/?find={query}',
    queryParam: 'find',
    encoding: 'utf-8',
    pagination: '/find/page/{page}/?find={query}'
  },
  notImplemented: {}
});

export const ARABSEED_CONFIG = Object.freeze({
  key: 'arabseed',
  id: 'arabseed',
  name: 'عرب سيد (ArabSeed)',
  code: 'AD',
  baseUrl: 'https://www.arabseed.wine',
  fallbackBaseUrl: 'https://asd.homes',
  domains: ['https://www.arabseed.wine', 'https://arabseed.show', 'https://asd.homes'],
  categories: {
    all: '/category/foreign-movies/',
    movies: '/category/foreign-movies/',
    movies_foreign: '/category/foreign-movies/',
    movies_arabic: '/category/arabic-movies-5/',
    movies_turkish: '/category/turkish-movies/',
    movies_indian: '/category/indian-movies/',
    movies_asian: '/category/asian-movies/',
    movies_animation: '/category/cartoon-movies/',
    series: '/category/foreign-series/',
    series_foreign: '/category/foreign-series/',
    series_arabic: '/category/arabic-series/',
    series_turkish: '/category/turkish-series-1/',
    series_ramadan: '/category/ramadan-series-2025/',
    anime_movies: '/category/cartoon-movies/',
    anime_series: '/category/cartoon-series/'
  }
});

const KNOWN_ARABSEED_HOSTS = new Set([
  'arabseed.wine',
  'www.arabseed.wine',
  'arabseed.show',
  'www.arabseed.show',
  'asd.homes',
  'www.asd.homes',
  'm.asd.homes',
  'arabseed.net',
  'www.arabseed.net',
  'arabseed.org',
  'www.arabseed.org',
  'arabseed.trade',
  'arabseed.bond'
]);

/**
 * Rewrites known ArabSeed hostnames to the primary base URL
 */
export function rewriteToActiveArabSeedDomain(rawUrl = '', preferredOrigin = ARABSEED_CONFIG.baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return `${preferredOrigin.replace(/\/+$/, '')}${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (KNOWN_ARABSEED_HOSTS.has(host)) {
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
 * Encodes an ArabSeed URL into a compact provider ref string: arabseed:<base64url>
 */
export function encodeArabSeedRef(url = '') {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    const pathAndQuery = parsed.pathname + parsed.search;
    return `arabseed:${Buffer.from(pathAndQuery).toString('base64url')}`;
  } catch {
    return `arabseed:${Buffer.from(url).toString('base64url')}`;
  }
}

/**
 * Resolves an ArabSeed URL or reference into a fully-qualified URL
 */
export function resolveArabSeedTargetUrl(urlOrRef = '', baseUrl = ARABSEED_CONFIG.baseUrl) {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';

  if (raw.startsWith('arabseed:')) {
    const rest = raw.slice('arabseed:'.length).trim();
    if (rest.startsWith('http://') || rest.startsWith('https://')) {
      return resolveSafeUrl(rewriteToActiveArabSeedDomain(rest, baseUrl), baseUrl);
    }
    if (rest.startsWith('/')) {
      return resolveSafeUrl(rest, baseUrl);
    }
    try {
      const decoded = Buffer.from(rest, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return resolveSafeUrl(rewriteToActiveArabSeedDomain(decoded, baseUrl), baseUrl);
      }
      if (decoded.startsWith('/')) {
        return `${baseUrl.replace(/\/+$/, '')}${decoded}`;
      }
    } catch (_) {}
  }

  const rewritten = rewriteToActiveArabSeedDomain(raw, baseUrl);
  return resolveSafeUrl(rewritten, baseUrl);
}

/**
 * Fetches HTML from ArabSeed with fallback across all configured domains
 */
async function fetchArabSeedHtmlWithFallback(targetUrl, options = {}) {
  if (typeof options.fixtureHtml === 'string') {
    return fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });
  }

  const candidateUrls = [targetUrl];
  try {
    const parsed = new URL(targetUrl);
    for (const domain of ARABSEED_CONFIG.domains) {
      const altOrigin = new URL(domain);
      if (altOrigin.host !== parsed.host) {
        const altUrl = new URL(parsed.pathname + parsed.search, altOrigin).toString();
        if (!candidateUrls.includes(altUrl)) candidateUrls.push(altUrl);
      }
    }
  } catch (_) {}

  let lastErr = null;
  for (const url of candidateUrls) {
    try {
      const res = await fetchProviderHtml(url, {
        ...options,
        headers: {
          ...generateAntiBanHeaders(url),
          Referer: `${new URL(url).origin}/`,
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

/**
 * Extracts catalog item cards from DOM
 */
function extractCardsFromDom($, baseUrl) {
  const items = [];
  const seenUrls = new Set();

  $('.MovieBlock, .PostBlock, ul.Blocks-UL li, .item, .entry-box').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    if (!href) return;

    const fullUrl = rewriteToActiveArabSeedDomain(href, baseUrl);
    if (!fullUrl || seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const rawTitle =
      $(el).find('h4, .BlockName, .Title, h3, .title').first().text().trim() ||
      a.attr('title') ||
      $(el).find('img').first().attr('alt') ||
      '';
    if (!rawTitle) return;

    const img = $(el).find('img').first();
    const rawPoster =
      img.attr('data-src') ||
      img.attr('data-image') ||
      img.attr('data-original') ||
      img.attr('src') ||
      '';
    const poster = rawPoster ? resolveSafeUrl(rawPoster, baseUrl) : '';

    const cleanTitle = cleanTitleText(rawTitle);
    const year = extractYear(rawTitle) || $(el).find('.Year, .year').first().text().trim() || '';
    const quality = $(el).find('.Quality, .quality, .badge').first().text().trim() || '';
    const rating = $(el).find('.Rating, .rating, .imdb').first().text().replace(/[^\d.]/g, '').trim() || '';

    const isSeries =
      /مسلسل|حلقة|موسم/i.test(rawTitle) ||
      /\/series\/|\/episode\/|\/tvshows\//i.test(fullUrl);
    const type = isSeries ? 'series' : 'movie';
    const ref = encodeArabSeedRef(fullUrl);

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title: cleanTitle,
        url: fullUrl,
        poster,
        year,
        quality,
        rating,
        type,
        category: type,
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: type }
    );

    if (normalized) {
      normalized.is_series = isSeries;
      normalized.serverPrefix = PROVIDER_META.code;
      items.push(normalized);
    }
  });

  return items;
}

/**
 * Scrapes ArabSeed catalog by category and page number
 */
export async function scrapeCatalog(category = 'movies', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const catKey = String(category || 'movies').toLowerCase();
  const subPath = ARABSEED_CONFIG.categories[catKey] || ARABSEED_CONFIG.categories.movies || '/category/foreign-movies/';

  let targetUrl = '';
  if (pageNum > 1) {
    const cleanSub = subPath.endsWith('/') ? subPath : `${subPath}/`;
    targetUrl = `${ARABSEED_CONFIG.baseUrl}${cleanSub}page/${pageNum}/`;
  } else {
    targetUrl = `${ARABSEED_CONFIG.baseUrl}${subPath}`;
  }

  try {
    const res = await fetchArabSeedHtmlWithFallback(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        res.status === 404 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `HTTP_${res.status}`,
        { url: targetUrl }
      );
    }

    const $ = cheerio.load(res.html);
    const items = extractCardsFromDom($, ARABSEED_CONFIG.baseUrl);

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
 * Searches ArabSeed using /find/?find={query}
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const targetUrl =
    pageNum > 1
      ? `${ARABSEED_CONFIG.baseUrl}/find/page/${pageNum}/?find=${encodeURIComponent(q)}`
      : `${ARABSEED_CONFIG.baseUrl}/find/?find=${encodeURIComponent(q)}`;

  try {
    const res = await fetchArabSeedHtmlWithFallback(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        res.status === 404 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
        `HTTP_${res.status}`,
        { url: targetUrl }
      );
    }

    const $ = cheerio.load(res.html);
    const items = extractCardsFromDom($, ARABSEED_CONFIG.baseUrl);

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
 * Scrapes details, metadata, and episode list from an ArabSeed title page
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolveArabSeedTargetUrl(urlOrRef);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing ArabSeed details reference', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetchArabSeedHtmlWithFallback(cleanUrl, {
    ...options,
    providerId: PROVIDER_META.id
  });

  if (!res.ok || !res.html) {
    throw new ScraperError(
      res.status === 404 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : SCRAPER_ERROR_CODES.ACCESS_BLOCKED,
      `Failed to fetch ArabSeed details HTTP_${res.status}`,
      {
        providerId: PROVIDER_META.id,
        url: cleanUrl,
        status: res.status
      }
    );
  }

  const $ = cheerio.load(res.html);
  const rawTitle =
    $('h1.Title, h1, .PostTitle').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().split('|')[0].trim();

  const title = cleanTitleText(rawTitle);
  const rawPoster =
    $('.Poster img, .poster img, .PostPoster img').first().attr('data-src') ||
    $('.Poster img, .poster img, .PostPoster img').first().attr('data-image') ||
    $('.Poster img, .poster img, .PostPoster img').first().attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';
  const poster = rawPoster ? resolveSafeUrl(rawPoster, ARABSEED_CONFIG.baseUrl) : '';

  const overview =
    $('.Story, .story, .Overview, .StoryMovie, .PostStory').first().text().trim() ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  const year = extractYear(rawTitle) || $('.Year, .year').first().text().trim() || '';
  const rating = $('.Rating, .rating, .imdb').first().text().replace(/[^\d.]/g, '').trim() || '';
  const quality = $('.Quality, .quality, .badge').first().text().trim() || '';

  const genres = [];
  $('.Genre a, .Genres a, .TaxTerms a, .Categories a').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  // Extract episodes list if present
  const episodes = [];
  const seenEpUrls = new Set();
  $('.ContainerEpisodesList a, .EpisodesList a, ul.episodes-list a, .EpisodeBlock a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    if (!epHref) return;

    const fullEpHref = rewriteToActiveArabSeedDomain(epHref, ARABSEED_CONFIG.baseUrl);
    if (seenEpUrls.has(fullEpHref)) return;
    seenEpUrls.add(fullEpHref);

    const epText = $(el).text().trim();
    const epNum = extractEpisodeNumber(epText, fullEpHref, idx + 1) || (idx + 1);
    const seasonNum = extractSeasonNumber(`${epText} ${fullEpHref}`, 1);
    const epRef = encodeArabSeedRef(fullEpHref);

    episodes.push({
      id: epRef,
      ref: epRef,
      number: epNum,
      season: seasonNum,
      title: epText || `الحلقة ${epNum}`,
      url: fullEpHref,
      source: PROVIDER_META.id
    });
  });

  episodes.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });

  const isSeries =
    episodes.length > 0 ||
    /مسلسل|حلقة|موسم/i.test(rawTitle) ||
    /\/series\/|\/tvshows\//i.test(cleanUrl);
  const type = isSeries ? 'series' : 'movie';

  const normalized = normalizeDetailsResult(
    {
      title,
      poster,
      overview,
      year,
      rating,
      quality,
      genres,
      episodes,
      type,
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: ARABSEED_CONFIG.baseUrl }
  );

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

/**
 * Scrapes episode list from an ArabSeed series page
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = resolveArabSeedTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid ArabSeed URL or ref');
  }

  try {
    const details = await scrapeDetails(targetUrl, options);
    const episodes = Array.isArray(details?.episodes) ? details.episodes : [];

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: episodes.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
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
 * Scrapes playable servers from an ArabSeed watch page or episode
 */
export async function scrapeServers(urlOrRef, options = {}) {
  let targetUrl = resolveArabSeedTargetUrl(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid ArabSeed URL or ref');
  }

  try {
    const res = await fetchArabSeedHtmlWithFallback(targetUrl, {
      ...options,
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

    let $ = cheerio.load(res.html);
    let watchPageUrl = targetUrl;

    // If this is a details page, navigate to watch page if a separate watch button exists
    const watchBtn = $('a.watch__btn, a[href*="/watch/"], .WatchBtn a').first();
    const watchBtnHref = watchBtn.attr('href');
    if (watchBtnHref && !targetUrl.includes('/watch/')) {
      const resolvedWatchUrl = resolveArabSeedTargetUrl(watchBtnHref);
      if (resolvedWatchUrl && resolvedWatchUrl !== targetUrl && !options.fixtureHtml) {
        try {
          const watchRes = await fetchArabSeedHtmlWithFallback(resolvedWatchUrl, {
            ...options,
            providerId: PROVIDER_META.id
          });
          if (watchRes.ok && watchRes.html) {
            $ = cheerio.load(watchRes.html);
            watchPageUrl = resolvedWatchUrl;
          }
        } catch (_) {}
      }
    }

    const candidateUrls = [];
    const seenCandidates = new Set();

    const addCandidate = (raw) => {
      if (!raw || typeof raw !== 'string') return;
      const unwrapped = unwrapBase64BridgeUrl(raw.trim());
      if (unwrapped && unwrapped.startsWith('http') && !seenCandidates.has(unwrapped)) {
        seenCandidates.add(unwrapped);
        candidateUrls.push(unwrapped);
      }
    };

    // 1. Extract direct iframes
    $('iframe[src], .containerServers iframe').each((_, el) => {
      addCandidate($(el).attr('src'));
    });

    // 2. Extract from WatchServersUl tabs and data-link elements
    $('.WatchServersUl li, [data-link], .server-item, .ServersList li').each((_, el) => {
      addCandidate($(el).attr('data-link'));
      addCandidate($(el).attr('data-url'));
      addCandidate($(el).attr('data-server'));
      addCandidate($(el).attr('data-src'));
    });

    // 3. Extract from HTML source links / scripts
    $('video source, video[src]').each((_, el) => {
      addCandidate($(el).attr('src'));
    });

    // 4. AJAX server retrieval (get_watch_server)
    const postId = $('.WatchServersUl li[data-post]').first().attr('data-post') || '';
    if (postId && candidateUrls.length < 2 && !options.fixtureHtml) {
      for (const srvIdx of ['0', '1', '2', '3']) {
        try {
          const ajaxRes = await fetchSafeResponse(`${ARABSEED_CONFIG.baseUrl}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            headers: {
              ...generateAntiBanHeaders(watchPageUrl),
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: watchPageUrl
            },
            body: new URLSearchParams({
              action: 'get_watch_server',
              post_id: postId,
              server: srvIdx,
              qu: '1080'
            }).toString(),
            timeoutMs: 5000,
            providerId: PROVIDER_META.id
          });

          if (ajaxRes.ok && ajaxRes.html) {
            const m = ajaxRes.html.match(/src=["'](https?:\/\/[^"']+)["']/i);
            if (m) addCandidate(m[1]);
          }
        } catch (_) {}
      }
    }

    // 5. Unwrap candidate embeds to direct playable media streams
    const unwrappedGroups = await Promise.all(
      candidateUrls.slice(0, 6).map((u) => {
        if (isValidDirectMediaUrl(u) || u.includes('.m3u8') || u.includes('.mp4')) {
          const streamType = u.includes('.m3u8') ? 'm3u8' : 'mp4';
          return Promise.resolve([
            {
              url: u,
              streamType,
              quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
              headers: { Referer: watchPageUrl, Origin: ARABSEED_CONFIG.baseUrl }
            }
          ]);
        }
        return unwrapEmbedToDirectStreams(u, watchPageUrl).catch(() => []);
      })
    );

    const servers = [];
    const seenServerUrls = new Set();

    for (const group of unwrappedGroups) {
      for (const s of group) {
        if (!s || !s.url || seenServerUrls.has(s.url)) continue;
        seenServerUrls.add(s.url);

        const idx = servers.length + 1;
        servers.push({
          id: `arabseed-${idx}`,
          provider: 'arabseed',
          code: `AD-${idx}`,
          serverCode: `AD-${idx}`,
          name: `عرب سيد - سيرفر ${idx}`,
          label: `عرب سيد - سيرفر ${idx}`,
          url: s.url,
          type: s.streamType || (s.url.includes('.m3u8') ? 'm3u8' : 'mp4'),
          streamType: s.streamType || (s.url.includes('.m3u8') ? 'm3u8' : 'mp4'),
          quality: s.quality || '',
          verified: Boolean(s.verified ?? (s.streamType !== 'embed')),
          headers: s.headers || { Referer: watchPageUrl }
        });
      }
    }

    // If no direct stream unwrapped yet, preserve original candidate embeds as embed servers
    if (servers.length === 0) {
      for (const u of candidateUrls) {
        if (seenServerUrls.has(u)) continue;
        seenServerUrls.add(u);
        const idx = servers.length + 1;
        servers.push({
          id: `arabseed-${idx}`,
          provider: 'arabseed',
          code: `AD-${idx}`,
          serverCode: `AD-${idx}`,
          name: `عرب سيد - سيرفر ${idx} (Embed)`,
          label: `عرب سيد - سيرفر ${idx} (Embed)`,
          url: u,
          type: 'embed',
          streamType: 'embed',
          quality: null,
          verified: false,
          headers: { Referer: watchPageUrl }
        });
      }
    }

    return attachResultMeta(servers, {
      ok: true,
      errorCode: servers.length === 0 ? SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED : null,
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
  const cleanUrl = resolveArabSeedTargetUrl(urlOrRef);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream URL or ref for ArabSeed', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  // If already a direct media file
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
        Referer: `${ARABSEED_CONFIG.baseUrl}/`,
        Origin: ARABSEED_CONFIG.baseUrl
      }
    };
  }

  const servers = await scrapeServers(cleanUrl, options);
  if (servers && servers.length > 0) {
    const direct = servers.find((s) => s.type === 'm3u8' || s.type === 'mp4') || servers[0];
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: direct.url,
      type: direct.type,
      streamType: direct.streamType,
      quality: direct.quality,
      verified: direct.verified ?? (direct.type !== 'embed'),
      headers: direct.headers || { Referer: cleanUrl }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve direct ArabSeed stream', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

// Backward-compatible named exports
export const scrapeArabSeedCategory = scrapeCatalog;
export const scrapeArabSeedCatalog = scrapeCatalog;
export const searchArabSeed = scrapeSearch;
export const scrapeArabSeedSearch = scrapeSearch;
export const scrapeArabSeedDetails = scrapeDetails;
export const scrapeArabSeedEpisodes = scrapeEpisodes;

export async function extractArabSeedStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}
