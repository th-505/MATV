// server/scrapers/sites/ristoanime.mjs
// Standalone scraper module for RistoAnime (https://ristoanime.me / https://ristoanime.com) — Code: RE
import * as cheerio from 'cheerio';
import { fetchProviderHtml, resolveSafeUrl } from '../shared/http.mjs';
import {
  cleanTitleText,
  extractEpisodeNumber,
  extractSeasonNumber,
  extractYear,
  normalizeCatalogItem,
  normalizeDetailsResult,
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
import { unwrapEmbedToDirectStreams, extractRawStreamsFromText } from '../stream-unwrapper.mjs';

export const PROVIDER_META = Object.freeze({
  id: 'ristoanime',
  name: 'RistoAnime',
  code: 'RE',
  domains: ['https://ristoanime.me', 'https://ristoanime.com'],
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

export const RISTOANIME_CONFIG = Object.freeze({
  id: 'ristoanime',
  key: 'ristoanime',
  name: 'RistoAnime',
  code: 'RE',
  baseUrl: 'https://ristoanime.me',
  fallbackUrl: 'https://ristoanime.com',
  domains: ['https://ristoanime.me', 'https://ristoanime.com'],
  categories: {
    series: '/series/',
    anime_series: '/series/',
    anime: '/series/',
    'series-anime': '/series/',
    movies: '/movies/',
    movie: '/movies/',
    anime_movies: '/movies/',
    'movie-anime': '/movies/',
    latest: '/',
    home: '/',
    views: '/views/',
    popular: '/views/'
  }
});

function decodeProviderRef(urlOrRef = '', baseUrl = RISTOANIME_CONFIG.baseUrl) {
  if (!urlOrRef || typeof urlOrRef !== 'string') return '';
  let raw = urlOrRef.trim();

  for (const prefix of ['ristoanime:ep:', 'ristoanime:', 'risto:ep:', 'risto:']) {
    if (raw.toLowerCase().startsWith(prefix)) {
      raw = raw.slice(prefix.length).trim();
      break;
    }
  }

  if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) {
    for (const encoding of ['base64url', 'base64']) {
      try {
        const decoded = Buffer.from(raw, encoding).toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
          raw = decoded;
          break;
        }
      } catch (_) {}
    }
  }

  return resolveSafeUrl(raw, baseUrl, { allowHttp: true });
}

function extractBgImageUrl(styleAttr = '', baseUrl = RISTOANIME_CONFIG.baseUrl) {
  if (!styleAttr || typeof styleAttr !== 'string') return '';
  const match = styleAttr.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
  if (!match || !match[1]) return '';
  return resolveSafeUrl(match[1], baseUrl, { allowHttp: true });
}

function extractNodePoster($, node, baseUrl = RISTOANIME_CONFIG.baseUrl) {
  const posterDiv = node.find('.poster, [data-style*="background-image"], [style*="background-image"]').first();
  if (posterDiv.length) {
    const fromDataStyle = extractBgImageUrl(posterDiv.attr('data-style'), baseUrl);
    if (fromDataStyle) return fromDataStyle;
    const fromStyle = extractBgImageUrl(posterDiv.attr('style'), baseUrl);
    if (fromStyle) return fromStyle;
  }

  const selfBg =
    extractBgImageUrl(node.attr('data-style'), baseUrl) ||
    extractBgImageUrl(node.attr('style'), baseUrl);
  if (selfBg) return selfBg;

  const img = node.find('img').first();
  if (img.length) {
    const src = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
    const resolved = resolveSafeUrl(src, baseUrl, { allowHttp: true });
    if (resolved) return resolved;
  }

  return '';
}

function parseRistoCatalogItems($, baseUrl = RISTOANIME_CONFIG.baseUrl, defaultType = 'series') {
  const items = [];
  const seenUrls = new Set();

  // Primary RistoAnime (TopAnime theme) card selectors discovered on live ristoanime.me:
  // .BlocksHolder .MovieItem, .MovieItem, .Slides .SlideItem
  const cardSelector = '.BlocksHolder .MovieItem, .MovieItem, .Slides .SlideItem, .anime-item';
  $(cardSelector).each((_, el) => {
    const node = $(el);
    const link = node.is('a[href]') ? node : node.find('a[href]').first();
    const rawHref = link.attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl, { allowHttp: true });
    if (!url || seenUrls.has(url)) return;

    // On RistoAnime, .MovieItem > a > .title contains both <p> (excerpt) and <h4> (clean anime title)
    const rawTitle =
      node.find('.title h4, h4, .title h3, h3').first().text().trim() ||
      link.attr('title')?.trim() ||
      node.find('.title').first().text().trim();
    if (!rawTitle) return;

    const poster = extractNodePoster($, node, baseUrl);
    const categoryText = node.find('.categorySpan').first().text().trim();
    const genreText = node.find('.genre').first().text().trim();
    const rawQuality = node.find('.quality').first().text().trim();
    const quality = rawQuality && !/^now$/i.test(rawQuality) ? rawQuality : '1080p';

    // .year holds release year on search cards; .release-year holds star rating (e.g. "7.2/10")
    const explicitYear = node.find('.year').first().text().trim();
    const releaseYearText = node.find('.release-year').first().text().replace(/\s+/g, ' ').trim();
    const year = extractYear(explicitYear) || extractYear(rawTitle) || '';
    const ratingMatch = releaseYearText.match(/(\d+(?:\.\d+)?)\s*\/\s*10|10\s*\/\s*(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? (ratingMatch[1] || ratingMatch[2] || '') : '';

    const isMovie =
      defaultType === 'movie' ||
      /افلام|فيلم|movie/i.test(categoryText) ||
      /^(?:مشاهدة\s+)?فيلم\b|\bmovie\b/i.test(rawTitle) ||
      /\/movies\//i.test(url);
    const itemType = isMovie ? 'movie' : 'series';

    const normalized = normalizeCatalogItem(
      {
        title: cleanTitleText(rawTitle),
        originalTitle: rawTitle,
        url,
        poster,
        year,
        quality,
        rating,
        category: genreText || categoryText || 'anime',
        type: itemType,
        source: PROVIDER_META.id
      },
      {
        providerId: PROVIDER_META.id,
        baseUrl,
        defaultType: itemType
      }
    );

    if (normalized) {
      seenUrls.add(url);
      items.push({
        ...normalized,
        href: normalized.url,
        is_series: itemType !== 'movie',
        serverPrefix: PROVIDER_META.code
      });
    }
  });

  return items;
}

async function fetchRistoPage(subPathOrUrl, options = {}) {
  const { fixtureHtml } = options;
  if (typeof fixtureHtml === 'string') {
    const targetUrl = subPathOrUrl.startsWith('http')
      ? subPathOrUrl
      : `${RISTOANIME_CONFIG.baseUrl}${subPathOrUrl.startsWith('/') ? '' : '/'}${subPathOrUrl}`;
    return fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id
    });
  }

  if (subPathOrUrl.startsWith('http://') || subPathOrUrl.startsWith('https://')) {
    return fetchProviderHtml(subPathOrUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      referer: options.referer || RISTOANIME_CONFIG.baseUrl
    });
  }

  const normalizedPath = subPathOrUrl.startsWith('/') ? subPathOrUrl : `/${subPathOrUrl}`;
  let lastErr = null;
  for (const domain of PROVIDER_META.domains) {
    try {
      return await fetchProviderHtml(`${domain}${normalizedPath}`, {
        ...options,
        providerId: PROVIDER_META.id,
        referer: domain
      });
    } catch (err) {
      lastErr = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: `${domain}${normalizedPath}` });
    }
  }
  throw lastErr || new ScraperError(SCRAPER_ERROR_CODES.NETWORK_TIMEOUT, 'Failed to fetch RistoAnime page', {
    providerId: PROVIDER_META.id
  });
}

function buildCategoryPath(category = 'series', page = 1) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const key = String(category || 'series').trim().toLowerCase();
  const baseSub = RISTOANIME_CONFIG.categories[key] || RISTOANIME_CONFIG.categories.series;
  if (p <= 1) return baseSub;
  if (baseSub === '/series/') return `/series/?offset=${p}`;
  if (baseSub === '/') return `/?page=${p}/`;
  const cleanSub = baseSub.endsWith('/') ? baseSub : `${baseSub}/`;
  return `${cleanSub}page/${p}/`;
}

/**
 * Scrapes RistoAnime Catalog (Series, Movies, Latest, Most Viewed)
 * Supports both `(category, page, options)` and legacy `(page, options)` signatures.
 */
export async function scrapeCatalog(category = 'series', page = 1, options = {}) {
  let resolvedCategory = category;
  let resolvedPage = page;
  let resolvedOptions = options;

  if (typeof category === 'number') {
    resolvedCategory = 'series';
    resolvedPage = category;
    resolvedOptions = typeof page === 'object' && page !== null ? page : {};
  } else if (typeof page === 'object' && page !== null) {
    resolvedPage = 1;
    resolvedOptions = page;
  }

  const subPath = buildCategoryPath(resolvedCategory, resolvedPage);
  const defaultType = /movie|افلام|فيلم/i.test(String(resolvedCategory)) ? 'movie' : 'series';

  try {
    const res = await fetchRistoPage(subPath, resolvedOptions);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `HTTP_${res.status}_ON_CATALOG`,
        { url: res.url }
      );
    }

    const $ = cheerio.load(res.html);
    const items = parseRistoCatalogItems($, res.url || RISTOANIME_CONFIG.baseUrl, defaultType);

    if (items.length === 0) {
      const hasThemeShell = $('.BlocksHolder, .site-inner, .PageMenu, .SinglePost').length > 0;
      const errCode = hasThemeShell ? SCRAPER_ERROR_CODES.EMPTY_RESULT : SCRAPER_ERROR_CODES.STRUCTURE_CHANGED;
      return createEmptyArrayResult(PROVIDER_META.id, errCode, 'No catalog items found on RistoAnime page', {
        url: res.url
      });
    }

    return attachResultMeta(items, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_META.id,
      url: res.url
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: classified.url
    });
  }
}

export const scrapeRistoCatalog = scrapeCatalog;
export const scrapeRistoAnimeCategory = scrapeCatalog;

/**
 * Searches RistoAnime (`/?s={query}` or `/page/{page}/?s={query}`)
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  let resolvedPage = page;
  let resolvedOptions = options;
  if (typeof page === 'object' && page !== null) {
    resolvedPage = 1;
    resolvedOptions = page;
  }

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const p = Math.max(1, parseInt(resolvedPage, 10) || 1);
  const encodedQuery = encodeURIComponent(cleanQuery);
  const searchPath = p > 1 ? `/page/${p}/?s=${encodedQuery}` : `/?s=${encodedQuery}`;

  try {
    const res = await fetchRistoPage(searchPath, resolvedOptions);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `HTTP_${res.status}_ON_SEARCH`,
        { url: res.url }
      );
    }

    const $ = cheerio.load(res.html);
    const items = parseRistoCatalogItems($, res.url || RISTOANIME_CONFIG.baseUrl, 'series');

    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `No search results for "${cleanQuery}"`,
        { url: res.url }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_META.id,
      url: res.url
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: classified.url
    });
  }
}

export const searchRistoAnime = scrapeSearch;
export const scrapeRistoAnimeSearch = scrapeSearch;

function parseRistoEpisodesFromDoc($, baseUrl = RISTOANIME_CONFIG.baseUrl, defaultSeason = 1) {
  const rawEpisodes = [];

  // Primary selector on RistoAnime series, episode, watch, and download pages:
  // .EpisodesArea .EpisodesList a[href]
  $('.EpisodesArea .EpisodesList a[href], .EpisodesList a[href], .episodes-list a[href], .EpsList a[href]').each(
    (idx, el) => {
      const node = $(el);
      const href = node.attr('href') || '';
      const url = resolveSafeUrl(href, baseUrl, { allowHttp: true });
      if (!url) return;

      const emNum = parseInt(node.find('em').first().text().trim(), 10);
      const text = node.text().replace(/\s+/g, ' ').trim();
      const epNumber =
        !Number.isNaN(emNum) && emNum > 0 ? emNum : extractEpisodeNumber(text, url, idx + 1);
      const season = extractSeasonNumber(`${text} ${url}`, defaultSeason);

      rawEpisodes.push({
        number: epNumber,
        season,
        title: text || `الحلقة ${epNumber}`,
        url,
        source: PROVIDER_META.id
      });
    }
  );

  const normalized = normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });

  return normalized.map((ep) => ({
    ...ep,
    episodeNumber: ep.number,
    num: ep.number,
    label: `الحلقة ${ep.number}`,
    episode_id: `ristoanime:ep:${Buffer.from(ep.url).toString('base64url')}`
  }));
}

function parseRistoDetailsFromDoc($, pageUrl = RISTOANIME_CONFIG.baseUrl) {
  const rawTitle =
    $('h1.PostTitle a').first().text().trim() ||
    $('h1.PostTitle').first().text().trim() ||
    $('h1.PostTitleWatch a').first().text().trim() ||
    $('h1.PostTitleWatch').first().text().trim() ||
    $('h1[itemprop="name"]').first().text().trim() ||
    $('meta[itemprop="name"]').attr('content')?.trim() ||
    $('title').first().text().replace(/\s*[-|–]\s*ريستو.*$/i, '').trim();

  const poster =
    resolveSafeUrl(
      $('.SinglePost .Poster .InnerPoster img').first().attr('src') ||
        $('.SinglePost .Poster img').first().attr('src') ||
        $('img[itemprop="image"]').first().attr('src') ||
        $('link[itemprop="thumbnailUrl"]').first().attr('href') ||
        '',
      pageUrl,
      { allowHttp: true }
    ) || extractBgImageUrl($('section.singleCover .BG').first().attr('style'), pageUrl);

  const overview =
    $('.StoryArea p').first().text().replace(/\s+/g, ' ').trim() ||
    $('[itemprop="description"]').first().text().replace(/\s+/g, ' ').trim() ||
    $('meta[itemprop="description"]').attr('content')?.trim() ||
    '';

  const genres = [];
  let year = '';
  let quality = '1080p';
  let categoryLabel = '';

  $('.TaxContent li').each((_, li) => {
    const item = $(li);
    const label = item.find('span').first().text().trim();
    const links = item
      .find('a')
      .map((__, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    if (/النوع|التصنيف/i.test(label)) {
      if (/التصنيف/i.test(label) && links[0]) categoryLabel = links[0];
      if (/النوع/i.test(label)) genres.push(...links);
    } else if (/تاريخ الاصدار|السنة|عرض من/i.test(label)) {
      year = extractYear(links.join(' ') || item.text()) || year;
    } else if (/الجودة/i.test(label) && links[0]) {
      quality = links[0];
    }
  });

  if (!year) {
    year =
      extractYear($('a[href*="/release-year/"]').first().text()) ||
      extractYear($('[itemprop="datePublished"]').text()) ||
      extractYear(rawTitle) ||
      '';
  }

  const rawImdb = $('.imdbRBox span').first().text().replace(/\s+/g, ' ').trim();
  const ratingMatch = rawImdb.match(/(\d+(?:\.\d+)?)\s*\/\s*10|10\s*\/\s*(\d+(?:\.\d+)?)/);
  const rating =
    (ratingMatch ? ratingMatch[1] || ratingMatch[2] : '') ||
    $('[itemprop="ratingValue"]').first().text().trim() ||
    '';

  const defaultSeason = extractSeasonNumber(`${rawTitle} ${pageUrl}`, 1);
  const episodes = parseRistoEpisodesFromDoc($, pageUrl, defaultSeason);

  const isMovie =
    (episodes.length === 0 && /افلام|فيلم|movie/i.test(`${categoryLabel} ${rawTitle}`)) ||
    /\/movies\//i.test(pageUrl);

  const watchBtnHref =
    $('.btnsSingle a.goWatch:not(.Download)').first().attr('href') ||
    $('link[itemprop="embedURL"]').first().attr('href') ||
    '';
  const downloadBtnHref = $('.btnsSingle a.goWatch.Download').first().attr('href') || '';

  const details = normalizeDetailsResult(
    {
      title: cleanTitleText(rawTitle),
      originalTitle: rawTitle,
      poster,
      overview,
      story: overview,
      year,
      type: isMovie ? 'movie' : 'series',
      genres,
      rating,
      quality,
      episodes,
      source: PROVIDER_META.id,
      sourceUrl: pageUrl
    },
    {
      providerId: PROVIDER_META.id,
      baseUrl: pageUrl
    }
  );

  return {
    ...details,
    status: 'success',
    movie_title: details.title,
    watchUrl: resolveSafeUrl(watchBtnHref, pageUrl, { allowHttp: true }),
    downloadUrl: resolveSafeUrl(downloadBtnHref, pageUrl, { allowHttp: true })
  };
}

/**
 * Scrapes RistoAnime Anime or Episode Details page
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid RistoAnime details URL or ref', {
      providerId: PROVIDER_META.id,
      url: String(urlOrRef || '')
    });
  }

  try {
    const res = await fetchRistoPage(targetUrl, options);
    if (!res.ok || !res.html) {
      return attachResultMeta(
        normalizeDetailsResult({ sourceUrl: targetUrl, source: PROVIDER_META.id }, { providerId: PROVIDER_META.id }),
        {
          ok: false,
          errorCode: SCRAPER_ERROR_CODES.EMPTY_RESULT,
          errorMessage: `HTTP_${res.status}_ON_DETAILS`,
          providerId: PROVIDER_META.id,
          url: res.url
        }
      );
    }

    const $ = cheerio.load(res.html);
    const parsed = parseRistoDetailsFromDoc($, res.url || targetUrl);

    if (!parsed.title) {
      return attachResultMeta(parsed, {
        ok: false,
        errorCode: SCRAPER_ERROR_CODES.STRUCTURE_CHANGED,
        errorMessage: 'Could not extract title from RistoAnime details page',
        providerId: PROVIDER_META.id,
        url: res.url
      });
    }

    return attachResultMeta(parsed, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_META.id,
      url: res.url
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return attachResultMeta(
      normalizeDetailsResult({ sourceUrl: targetUrl, source: PROVIDER_META.id }, { providerId: PROVIDER_META.id }),
      {
        ok: false,
        errorCode: classified.code,
        errorMessage: classified.message,
        providerId: PROVIDER_META.id,
        url: targetUrl
      }
    );
  }
}

export const scrapeRistoAnimeDetails = scrapeDetails;

/**
 * Scrapes Episode list for a RistoAnime series or episode URL
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid URL for scrapeEpisodes');
  }

  try {
    const res = await fetchRistoPage(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        `HTTP_${res.status}_ON_EPISODES`,
        { url: res.url }
      );
    }

    const $ = cheerio.load(res.html);
    const titleText =
      $('h1.PostTitle, h1.PostTitleWatch').first().text().trim() || '';
    const defaultSeason = extractSeasonNumber(`${titleText} ${res.url || targetUrl}`, 1);
    const episodes = parseRistoEpisodesFromDoc($, res.url || targetUrl, defaultSeason);

    if (episodes.length === 0) {
      // Check if this is a movie/single episode page that has a watch button instead of an episodes list
      const watchBtn = $('.btnsSingle a.goWatch:not(.Download)').first().attr('href');
      if (watchBtn) {
        const epNum = extractEpisodeNumber(titleText, res.url || targetUrl, 1) || 1;
        const singleEp = normalizeEpisodeList(
          [
            {
              number: epNum,
              season: defaultSeason,
              title: cleanTitleText(titleText) || `الحلقة ${epNum}`,
              url: res.url || targetUrl,
              source: PROVIDER_META.id
            }
          ],
          { providerId: PROVIDER_META.id, baseUrl: res.url || targetUrl, defaultSeason }
        );
        return attachResultMeta(singleEp, {
          ok: true,
          errorCode: null,
          providerId: PROVIDER_META.id,
          url: res.url
        });
      }

      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No episodes found on RistoAnime page',
        { url: res.url }
      );
    }

    return attachResultMeta(episodes, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_META.id,
      url: res.url
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

export const scrapeRistoAnimeEpisodes = scrapeEpisodes;

function extractServersFromRistoDoc($, pageUrl = RISTOANIME_CONFIG.baseUrl) {
  const rawServers = [];
  const seen = new Set();

  const pushServer = (rawUrl, rawLabel = '', extra = {}) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('javascript:')) return;
    const resolved = resolveSafeUrl(trimmed, pageUrl, { allowHttp: true });
    if (!resolved || seen.has(resolved)) return;
    // Skip self-page links that are not media/embed links
    if (resolved.replace(/\/+$/, '') === pageUrl.replace(/\/+$/, '')) return;

    seen.add(resolved);
    let hostLabel = '';
    try {
      hostLabel = new URL(resolved).hostname.replace(/^www\./i, '');
    } catch (_) {}

    const cleanLabel = String(rawLabel || '')
      .replace(/\s+/g, ' ')
      .trim();
    const name = cleanLabel && hostLabel ? `${cleanLabel} (${hostLabel})` : cleanLabel || hostLabel || 'RistoAnime Server';

    rawServers.push({
      url: resolved,
      name,
      label: cleanLabel || hostLabel || 'Server',
      quality: extra.quality || '1080p',
      source: PROVIDER_META.id,
      headers: {
        Referer: pageUrl
      },
      ...extra
    });
  };

  // 1. Live RistoAnime Watch Page selector: #WatchList ul#watch li[data-watch], .ServersList li[data-watch], [data-watch]
  $('#WatchList ul#watch li[data-watch], .ServersList li[data-watch], [data-watch]').each((_, el) => {
    const node = $(el);
    const watchUrl = node.attr('data-watch') || '';
    const clone = node.clone();
    clone.find('span, noscript, iframe').remove();
    const label = clone.text().trim();
    pushServer(watchUrl, label);
  });

  // 2. Active iframe inside .WatchIframe iframe[src]
  $('.WatchIframe iframe[src], iframe[src]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src) pushServer(src, 'سيرفر المشاهدة');
  });

  // 3. Download servers on /download/ page: .ServersList.Download ul li a[href]
  $('.ServersList.Download ul li a[href], .Download ul li a[href]').each((_, el) => {
    const node = $(el);
    const href = node.attr('href') || '';
    const label = node.find('em').text().trim() || node.text().trim() || 'تحميل';
    pushServer(href, label);
  });

  // 4. Legacy / fallback attributes
  $('ul.servers-list li, [data-embed], [data-src]').each((_, el) => {
    const node = $(el);
    const u = node.attr('data-embed') || node.attr('data-src') || '';
    if (u && u.startsWith('http')) {
      pushServer(u, node.text().trim());
    }
  });

  return normalizeServerList(rawServers, {
    providerId: PROVIDER_META.id,
    providerName: PROVIDER_META.name,
    codePrefix: PROVIDER_META.code,
    baseUrl: pageUrl
  });
}

function buildWatchUrlFromEpisodeUrl(pageUrl = '', $ = null) {
  if ($) {
    const goWatchHref = $('.btnsSingle a.goWatch:not(.Download)').first().attr('href') || '';
    const resolvedBtn = resolveSafeUrl(goWatchHref, pageUrl, { allowHttp: true });
    if (resolvedBtn) {
      return resolvedBtn.endsWith('/') ? resolvedBtn : `${resolvedBtn}/`;
    }
  }
  if (!pageUrl) return '';
  const clean = pageUrl.split('?')[0].replace(/\/+$/, '');
  if (clean.endsWith('/watch') || clean.endsWith('/download')) return `${clean}/`;
  return `${clean}/watch/`;
}

/**
 * Scrapes Watch/Download servers from a RistoAnime episode, movie, or /watch/ URL.
 * Automatically follows the `.btnsSingle a.goWatch` (`/watch/`) subpage when given an episode/movie details URL.
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = decodeProviderRef(urlOrRef);
  if (!targetUrl) {
    return createEmptyArrayResult(
      PROVIDER_META.id,
      SCRAPER_ERROR_CODES.UNSAFE_URL,
      'Invalid URL for scrapeServers'
    );
  }

  try {
    const res = await fetchRistoPage(targetUrl, options);
    if (!res.ok || !res.html) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        `HTTP_${res.status}_ON_SERVERS`,
        { url: res.url }
      );
    }

    let $ = cheerio.load(res.html);
    let currentUrl = res.url || targetUrl;
    let servers = extractServersFromRistoDoc($, currentUrl);

    // If caller passed an episode/movie details page (or series page), follow the /watch/ link!
    if (servers.length === 0) {
      if (typeof options.watchFixtureHtml === 'string') {
        const $watch = cheerio.load(options.watchFixtureHtml);
        servers = extractServersFromRistoDoc($watch, buildWatchUrlFromEpisodeUrl(currentUrl, $));
      } else if (typeof options.fixtureHtml !== 'string') {
        // Check if this is a series page (has episodes list, no .goWatch button)
        let episodeUrlToWatch = currentUrl;
        const hasGoWatch = $('.btnsSingle a.goWatch').length > 0;
        if (!hasGoWatch && /\/series\//i.test(currentUrl)) {
          const firstEpHref = $('.EpisodesArea .EpisodesList a[href], .EpisodesList a[href]').first().attr('href');
          const resolvedFirstEp = resolveSafeUrl(firstEpHref, currentUrl, { allowHttp: true });
          if (resolvedFirstEp) episodeUrlToWatch = resolvedFirstEp;
        }

        const watchUrl = buildWatchUrlFromEpisodeUrl(episodeUrlToWatch, hasGoWatch ? $ : null);
        if (watchUrl && watchUrl !== currentUrl) {
          const watchRes = await fetchRistoPage(watchUrl, {
            ...options,
            referer: currentUrl
          });
          if (watchRes.ok && watchRes.html) {
            $ = cheerio.load(watchRes.html);
            currentUrl = watchRes.url || watchUrl;
            servers = extractServersFromRistoDoc($, currentUrl);
          }
        }
      }
    }

    if (servers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
        'No watch servers found on RistoAnime page',
        { url: currentUrl }
      );
    }

    return attachResultMeta(servers, {
      ok: true,
      errorCode: null,
      providerId: PROVIDER_META.id,
      url: currentUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

export const extractRistoAnimeServers = scrapeServers;

function isGenuineDirectStreamUrl(url = '') {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const parsed = new URL(url);
    const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|svg|js|css|vtt|srt|html|htm)(\?|$)/i.test( parsed.pathname )) {
      return false;
    }
    return (
      pathAndQuery.includes('.m3u8') ||
      pathAndQuery.includes('.mp4') ||
      pathAndQuery.includes('/hls/') ||
      pathAndQuery.includes('/hls2/') ||
      pathAndQuery.includes('master.txt')
    );
  } catch {
    return false;
  }
}

/**
 * Resolves a RistoAnime watch/episode URL or an extracted embed server URL into playable stream(s).
 */
export async function resolveStream(urlOrRef, options = {}) {
  const rawInput = typeof urlOrRef === 'object' && urlOrRef !== null ? urlOrRef.url || urlOrRef.ref : urlOrRef;
  const targetUrl = decodeProviderRef(rawInput);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid URL passed to resolveStream', {
      providerId: PROVIDER_META.id,
      url: String(rawInput || '')
    });
  }

  // 1. If already a direct .m3u8 or .mp4 stream URL
  if (isGenuineDirectStreamUrl(targetUrl)) {
    const streamType = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls') ? 'm3u8' : 'mp4';
    return attachResultMeta(
      {
        ok: true,
        url: targetUrl,
        streamUrl: targetUrl,
        streamType,
        type: streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : '1080p',
        source: PROVIDER_META.id,
        headers: {
          Referer: options.referer || RISTOANIME_CONFIG.baseUrl
        },
        streams: [
          {
            url: targetUrl,
            streamType,
            quality: streamType === 'm3u8' ? 'AUTO-HLS' : '1080p'
          }
        ]
      },
      { ok: true, errorCode: null, providerId: PROVIDER_META.id, url: targetUrl }
    );
  }

  // 2. If offline fixtureHtml contains raw streams
  if (typeof options.fixtureHtml === 'string') {
    const rawFromFixture = extractRawStreamsFromText(options.fixtureHtml, targetUrl).filter((s) =>
      isGenuineDirectStreamUrl(s.url)
    );
    if (rawFromFixture.length > 0) {
      const primary = rawFromFixture[0];
      return attachResultMeta(
        {
          ok: true,
          url: primary.url,
          streamUrl: primary.url,
          streamType: primary.streamType,
          type: primary.streamType,
          quality: primary.quality || 'AUTO-HLS',
          source: PROVIDER_META.id,
          headers: primary.headers || {},
          streams: rawFromFixture
        },
        { ok: true, errorCode: null, providerId: PROVIDER_META.id, url: targetUrl }
      );
    }
  }

  // 3. If it's a RistoAnime page URL, first extract its watch servers, then unwrap them
  const isRistoDomain = /ristoanime\.(me|com)/i.test(targetUrl);
  let candidateEmbeds = [];
  if (isRistoDomain) {
    const servers = await scrapeServers(targetUrl, options);
    candidateEmbeds = servers.map((s) => s.url).filter(Boolean);
  } else {
    candidateEmbeds = [targetUrl];
  }

  const resolvedDirect = [];
  for (const embedUrl of candidateEmbeds.slice(0, 6)) {
    if (typeof options.fixtureHtml === 'string') break;
    try {
      const unwrapped = await unwrapEmbedToDirectStreams(embedUrl, options.referer || RISTOANIME_CONFIG.baseUrl);
      for (const s of unwrapped) {
        if (s?.url && isGenuineDirectStreamUrl(s.url)) {
          resolvedDirect.push(s);
        }
      }
      if (resolvedDirect.length > 0 && !options.resolveAll) break;
    } catch (_) {}
  }

  if (resolvedDirect.length > 0) {
    const primary = resolvedDirect[0];
    return attachResultMeta(
      {
        ok: true,
        url: primary.url,
        streamUrl: primary.url,
        streamType: primary.streamType || 'm3u8',
        type: primary.streamType || 'm3u8',
        quality: primary.quality || 'AUTO-HLS',
        verified: true,
        source: PROVIDER_META.id,
        headers: primary.headers || {},
        streams: resolvedDirect
      },
      { ok: true, errorCode: null, providerId: PROVIDER_META.id, url: targetUrl }
    );
  }

  // 4. Fallback: if embed URLs were found on the watch page, return the primary embed descriptor
  if (candidateEmbeds.length > 0) {
    const primaryEmbed = candidateEmbeds[0];
    return attachResultMeta(
      {
        ok: true,
        url: primaryEmbed,
        streamUrl: primaryEmbed,
        embedUrl: primaryEmbed,
        streamType: 'embed',
        type: 'embed',
        quality: '1080p',
        verified: false,
        source: PROVIDER_META.id,
        headers: { Referer: RISTOANIME_CONFIG.baseUrl },
        streams: candidateEmbeds.map((u) => ({ url: u, streamType: 'embed', quality: '1080p' }))
      },
      { ok: true, errorCode: null, providerId: PROVIDER_META.id, url: targetUrl }
    );
  }

  return attachResultMeta(
    {
      ok: false,
      url: '',
      streamUrl: '',
      streamType: null,
      source: PROVIDER_META.id,
      streams: []
    },
    {
      ok: false,
      errorCode: SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,
      errorMessage: 'Failed to resolve stream from RistoAnime URL',
      providerId: PROVIDER_META.id,
      url: targetUrl
    }
  );
}

/**
 * Backward-compatible combined streams + episodes extractor used by `server/scrapers/index.mjs`.
 */
export async function extractRistoAnimeStreams(targetUrl, options = {}) {
  const resolvedUrl = decodeProviderRef(targetUrl);
  if (!resolvedUrl) {
    return { episodes: [], servers: [], source: PROVIDER_META.id };
  }

  const details = await scrapeDetails(resolvedUrl, options);
  const watchServers = await scrapeServers(resolvedUrl, options);

  const directServers = [];
  if (typeof options.fixtureHtml !== 'string' && options.unwrap !== false) {
    const unwrappedGroups = await Promise.all(
      watchServers.slice(0, 6).map((srv) =>
        unwrapEmbedToDirectStreams(srv.url, resolvedUrl).catch(() => [])
      )
    );
    for (const grp of unwrappedGroups) {
      for (const s of grp) {
        if (s?.url && isGenuineDirectStreamUrl(s.url)) {
          directServers.push({
            provider: PROVIDER_META.id,
            source: PROVIDER_META.id,
            code: `${PROVIDER_META.code}-${directServers.length + 1}`,
            serverCode: `${PROVIDER_META.code}-${directServers.length + 1}`,
            name: `RistoAnime Direct #${directServers.length + 1}`,
            label: `RE-${directServers.length + 1}`,
            url: s.url,
            streamType: s.streamType || 'm3u8',
            type: s.streamType || 'm3u8',
            quality: s.quality || 'AUTO-HLS',
            headers: s.headers || {}
          });
        }
      }
    }
  }

  const combinedServers =
    directServers.length > 0
      ? [
          ...directServers,
          ...watchServers.map((srv, idx) => ({
            ...srv,
            provider: PROVIDER_META.id,
            code: `${PROVIDER_META.code}-${directServers.length + idx + 1}`,
            serverCode: `${PROVIDER_META.code}-${directServers.length + idx + 1}`
          }))
        ]
      : watchServers.map((srv, idx) => ({
          ...srv,
          provider: PROVIDER_META.id,
          code: srv.code || `${PROVIDER_META.code}-${idx + 1}`
        }));

  return attachResultMeta(
    {
      ...details,
      source: PROVIDER_META.id,
      episodes: details.episodes || [],
      servers: combinedServers
    },
    {
      ok: combinedServers.length > 0 || (details.episodes && details.episodes.length > 0),
      errorCode:
        combinedServers.length === 0 && (!details.episodes || details.episodes.length === 0)
          ? SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED
          : null,
      providerId: PROVIDER_META.id,
      url: resolvedUrl
    }
  );
}

export default {
  PROVIDER_META,
  RISTOANIME_CONFIG,
  scrapeCatalog,
  scrapeRistoCatalog,
  scrapeRistoAnimeCategory,
  scrapeSearch,
  searchRistoAnime,
  scrapeRistoAnimeSearch,
  scrapeDetails,
  scrapeRistoAnimeDetails,
  scrapeEpisodes,
  scrapeRistoAnimeEpisodes,
  scrapeServers,
  extractRistoAnimeServers,
  extractRistoAnimeStreams,
  resolveStream
};
