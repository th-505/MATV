// server/scrapers/sites/3cktv.mjs
// Standalone provider module for 3ckTV (3cktv, code: 3V)
// Independent Turkish drama provider, fully isolated from 3isk
import * as cheerio from 'cheerio';
import {effectiveProviderDomains} from '../shared/provider-config.mjs';
import {BROWSER_USER_AGENTS} from '../anti-ban.mjs';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl,
  assertSafeScraperUrl
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
  normalizeDigits
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
  unpackDeanEdwards
} from '../stream-unwrapper.mjs';

export const PROVIDER_META = Object.freeze({
  id: '3cktv',
  name: '3ckTV',
  code: '3V',
  domains: ['https://e.3cktv.cam', 'https://e.3cktv.com', 'https://3cktv.com', 'https://ei.3cktv.com'],
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
    pagination: '/page/{page}/?s={query}'
  },
  notImplemented: {}
});

export const THREE_CKTV_CONFIG = Object.freeze({
  key: '3cktv',
  id: '3cktv',
  name: '3ckTV',
  code: '3V',
  baseUrl: 'https://e.3cktv.cam',
  fallbackBaseUrl: 'https://3cktv.com',
  domains: ['https://e.3cktv.cam', 'https://e.3cktv.com', 'https://3cktv.com', 'https://ei.3cktv.com'],
  categories: {
    turkish_latest: '/episodes/',
    turkish_subbed: '/category/مسلسلات-تركية-مترجمة/',
    turkish_dubbed: '/category/مسلسلات-تركية-مدبلجة/',
    turkish_movies: '/category/أفلام-تركية/',
    movies: '/category/أفلام-تركية/',
    series: '/category/مسلسلات-تركية-مترجمة/',
    latest: '/episodes/',
    all: '/episodes/',
    dubbed: '/category/مسلسلات-تركية-مدبلجة/'
  }
});

// Keep the shared HTTP client profile; a separate obsolete desktop profile
// currently redirects this site's desktop view to a DNS-broken host.
const DEFAULT_UA = BROWSER_USER_AGENTS[0];

/**
 * Encodes a target URL into standard 3ckTV ref format: 3cktv:<base64url>
 */
export function encode3cktvRef(url = '') {
  if (!url || typeof url !== 'string') return '';
  return `3cktv:${Buffer.from(url.trim()).toString('base64url')}`;
}

/**
 * Decodes a 3ckTV reference or URL back to an absolute HTTP URL.
 */
export function decode3cktvRef(refOrUrl = '') {
  if (!refOrUrl || typeof refOrUrl !== 'string') return '';
  const trimmed = refOrUrl.trim();
  if (trimmed.startsWith('3cktv:') || trimmed.startsWith('3ck:')) {
    const rawVal = trimmed.replace(/^(3cktv:|3ck:)/, '');
    if (rawVal.startsWith('http://') || rawVal.startsWith('https://')) {
      return rawVal;
    }
    try {
      const decoded = Buffer.from(rawVal, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded;
      }
      return `${THREE_CKTV_CONFIG.baseUrl}${decoded.startsWith('/') ? '' : '/'}${decoded}`;
    } catch {
      return rawVal;
    }
  }
  return trimmed;
}

/**
 * Safely resolves a 3ckTV target URL from a ref or URL input, preventing SSRF.
 */
export function resolve3cktvTargetUrl(refOrUrl = '', baseUrl = THREE_CKTV_CONFIG.baseUrl) {
  const decoded = decode3cktvRef(refOrUrl);
  if (!decoded) return '';
  if (decoded.startsWith('/')) {
    return resolveSafeUrl(decoded, baseUrl);
  }
  try {
    return resolveSafeUrl(decoded, baseUrl);
  } catch {
    return '';
  }
}

/**
 * Cleans titles scraped from 3ckTV, removing generic branding and normalizing digits.
 */
function clean3cktvTitle(rawTitle = '') {
  return normalizeDigits(String(rawTitle || ''))
    .replace(/قصة عشق|قصص عشق|موقع قصة عشق|3cktv/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts catalog and search result cards from 3ckTV HTML.
 */
export function extractCatalogItemsFromHtml(html = '', baseUrl = THREE_CKTV_CONFIG.baseUrl, defaultType = 'series') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [],seen=new Set();

  $('article.post, .block-post, .BlockItem, .item-box, .post-item').each((_, el) => {
    const node = $(el);
    const a = node.find('a').first();
    const rawHref = a.attr('href') || node.attr('data-url') || '';
    const href = resolveSafeUrl(rawHref, baseUrl, {allowHttp:false,allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains)});
    if (!href || seen.has(href)) return;

    const rawTitle =
      node.find('.title, h2, h3').first().text().trim() ||
      a.attr('title') ||
      node.find('img').first().attr('alt') ||
      '';
    const title = clean3cktvTitle(rawTitle);
    if (!title) return;

    const bgStyle = node.find('.imgBg, .poster').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const rawPoster =
      (bgMatch ? bgMatch[1] : '') ||
      node.find('img').attr('data-src') ||
      node.find('img').attr('data-img') ||
      node.find('img').attr('src') ||
      '';
    const poster = resolveSafeUrl(rawPoster, baseUrl);

    const year =
      node.find('.year').first().text().trim() ||
      extractYear(title) ||
      '';

    const isMovie = /فيلم|movie|film/i.test(`${title} ${href}`) || defaultType === 'movie';
    const type = isMovie ? 'movie' : 'series';
    const ref = encode3cktvRef(href);

    const normalized = normalizeCatalogItem(
      {
        id: ref,
        ref,
        title,
        url: href,
        sourceUrl: href,
        poster,
        image: poster,
        year,
        type,
        category: 'turkish',
        source: PROVIDER_META.id
      },
      { providerId: PROVIDER_META.id, baseUrl, defaultType: type }
    );

    if (normalized) {
      seen.add(href);
      normalized.serverPrefix = PROVIDER_META.code;
      normalized.is_series = type !== 'movie';
      items.push(normalized);
    }
  });

  return items;
}

/**
 * Extracts episodes list from series or watch page HTML, sorted ascending and deduplicated.
 */
export function extractEpisodesFromHtml(html = '', baseUrl = THREE_CKTV_CONFIG.baseUrl, defaultSeason = 1) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const rawEpisodes = [];

  $('.episodesList a, ul.listEpisodes a, .episodes-list a, .list-episodes a, .watch-container .episodesList a, ul.eplist a.epNum').each(
    (idx, el) => {
      const node = $(el);
      const rawHref = node.attr('href') || '';
      const href = resolveSafeUrl(rawHref, baseUrl, {allowHttp:false,allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains)});
      if (!href) return;

      const rawText = node.attr('title') || node.text().trim() || '';
      const title = normalizeDigits(rawText).replace(/\s+/g, ' ').trim();
      const epNum = extractEpisodeNumber(title, href);
      if(!epNum)return;
      const season = extractSeasonNumber(`${title} ${href}`, defaultSeason);

      rawEpisodes.push({
        number: epNum,
        season,
        title,
        name: title,
        url: href,
        link: href,
        sourceUrl: href,
        ref: encode3cktvRef(href),
        source: PROVIDER_META.id
      });
    }
  );

  return normalizeEpisodeList(rawEpisodes, {
    providerId: PROVIDER_META.id,
    baseUrl,
    defaultSeason
  });
}

/**
 * Extracts video servers from 3ckTV watch page HTML.
 */
export async function extractServersFromHtml(html = '', pageUrl = THREE_CKTV_CONFIG.baseUrl, options = {}) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const candidateUrls = [];
  const seenUrls = new Set();

  function unwrapCandidateUrl(raw = '') {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (/^[A-Za-z0-9+/=_-]{16,}$/.test(trimmed)) {
      try {
        const normalizedB64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalizedB64, 'base64').toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      } catch {}
    }
    return unwrapBase64BridgeUrl(trimmed);
  }

  function addCandidate(rawUrl, name = '') {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const unwrapped = unwrapCandidateUrl(rawUrl);
    const safeUrl = resolveSafeUrl(unwrapped, pageUrl,{allowHttp:false});
    if (!safeUrl || seenUrls.has(safeUrl)) return;
    seenUrls.add(safeUrl);
    candidateUrls.push({ url: safeUrl, name: name || 'سيرفر مشاهدة' });
  }

  // 1. Check data-url / data-watch on serversList items
  $('ul.serversList li, .watchServers li, [data-url], [data-watch]').each((idx, el) => {
    const raw = $(el).attr('data-url') || $(el).attr('data-watch') || '';
    const name = $(el).attr('data-name') || $(el).text().trim() || `سيرفر ${idx + 1}`;
    if (raw) addCandidate(raw, name);
  });

  // 2. Check iframe players
  $('iframe[src]').each((idx, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.includes('facebook') && !src.includes('twitter')) {
      addCandidate(src, `مشغل مدمج ${idx + 1}`);
    }
  });

  // 3. Check for Dean Edwards packed JS or direct video sources
  const unpackedScript = unpackDeanEdwards(html);
  const combinedText = `${html}\n${unpackedScript}`;
  const mediaMatches = combinedText.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/gi) || [];
  for (const m of mediaMatches) {
    addCandidate(m, 'رابط مباشر');
  }

  const rawServers = [];

  // Deep unwrapping for candidates in live or fixture mode if unwrapper provided
  for (const cand of candidateUrls) {
    const isDirectMedia = /\.(?:m3u8|mp4)$/i.test(new URL(cand.url).pathname);
    if (isDirectMedia) {
      const streamType = cand.url.includes('.m3u8') ? 'm3u8' : 'mp4';
      rawServers.push({
        name: cand.name,
        label: cand.name,
        url: cand.url,
        type: streamType,
        streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : null,
        headers: { Referer: pageUrl, 'User-Agent': DEFAULT_UA },
        verified: options.verified === true
      });
    } else {
      // Embed player
      rawServers.push({
        name: cand.name,
        label: cand.name,
        url: cand.url,
        type: 'embed',
        streamType: 'embed',
        quality: null,
        headers: { Referer: pageUrl, 'User-Agent': DEFAULT_UA },
        verified: false
      });
    }
  }

  // Unwrap only player URLs observed on this watch page, within a fixed work
  // budget. Fixtures never make a network request unless an injected seam is used.
  if(!options.fixtureHtml || typeof options.unwrapEmbed==='function'){
    const unwrap=options.unwrapEmbed||unwrapEmbedToDirectStreams;
    for(const candidate of candidateUrls.filter(c=>!/\.(?:mp4|m3u8)$/i.test(new URL(c.url).pathname)).slice(0,4)){
      try{for(const source of await unwrap(candidate.url,pageUrl)||[]){
        const url=resolveSafeUrl(source.url||'',pageUrl,{allowHttp:false});
        if(!url||!/\.(?:mp4|m3u8)$/i.test(new URL(url).pathname))continue;
        rawServers.push({...source,url,name:candidate.name,label:candidate.name,type:/\.m3u8$/i.test(new URL(url).pathname)?'m3u8':'mp4',verified:false});
      }}catch{/* The observed embed remains explicitly unverified. */}
    }
  }

  return normalizeServerList(rawServers, {
    providerId: PROVIDER_META.id,
    providerName: PROVIDER_META.name,
    codePrefix: PROVIDER_META.code,
    baseUrl: pageUrl
  }).map((srv, idx) => ({
    ...srv,
    provider: PROVIDER_META.id,
    code: `${PROVIDER_META.code}-${idx + 1}`,
    serverCode: `${PROVIDER_META.code}-${idx + 1}`,
    verified: Boolean(rawServers[idx]?.verified)
  }));
}

/**
 * Scrapes catalog items for a given 3ckTV category and page.
 */
function observedPagination(html,url,page){
 const $=cheerio.load(html),candidates=[];
 $('.pagination a[href],a.page-numbers[href],a[rel="next"][href]').each((_,el)=>{const next=resolveSafeUrl($(el).attr('href'),url,{allowHttp:false,allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains)});if(!next)return;const u=new URL(next);const number=Number(u.pathname.match(/\/page\/(\d+)/)?.[1]||u.searchParams.get('page')||u.searchParams.get('paged'));if(Number.isSafeInteger(number)&&number>page)candidates.push({number,url:next});});
 const next=candidates.sort((a,b)=>a.number-b.number)[0];return next?{next_page:next.number,next_url:next.url}:{next_page:null,next_url:null};
}

export async function scrapeCatalog(category = 'turkish_latest', page = 1, options = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const subPath =
    THREE_CKTV_CONFIG.categories[category] ||
    (typeof category === 'string' && category.startsWith('/') ? category : THREE_CKTV_CONFIG.categories.turkish_latest);
  const cleanSubPath = subPath.endsWith('/') ? subPath : `${subPath}/`;
  const targetUrl =
    pageNum > 1
      ? `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(cleanSubPath)}page/${pageNum}/`
      : `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(cleanSubPath)}`;

  const defaultType = /movie|أفلام/i.test(`${category} ${cleanSubPath}`) ? 'movie' : 'series';

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      allowHttp:false,
      allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains),
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA,...(options.headers||{}) }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, res.url || targetUrl, defaultType);
    if (items.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No catalog items found on 3ckTV page',
        { url: res.url || targetUrl }
      );
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl,
      ...observedPagination(res.html,res.url||targetUrl,pageNum)
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Searches 3ckTV for Turkish drama series or movies.
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Empty search query');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const encoded = encodeURIComponent(q);
  const targetUrl =
    pageNum > 1
      ? `${THREE_CKTV_CONFIG.baseUrl}/page/${pageNum}/?s=${encoded}`
      : `${THREE_CKTV_CONFIG.baseUrl}/?s=${encoded}`;

  try {
    const res = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      allowHttp:false,
      allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains),
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA,...(options.headers||{}) }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: targetUrl
      });
    }

    const items = extractCatalogItemsFromHtml(res.html, res.url || targetUrl, 'series');
    return attachResultMeta(items, {
      ok: true,
      errorCode: items.length === 0 ? SCRAPER_ERROR_CODES.EMPTY_RESULT : null,
      errorMessage: items.length === 0 ? 'No search results found' : null,
      providerId: PROVIDER_META.id,
      url: res.url || targetUrl,
      ...observedPagination(res.html,res.url||targetUrl,pageNum)
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_META.id, classified.code, classified.message, {
      url: targetUrl
    });
  }
}

/**
 * Scrapes metadata, synopsis, and episode list for a series or movie.
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid or missing URL for 3ckTV details', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      allowHttp:false,
      allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains),
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA,...(options.headers||{}) }
    });

    if (!res.ok || !res.html) {
      throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `Failed to fetch 3ckTV details HTTP_${res.status}`, {
        providerId: PROVIDER_META.id,
        url: cleanUrl,
        status: res.status
      });
    }

    const $ = cheerio.load(res.html);
    const rawTitle =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('.title').first().text().trim() ||
      '';
    const title = clean3cktvTitle(rawTitle);
    const own=$('h1').first().closest('.single_main_content,.single_info,article,.details');
    const context=own.length?own:$('h1').first().parent();
    const cast=[...new Set(context.find('a[href*="/actor/"]').toArray().map(e=>$(e).text().trim()).filter(Boolean))];
    const observedLanguage=context.find('.single_item.language span,.language span').last().text().trim();
    const releaseYear=context.find('.year,.release-year').filter((_,e)=>!$(e).closest('aside,.sidebar,.related,.related-posts').length).first().text().trim();

    const rawPoster =
      $('meta[property="og:image"]').attr('content') ||
      $('.poster-box img, .poster img, .imgBg img').first().attr('src') ||
      '';
    const poster = resolveSafeUrl(rawPoster, THREE_CKTV_CONFIG.baseUrl);

    const overview =
      context.find('.story p, .story, .overview, .description').first().text().trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';

    const genres = [];
    context.find('.genres a, a[href*="/genre/"], a[href*="/category/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const defaultSeason = extractSeasonNumber(title, 1);
    const episodes = extractEpisodesFromHtml(res.html, res.url || cleanUrl, defaultSeason);
    const isMovie = /فيلم|movie|film/i.test(`${title} ${cleanUrl}`) && episodes.length === 0;

    const ref = encode3cktvRef(cleanUrl);

    const normalized = normalizeDetailsResult(
      {
        id: ref,
        ref,
        title,
        poster,
        overview,
        story: overview,
        year: extractYear(releaseYear) || extractYear(title),
        quality: null,
        genres,
        episodes,
        type: isMovie ? 'movie' : 'series',
        source: PROVIDER_META.id,
        sourceUrl: cleanUrl
      },
      { providerId: PROVIDER_META.id, baseUrl: res.url || cleanUrl }
    );
    normalized.cast=cast.map(name=>({name}));
    normalized.observed_cast=cast;
    normalized.observed_language=observedLanguage;

    return attachResultMeta(normalized, {
      ok: Boolean(title),
      providerId: PROVIDER_META.id,
      url: res.url || cleanUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: cleanUrl });
  }
}

/**
 * Scrapes all episodes for a given series URL or reference.
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3ckTV URL');
  }

  try {
    const res = await fetchProviderHtml(cleanUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      allowHttp:false,
      allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains),
      timeoutMs: options.timeoutMs || 10000,
      headers: { 'User-Agent': DEFAULT_UA,...(options.headers||{}) }
    });

    if (!res.ok || !res.html) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, `HTTP_${res.status}`, {
        url: cleanUrl
      });
    }

    const $ = cheerio.load(res.html);
    const title = $('h1').first().text().trim();
    const defaultSeason = extractSeasonNumber(title, 1);
    const episodes = extractEpisodesFromHtml(res.html, res.url || cleanUrl, defaultSeason);

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

/**
 * Scrapes video servers from a 3ckTV watch page.
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid 3ckTV watch URL');
  const pageOptions={...options,providerId:PROVIDER_META.id,allowHttp:false,allowedHosts:effectiveProviderDomains(PROVIDER_META.id,PROVIDER_META.domains),timeoutMs:options.timeoutMs||10000,headers:{'User-Agent':DEFAULT_UA,...(options.headers||{})}};
  try{
    let response=await fetchProviderHtml(cleanUrl,pageOptions),watchUrl=response.url||cleanUrl;
    if(!response.ok||!response.html)return createEmptyArrayResult(PROVIDER_META.id,SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,'Source episode page unavailable',{url:watchUrl});
    let servers=await extractServersFromHtml(response.html,watchUrl,options);
    if(!servers.length){
      const $=cheerio.load(response.html),path=new URL(watchUrl).pathname.replace(/\/+$/,'');let observedWatch=null;
      $('a[href]').each((_,el)=>{
        if(observedWatch||!/مشاهدة|شاهد|watch/i.test($(el).text().trim()))return;
        const target=resolveSafeUrl($(el).attr('href'),watchUrl,{allowHttp:false,allowedHosts:pageOptions.allowedHosts});
        if(target&&target!==watchUrl&&new URL(target).pathname.replace(/\/+$/,'')===path)observedWatch=target;
      });
      if(observedWatch){response=await fetchProviderHtml(observedWatch,pageOptions);watchUrl=response.url||observedWatch;if(response.ok&&response.html)servers=await extractServersFromHtml(response.html,watchUrl,options);}
    }
    return attachResultMeta(servers,{ok:servers.length>0,errorCode:servers.length?null:SCRAPER_ERROR_CODES.SERVER_EXTRACTION_FAILED,errorMessage:servers.length?null:'No observed direct media or player available',providerId:PROVIDER_META.id,url:watchUrl});
  }catch(err){const classified=classifyNetworkError(err,{providerId:PROVIDER_META.id,url:cleanUrl});return createEmptyArrayResult(PROVIDER_META.id,classified.code,classified.message,{url:cleanUrl});}
}

/**
 * Resolves an embed or media URL into a playable stream object.
 */
export async function resolveStream(urlOrRef, options = {}) {
  const cleanUrl = resolve3cktvTargetUrl(urlOrRef, THREE_CKTV_CONFIG.baseUrl);
  if (!cleanUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'Invalid stream URL for 3ckTV', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  const isDirect = cleanUrl.includes('.m3u8') || cleanUrl.includes('.mp4');
  if (isDirect) {
    const streamType = cleanUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
    return {
      ok: true,
      providerId: PROVIDER_META.id,
      url: cleanUrl,
      type: streamType,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      headers: options.headers || { Referer: `${THREE_CKTV_CONFIG.baseUrl}/`, 'User-Agent': DEFAULT_UA },
      verified: options.verified === true
    };
  }

  // Handle embed fixture HTML or player script
  if (typeof options.fixtureHtml === 'string' && /eval\(function\(p,a,c,k,e,d\)/.test(options.fixtureHtml)) {
    const unpacked = unpackDeanEdwards(options.fixtureHtml);
    const m = unpacked.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i);
    if (m) {
      const streamUrl = m[0];
      const streamType = streamUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: streamUrl,
        type: streamType,
        streamType,
        quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
        headers: { Referer: cleanUrl, 'User-Agent': DEFAULT_UA },
        verified: true
      };
    }
  }

  // Live unwrapping
  try {
    const unwrappedStreams = await unwrapEmbedToDirectStreams(cleanUrl, `${THREE_CKTV_CONFIG.baseUrl}/`);
    if (Array.isArray(unwrappedStreams) && unwrappedStreams.length > 0) {
      const best = unwrappedStreams[0];
      return {
        ok: true,
        providerId: PROVIDER_META.id,
        url: best.url,
        type: best.streamType,
        streamType: best.streamType,
        quality: best.quality || '',
        headers: best.headers || { Referer: cleanUrl, 'User-Agent': DEFAULT_UA },
        verified: false
      };
    }
  } catch (_) {}

  // Fallback to embed
  return {
    ok: true,
    providerId: PROVIDER_META.id,
    url: cleanUrl,
    type: 'embed',
    streamType: 'embed',
    quality: null,
    headers: { Referer: `${THREE_CKTV_CONFIG.baseUrl}/`, 'User-Agent': DEFAULT_UA },
    verified: false
  };
}

// =========================================================================
// BACKWARD-COMPATIBLE NAMED EXPORTS (imported by server/scrapers/index.mjs)
// =========================================================================

export async function scrape3cktvCategory(catKey = 'turkish_latest', page = 1, options = {}) {
  return scrapeCatalog(catKey, page, options);
}

export async function extract3cktvStreamsAndEpisodes(targetUrl, options = {}) {
  const [episodes, servers] = await Promise.all([
    scrapeEpisodes(targetUrl, options),
    scrapeServers(targetUrl, options)
  ]);
  return {
    episodes: Array.isArray(episodes) ? episodes : [],
    servers: Array.isArray(servers) ? servers : []
  };
}
