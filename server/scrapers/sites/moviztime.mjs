// server/scrapers/sites/moviztime.mjs
// Standalone provider module for Moviz Time (وقت الأفلام - moviztime, code: ME)
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

export const PROVIDER_META = Object.freeze({
  id: 'moviztime',
  name: 'Moviz Time',
  code: 'ME',
  domains: ['https://moviz-time.quest'],
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
    queryParam: 's'
  }
});

export const MOVIZTIME_CONFIG = {
  key: 'moviztime',
  id: 'moviztime',
  name: 'Moviz Time',
  code: 'ME',
  baseUrl: 'https://moviz-time.quest',
  categories: {
    all: '/',
    movies: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9/',
    movies_all: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9/',
    movies_foreign: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9/',
    movies_2026: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-2026/',
    movies_2025: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-2025/',
    movies_asian: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%a2%d8%b3%d9%8a%d9%88%d9%8a%d8%a9-%d9%85%d8%aa%d8%b1%d8%ac%d9%85%d8%a9/',
    movies_indian: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a%d8%a9/',
    movies_turkish: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9-%d9%85%d8%aa%d8%b1%d8%ac%d9%85%d8%a9-e/',
    series_all: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9-%d9%85%d8%aa%d8%b1%d8%ac%d9%85%d8%a9-e/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a3%d8%ac%d9%86%d8%a8%d9%8a%d8%a9-%d9%85%d8%aa%d8%b1%d8%ac%d9%85%d8%a9-e/',
    series_asian: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%83%d9%88%d8%b1%d9%8a%d8%a9/',
    series_korean: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%83%d9%88%d8%b1%d9%8a%d8%a9/',
    anime: '/category/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a3%d9%86%d9%85%d9%8a-b/',
    anime_all: '/category/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a3%d9%86%d9%85%d9%8a-b/',
    anime_movies: '/category/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a3%d9%86%d9%85%d9%8a-b/%d8%a3%d9%81%d9%84%d8%a7%d9%85-%d8%a3%d9%86%d9%85%d9%8a/',
    anime_series: '/category/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a3%d9%86%d9%85%d9%8a-b/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a3%d9%86%d9%85%d9%8a/'
  }
};

function stripProviderPrefix(urlOrRef = '') {
  const raw = String(urlOrRef || '').trim();
  if (!raw) return '';
  if (raw.startsWith('moviztime:')) {
    const rest = raw.slice('moviztime:'.length);
    if (rest.startsWith('http://') || rest.startsWith('https://')) return rest;
    try {
      const decoded = Buffer.from(rest, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
    } catch (_) {}
  }
  return raw;
}

function isEmbedPlayerHost(url = '') {
  return /vidhls\.com|embed\.hamml\.com|imovietime\.bond|\/player\/index\.php\?data=|\/iframe\.php\?id=/i.test(url);
}

function extractCardsFromDom($, baseUrl, defaultType = 'movie') {
  const items = [];
  const seenUrls = new Set();

  // 1. Primary MovizTime pinthis theme cards (article.pinbox)
  $('article.pinbox').each((_, el) => {
    const titleAnchor = $(el).find('.title h2 a, h2.title-2 a').first();
    const thumbAnchor = $(el).find('.preview .thumb a, .preview a').first();
    const rawHref = titleAnchor.attr('href') || thumbAnchor.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl);
    if (!url || seenUrls.has(url)) return;

    const imgEl = $(el).find('.preview img, img').first();
    const rawTitle =
      titleAnchor.text().trim() ||
      thumbAnchor.attr('title') ||
      imgEl.attr('alt') ||
      '';
    if (!rawTitle) return;

    const rawPoster =
      imgEl.attr('data-src') ||
      imgEl.attr('data-lazy-src') ||
      imgEl.attr('src') ||
      '';
    const qualityBadge = $(el).find('span._quality_tag').first().text().trim();
    const quality =
      qualityBadge && !/حلقة|الحلقة/i.test(qualityBadge) ? qualityBadge : 'HD';

    const hasSeriesClass = $(el).find('.series, .type-series').length > 0;
    const inferredType =
      hasSeriesClass || url.includes('/series/')
        ? 'series'
        : inferContentType(rawTitle, url, defaultType);

    const normalized = normalizeCatalogItem(
      {
        title: rawTitle,
        url,
        poster: rawPoster,
        year: extractYear(rawTitle),
        quality,
        type: inferredType,
        category: inferredType
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType }
    );

    if (normalized) {
      normalized.serverPrefix = PROVIDER_META.code;
      seenUrls.add(url);
      items.push(normalized);
    }
  });

  // 2. Fallback DooPlay cards (article.item, .result-item)
  if (items.length === 0) {
    $('article.item, .result-item').each((_, el) => {
      const a = $(el).find('.poster a, .title a, h3 a, .thumbnail a').first();
      const rawHref = a.attr('href') || '';
      const url = resolveSafeUrl(rawHref, baseUrl);
      if (!url || seenUrls.has(url)) return;

      const rawTitle =
        $(el).find('h3 a, .title a').first().text().trim() ||
        a.attr('title') ||
        $(el).find('img').attr('alt') ||
        '';
      if (!rawTitle) return;

      const imgEl = $(el).find('img').first();
      const rawPoster = imgEl.attr('data-src') || imgEl.attr('src') || '';
      const year = $(el).find('.data span, .year').first().text().trim() || extractYear(rawTitle);
      const rating = $(el).find('.rating').text().replace(/[^\d.]/g, '').trim();

      const normalized = normalizeCatalogItem(
        {
          title: rawTitle,
          url,
          poster: rawPoster,
          year,
          rating,
          type: url.includes('/tvshows/') || url.includes('/series/') || url.includes('/episodes/') ? 'series' : defaultType
        },
        { providerId: PROVIDER_META.id, baseUrl, defaultType }
      );

      if (normalized) {
        normalized.serverPrefix = PROVIDER_META.code;
        seenUrls.add(url);
        items.push(normalized);
      }
    });
  }

  return items;
}

const MOVIZTIME_SEASON_ORDINALS = [
  [/الأول|الاول|الأولى|الاولى/, 1],
  [/الثاني|الثانية|الثانيه/, 2],
  [/الثالث|الثالثة|الثالثه/, 3],
  [/الرابع|الرابعة|الرابعه/, 4],
  [/الخامس|الخامسة|الخامسه/, 5],
  [/السادس|السادسة|السادسه/, 6],
  [/السابع|السابعة|السابعه/, 7],
  [/الثامن|الثامنة|الثامنه/, 8],
  [/التاسع|التاسعة|التاسعه/, 9],
  [/العاشر|العاشرة|العاشره/, 10]
];

function parseMovizTimeSeasonText(text = '', fallback = null) {
  const s = String(text || '').trim();
  if (!s) return fallback;
  const numMatch = s.match(/(?:الموسم|موسم|season)\s*[:\-_]?\s*(\d{1,2})/i);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n > 0 && n <= 99) return n;
  }
  for (const [rgx, num] of MOVIZTIME_SEASON_ORDINALS) {
    const fullRgx = new RegExp(`(?:الموسم|موسم)\\s+(?:${rgx.source})(?:\\s|$|[-_/,])`, 'i');
    if (fullRgx.test(s) || rgx.test(s)) {
      if (/(?:الموسم|موسم)/i.test(s)) return num;
    }
  }
  return extractSeasonNumber(s, fallback);
}

function parseMovizTimeSeason($, title = '', pageUrl = '', defaultSeason = 1) {
  let detected = null;
  $('p.movie_details_section').each((_, el) => {
    const label = $(el).find('.ttl').text().trim();
    const val = $(el).find('.cntt').text().trim();
    if (/الموسم/i.test(label) && val) {
      detected = parseMovizTimeSeasonText(`الموسم ${val}`, detected);
    }
  });
  if (detected) return detected;
  detected = parseMovizTimeSeasonText(title, null);
  if (detected) return detected;
  try {
    detected = parseMovizTimeSeasonText(decodeURIComponent(String(pageUrl || '')), null);
    if (detected) return detected;
  } catch (_) {}
  return defaultSeason;
}

function extractEpisodesFromDom($, pageUrl, defaultSeason = 1) {
  const rawEpisodes = [];
  const seenEpNumbers = new Set();

  // 1. Live MovizTime pinthis series episode buttons (.servers-block .ep-items button.ep-item)
  $('.servers-block').each((blockIdx, blockEl) => {
    $(blockEl)
      .find('button.ep-item, a.ep-item')
      .each((idx, el) => {
        const label = $(el).text().trim();
        const onclick = $(el).attr('onclick') || '';
        const href = $(el).attr('href') || '';
        const locMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
        const embedUrl = locMatch ? locMatch[1].trim() : href.trim();
        const epNum = extractEpisodeNumber(label, '', idx + 1) || idx + 1;

        // Only add primary episode entry once across multiple server blocks and deduplicate by episode number
        if (blockIdx === 0 && embedUrl && !seenEpNumbers.has(epNum)) {
          seenEpNumbers.add(epNum);
          rawEpisodes.push({
            number: epNum,
            season: defaultSeason,
            title: label || `الحلقة ${epNum}`,
            url: embedUrl
          });
        }
      });
  });

  // 2. Fallback DooPlay episodes (#seasons ul.episodios li)
  if (rawEpisodes.length === 0) {
    $('#seasons ul.episodios li').each((idx, el) => {
      const a = $(el).find('.episodiotitle a, a').first();
      const epHref = a.attr('href') || '';
      const numText = $(el).find('.numerando').text().trim();
      const parts = numText.split('-').map((s) => parseInt(s.trim(), 10));
      const season = parts.length > 1 && !Number.isNaN(parts[0]) ? parts[0] : defaultSeason;
      const epNum =
        (parts.length > 1 ? parts[1] : parts[0]) ||
        extractEpisodeNumber(a.text().trim(), epHref, idx + 1) ||
        idx + 1;

      if (epHref) {
        rawEpisodes.push({
          number: epNum,
          season,
          title: a.text().trim() || `الحلقة ${epNum}`,
          url: epHref
        });
      }
    });
  }

  return normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl: pageUrl || MOVIZTIME_CONFIG.baseUrl,
    defaultSeason
  });
}

function parseFirePlayerHtml(html = '', embedUrl = '', cookieHeader = '') {
  if (!html) return [];
  const streams = [];
  let origin = 'https://vidhls.com';
  try {
    origin = new URL(embedUrl).origin;
  } catch (_) {}

  let videoUrl = '';
  let videoServer = '';

  const fpMatch = html.match(/FirePlayer\s*\(\s*[^,]+,\s*(\{[\s\S]*?\})\s*,\s*(?:true|false)\s*\)/i);
  if (fpMatch) {
    try {
      const cfg = JSON.parse(fpMatch[1]);
      videoUrl = cfg.videoUrl || '';
      videoServer = cfg.videoServer || '';
    } catch (_) {}
  }

  if (!videoUrl) {
    const vuMatch = html.match(/"videoUrl"\s*:\s*"([^"]+)"/i);
    const vsMatch = html.match(/"videoServer"\s*:\s*"([^"]+)"/i);
    if (vuMatch) videoUrl = vuMatch[1].replace(/\\\//g, '/');
    if (vsMatch) videoServer = vsMatch[1];
  }

  if (videoUrl && videoUrl.startsWith('/')) {
    const query = videoServer ? `?s=${encodeURIComponent(videoServer)}` : '';
    const fullHlsUrl = `${origin}${videoUrl}${query}`;
    const headers = {
      Referer: embedUrl || `${origin}/`,
      Origin: origin
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    streams.push({
      name: 'MovizTime Direct HLS',
      label: 'MovizTime Direct HLS',
      url: fullHlsUrl,
      type: 'm3u8',
      streamType: 'm3u8',
      quality: 'AUTO-HLS',
      headers
    });
  }

  return streams;
}

async function resolveFirePlayerEmbed(embedUrl, refererUrl = '', options = {}) {
  if (typeof options.ajaxFixtureResponse === 'string' && options.ajaxFixtureResponse) {
    return parseFirePlayerHtml(options.ajaxFixtureResponse, embedUrl);
  }
  if (typeof options.fixtureHtml === 'string') {
    return parseFirePlayerHtml(options.fixtureHtml, embedUrl);
  }

  try {
    const res = await fetchSafeResponse(embedUrl, {
      referer: refererUrl || `${MOVIZTIME_CONFIG.baseUrl}/`,
      timeoutMs: options.timeoutMs || 8000,
      providerId: PROVIDER_META.id
    });
    if (!res.ok || !res.html) return [];

    const setCookies =
      typeof res.headers?.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers?.get?.('set-cookie')].filter(Boolean);
    const cookieHeader = setCookies.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');

    return parseFirePlayerHtml(res.html, embedUrl, cookieHeader);
  } catch (_) {
    return [];
  }
}

export async function scrapeCatalog(category = 'movies_all', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    MOVIZTIME_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : MOVIZTIME_CONFIG.categories.movies_all);
  const cleanSubPath = subPath.endsWith('/') ? subPath : `${subPath}/`;
  const targetUrl =
    pageNum > 1
      ? `${MOVIZTIME_CONFIG.baseUrl}${cleanSubPath}page/${pageNum}/`
      : `${MOVIZTIME_CONFIG.baseUrl}${cleanSubPath}`;

  const defaultType = /series|tvshows|مسلسلات/i.test(category) ? 'series' : 'movie';

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const $ = cheerio.load(res.html);
    const items = extractCardsFromDom($, MOVIZTIME_CONFIG.baseUrl, defaultType);

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

export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const encoded = encodeURIComponent(q);
  const targetUrl =
    pageNum > 1
      ? `${MOVIZTIME_CONFIG.baseUrl}/page/${pageNum}/?s=${encoded}`
      : `${MOVIZTIME_CONFIG.baseUrl}/?s=${encoded}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const $ = cheerio.load(res.html);
    const items = extractCardsFromDom($, MOVIZTIME_CONFIG.baseUrl, 'movie');

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

export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolveSafeUrl(stripProviderPrefix(urlOrRef), MOVIZTIME_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for MovizTime details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const res = await fetchProviderHtml(cleanUrl, {
    ...options,
    providerId: PROVIDER_META.id
  });

  if (!res.ok || !res.html) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch details HTTP_${res.status}`, {
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      status: res.status
    });
  }

  const $ = cheerio.load(res.html);
  let title =
    $('.contentbox h1.title-3 a, .contentbox h1.title-3, .sheader .data h1, h1')
      .first()
      .text()
      .trim() || '';

  const imgEl = $('.textbox.__movies_details_box img.post__thumb, .contentbox img.post__thumb, .sheader .poster img').first();
  const poster =
    imgEl.attr('data-src') ||
    imgEl.attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';

  let year = '';
  let rating = '';
  let quality = 'HD';
  let overview = '';
  let seasonNumber = 1;
  const genres = [];

  $('p.movie_details_section').each((_, el) => {
    const label = $(el).find('.ttl').text().trim();
    const val = $(el).find('.cntt').text().trim();
    if (!label || !val) return;

    if (/اسم الفيلم|اسم المسلسل/i.test(label) && !title) {
      title = val;
    } else if (/سنة الإنتاج|السنة/i.test(label)) {
      year = extractYear(val) || val;
    } else if (/نوع الفيلم|نوع المسلسل|التصنيف/i.test(label)) {
      val
        .split(/[-،,/|]/)
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => {
          if (!genres.includes(g)) genres.push(g);
        });
    } else if (/تقييم/i.test(label)) {
      rating = val.replace(/[^\d.]/g, '').trim();
    } else if (/جودة/i.test(label)) {
      quality = val;
    } else if (/قصة/i.test(label)) {
      overview = val;
    } else if (/الموسم/i.test(label)) {
      seasonNumber = parseMovizTimeSeasonText(`الموسم ${val}`, 1) || 1;
    }
  });

  if (genres.length === 0) {
    $('.categories a[rel*="category"], .sgeneros a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !/أفلام|مسلسلات/i.test(g) && !genres.includes(g)) {
        genres.push(g);
      }
    });
  }

  if (!overview) {
    overview = $('.wp-content p, .textbox p').not('.movie_details_section, .categories').first().text().trim();
  }

  if (!year) {
    year = extractYear(title);
  }

  seasonNumber = parseMovizTimeSeason($, title, cleanUrl, seasonNumber);
  const episodes = extractEpisodesFromDom($, cleanUrl, seasonNumber);
  const isSeries =
    episodes.length > 0 ||
    cleanUrl.includes('/series/') ||
    cleanUrl.includes('/tvshows/') ||
    $('.postWrap .series, .type-series').length > 0;

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
      type: isSeries ? 'series' : inferContentType(title, cleanUrl, 'movie'),
      sourceUrl: cleanUrl
    },
    { providerId: PROVIDER_META.id, baseUrl: MOVIZTIME_CONFIG.baseUrl }
  );

  return attachResultMeta(normalized, {
    ok: Boolean(title),
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolveSafeUrl(stripProviderPrefix(urlOrRef), MOVIZTIME_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid series URL');
  }

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const $ = cheerio.load(res.html);
    const title = $('.contentbox h1.title-3, h1').first().text().trim();
    const defaultSeason = parseMovizTimeSeason($, title, cleanUrl, 1);
    const episodes = extractEpisodesFromDom($, cleanUrl, defaultSeason);

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

export async function scrapeServers(urlOrRef, options = {}) {
  const cleanUrl = resolveSafeUrl(stripProviderPrefix(urlOrRef), MOVIZTIME_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid watch/details URL');
  }

  const isFixtureMode = typeof options.fixtureHtml === 'string' || typeof options.ajaxFixtureResponse === 'string';
  const rawServers = [];
  const candidateEmbeds = [];

  try {
    // Case 1: Target URL is already a direct player embed URL (e.g. vidhls.com/player/index.php?data=...)
    if (isEmbedPlayerHost(cleanUrl) && typeof options.fixtureHtml !== 'string') {
      const resolvedFire = await resolveFirePlayerEmbed(cleanUrl, `${MOVIZTIME_CONFIG.baseUrl}/`, options);
      for (const s of resolvedFire) {
        rawServers.push(s);
      }
      rawServers.push({
        name: 'MovizTime Player #1',
        label: 'MovizTime Player #1',
        url: cleanUrl,
        type: 'embed',
        streamType: 'embed',
        quality: null,
        headers: { Referer: `${MOVIZTIME_CONFIG.baseUrl}/` }
      });

      const normalized = normalizeServerList(rawServers, {
        providerId: PROVIDER_META.id,
        providerName: PROVIDER_META.name,
        codePrefix: PROVIDER_META.code,
        baseUrl: MOVIZTIME_CONFIG.baseUrl
      });

      return attachResultMeta(normalized, {
        ok: normalized.length > 0,
        providerId: PROVIDER_META.id,
        url: cleanUrl
      });
    }

    const res = await fetchProviderHtml(cleanUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const $ = cheerio.load(res.html);

    // 1. If the HTML itself is a FirePlayer page (e.g., AJAX_PLAYER_RESPONSE fixture)
    const directFireFromHtml = parseFirePlayerHtml(res.html, cleanUrl);
    for (const s of directFireFromHtml) {
      rawServers.push(s);
    }

    // 2. Movie servers tabs (#servers_tabs .single_tab iframe)
    const tabLabels = new Map();
    $('#servers_tabs .tabs_btns .server_btn').each((_, btn) => {
      const targetTab = $(btn).attr('data-target-tab');
      const label = $(btn).text().trim();
      if (targetTab && label) tabLabels.set(targetTab, label);
    });

    $('#servers_tabs .single_tab').each((idx, tabEl) => {
      const tabId = $(tabEl).attr('data-tab-id') || `server_${idx + 1}`;
      const iframe = $(tabEl).find('iframe').first();
      const rawSrc =
        iframe.attr('data-src') ||
        iframe.attr('data-lazy-src') ||
        iframe.attr('data-litespeed-src') ||
        iframe.attr('src') ||
        '';
      const resolved = resolveSafeUrl(rawSrc, cleanUrl);
      if (resolved) {
        const label = tabLabels.get(tabId) || `MovizTime Server ${idx + 1}`;
        candidateEmbeds.push({ url: resolved, label });
      }
    });

    // 3. Series episode buttons (.servers-block button.ep-item)
    let requestedEp = null;
    try {
      const parsedTarget = new URL(cleanUrl);
      if (parsedTarget.searchParams.has('ep')) {
        requestedEp = parseInt(parsedTarget.searchParams.get('ep'), 10);
      }
    } catch (_) {}

    $('.servers-block').each((blockIdx, blockEl) => {
      const blockTitle = $(blockEl).find('.title').text().trim() || `السيرفر ${blockIdx + 1}`;
      $(blockEl)
        .find('button.ep-item, a.ep-item')
        .each((epIdx, epEl) => {
          const epText = $(epEl).text().trim();
          const epNum = extractEpisodeNumber(epText, '', epIdx + 1) || epIdx + 1;
          if (requestedEp && epNum !== requestedEp) return;
          if (!requestedEp && epIdx > 0 && candidateEmbeds.length > 0) return;

          const onclick = $(epEl).attr('onclick') || '';
          const locMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
          const rawEmbed = locMatch ? locMatch[1].trim() : $(epEl).attr('href') || '';
          const resolved = resolveSafeUrl(rawEmbed, cleanUrl);
          if (resolved) {
            candidateEmbeds.push({ url: resolved, label: `${blockTitle} - ${epText || `الحلقة ${epNum}`}` });
          }
        });
    });

    // 4. DooPlay fallback player options (#playeroptionsul li.dooplay_player_option)
    const dooPlayOpts = [];
    $('#playeroptionsul li.dooplay_player_option').each((idx, el) => {
      const post = $(el).attr('data-post');
      const nume = $(el).attr('data-nume');
      const type = $(el).attr('data-type') || 'movie';
      const label = $(el).find('.title').text().trim() || `DooPlay #${idx + 1}`;
      const directDataUrl = $(el).attr('data-embed') || $(el).attr('data-url') || '';
      if (directDataUrl) {
        const resolved = resolveSafeUrl(directDataUrl, cleanUrl);
        if (resolved) candidateEmbeds.push({ url: resolved, label });
      } else if (post && nume && nume !== 'trailer') {
        dooPlayOpts.push({ post, nume, type, label });
      }
    });

    if (!isFixtureMode && dooPlayOpts.length > 0) {
      for (const opt of dooPlayOpts.slice(0, 5)) {
        try {
          const ajaxRes = await fetchSafeResponse(`${MOVIZTIME_CONFIG.baseUrl}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest'
            },
            referer: cleanUrl,
            body: new URLSearchParams({
              action: 'doo_player_ajax',
              post: opt.post,
              nume: opt.nume,
              type: opt.type
            }).toString(),
            providerId: PROVIDER_META.id
          });
          if (ajaxRes.ok && ajaxRes.html) {
            const data = JSON.parse(ajaxRes.html);
            const rawEmbed =
              data?.embed_url ||
              (String(data?.embed_url || '').match(/src=["']([^"']+)["']/i) || [])[1] ||
              '';
            const resolved = resolveSafeUrl(rawEmbed, cleanUrl);
            if (resolved) candidateEmbeds.push({ url: resolved, label: opt.label });
          }
        } catch (_) {}
      }
    }

    // 5. Generic iframes and download links (#download, .links_table, .download_btn)
    $('iframe[src], iframe[data-src]').each((idx, el) => {
      const rawSrc = $(el).attr('data-src') || $(el).attr('src') || '';
      const resolved = resolveSafeUrl(rawSrc, cleanUrl);
      if (resolved && !candidateEmbeds.some((c) => c.url === resolved)) {
        candidateEmbeds.push({ url: resolved, label: `MovizTime Embed #${idx + 1}` });
      }
    });

    $('#download tr a[href^="http"], .links_table a[href^="http"], a.download_btn[href^="http"]').each((idx, el) => {
      const href = resolveSafeUrl($(el).attr('href') || '', cleanUrl);
      const text = $(el).text().trim() || `Download #${idx + 1}`;
      if (href && !/hai8g\.com|acscdn\.com/i.test(href) && !candidateEmbeds.some((c) => c.url === href)) {
        candidateEmbeds.push({ url: href, label: text });
      }
    });

    // 6. Unwrap FirePlayer / embed candidates
    for (const cand of candidateEmbeds.slice(0, 6)) {
      if (isEmbedPlayerHost(cand.url)) {
        if (!isFixtureMode || typeof options.ajaxFixtureResponse === 'string') {
          const fireStreams = await resolveFirePlayerEmbed(cand.url, cleanUrl, options);
          for (const fs of fireStreams) {
            rawServers.push({
              ...fs,
              name: `${cand.label} (HLS)`,
              label: `${cand.label} (HLS)`
            });
          }
        }
      } else if (!isFixtureMode && !cand.url.includes('/download-movie/') && !cand.url.includes('/download-series/')) {
        try {
          const unwrapped = await unwrapEmbedToDirectStreams(cand.url, cleanUrl);
          for (const s of unwrapped) {
            rawServers.push({
              name: `${cand.label} (${s.quality || 'Direct'})`,
              label: `${cand.label} (${s.quality || 'Direct'})`,
              url: s.url,
              type: s.streamType,
              streamType: s.streamType,
              quality: s.quality || '',
              headers: s.headers || { Referer: cleanUrl }
            });
          }
        } catch (_) {}
      }

      // Always preserve the candidate embed/download server itself
      rawServers.push({
        name: cand.label,
        label: cand.label,
        url: cand.url,
        type: isValidDirectMediaUrl(cand.url)
          ? cand.url.toLowerCase().includes('.m3u8') || cand.url.toLowerCase().includes('master.txt')
            ? 'm3u8'
            : 'mp4'
          : 'embed',
        quality: null,
        headers: { Referer: cleanUrl }
      });
    }

    if (rawServers.length === 0 && isEmbedPlayerHost(cleanUrl)) {
      rawServers.push({
        name: 'MovizTime Player #1',
        label: 'MovizTime Player #1',
        url: cleanUrl,
        type: 'embed',
        streamType: 'embed',
        quality: null,
        headers: { Referer: `${MOVIZTIME_CONFIG.baseUrl}/` }
      });
    }

    const normalized = normalizeServerList(rawServers, {
      providerId: PROVIDER_META.id,
      providerName: PROVIDER_META.name,
      codePrefix: PROVIDER_META.code,
      baseUrl: MOVIZTIME_CONFIG.baseUrl
    });

    if (normalized.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No playable servers extracted from MovizTime page',
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
  const cleanUrl = resolveSafeUrl(stripProviderPrefix(urlOrRef), MOVIZTIME_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream or embed URL for MovizTime', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  if (isValidDirectMediaUrl(cleanUrl)) {
    const streamType =
      cleanUrl.toLowerCase().includes('.m3u8') ||
      cleanUrl.toLowerCase().includes('/hls/') ||
      cleanUrl.toLowerCase().includes('master.txt')
        ? 'm3u8'
        : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      headers: options.headers || { Referer: `${MOVIZTIME_CONFIG.baseUrl}/` }
    };
  }

  if (isEmbedPlayerHost(cleanUrl)) {
    const fireStreams = await resolveFirePlayerEmbed(cleanUrl, `${MOVIZTIME_CONFIG.baseUrl}/`, options);
    if (fireStreams.length > 0) {
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        ...fireStreams[0]
      };
    }
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: 'embed',
      streamType: 'embed',
      quality: null,
      headers: { Referer: `${MOVIZTIME_CONFIG.baseUrl}/` }
    };
  }

  // If a MovizTime watch/details page URL was passed, extract servers and pick best
  if (cleanUrl.includes('moviz-time.')) {
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
        headers: direct.headers || { Referer: cleanUrl }
      };
    }
  }

  const unwrapped = await unwrapEmbedToDirectStreams(cleanUrl, `${MOVIZTIME_CONFIG.baseUrl}/`);
  if (unwrapped.length > 0) {
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: unwrapped[0].url,
      type: unwrapped[0].streamType,
      streamType: unwrapped[0].streamType,
      quality: unwrapped[0].quality || '',
      headers: unwrapped[0].headers || { Referer: cleanUrl }
    };
  }

  throw new ScraperError(SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED, 'Unable to resolve stream URL', {
    providerId: PROVIDER_META.id,
    url: cleanUrl
  });
}

// Backward-compatible aliases required by supervisors or legacy tests
export const scrapeMovizTimeCategory = scrapeCatalog;
export const scrapeMovizTimeCatalog = scrapeCatalog;
export const searchMovizTime = scrapeSearch;
export const scrapeMovizTimeSearch = scrapeSearch;
export const scrapeMovizTimeDetails = scrapeDetails;
export const scrapeMovizTimeEpisodes = scrapeEpisodes;
export const extractMovizTimeServers = scrapeServers;

export async function extractMovizTimeStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return { episodes, servers };
}
