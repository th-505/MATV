// Beta-owned implementation. Edit independently from Najd source parsers.
// Independent Ahwak adapter. Routes/selectors observed on 2026-11-04.
import * as cheerio from 'cheerio';
import { fetchProviderHtml, assertSafeScraperUrl, resolveSafeUrl } from '../../../scrapers/shared/http.mjs';
import { normalizeCatalogItem, normalizeDetailsResult, normalizeEpisodeList, normalizeServerList,
  extractEpisodeNumber, extractYear, inferContentType } from '../../../scrapers/shared/normalize.mjs';
import { attachResultMeta } from '../../../scrapers/shared/errors.mjs';
import { extractRawStreamsFromText, isValidDirectMediaUrl, unwrapEmbedToDirectStreams } from '../../../scrapers/stream-unwrapper.mjs';
import { AHWAK_CATEGORIES, AHWAK_CATEGORY_LABELS } from './ahwak-categories.mjs';

const ORIGIN = 'https://yam.ahwaktv.net';
export const PROVIDER_META = Object.freeze({ id: 'ahwak', name: 'أهواك تي في', code: 'AH',
  domains: [ORIGIN], mirrorOf: null, resolveOnDetails: true,
  capabilities: { catalog: true, search: true, details: true, episodes: true, servers: true, resolve: true, live: false },
  searchSpec: { method: 'GET', pathTemplate: '/search.php?keywords={query}', queryParam: 'keywords', encoding: 'utf-8', pagination: true },
  notImplemented: {},
});
export const AHWAK_CONFIG = Object.freeze({ id: 'ahwak', baseUrl: ORIGIN, categoryLabels: AHWAK_CATEGORY_LABELS,
  categories: Object.freeze({ latest: '/', movies: '/category.php?cat=english-movies', series: '/moslslat.php', ...AHWAK_CATEGORIES }) });
const context = baseUrl => ({ providerId: 'ahwak', baseUrl, allowHttp: false });
const refFor = url => 'ahwak:' + Buffer.from(url).toString('base64url');
export function decodeProviderRef(value) {
  let raw = String(value || '');
  if (raw.startsWith('ahwak:')) {
    raw = raw.slice(6);
    if (!raw.startsWith('https://')) raw = Buffer.from(raw, 'base64url').toString('utf8');
  }
  const url = assertSafeScraperUrl(raw, { allowHttp: false, allowedHosts: ['yam.ahwaktv.net'] });
  if (!['/watch.php', '/view-serie.php', '/see.php'].includes(url.pathname)) throw Error('AHWAK_INVALID_REFERENCE');
  return url.href;
}
async function page(url, options) {
  const result = await fetchProviderHtml(url, { ...options, providerId: 'ahwak', allowHttp: false,
    allowedHosts: ['yam.ahwaktv.net'], maxRetries: 0, timeoutMs: Math.min(15000, options?.timeoutMs || 15000) });
  if (!result.ok) throw Error('AHWAK_HTTP_' + result.status);
  return result;
}
export function parseAhwakCatalog(html, baseUrl = ORIGIN) {
  const $ = cheerio.load(html), seen = new Set(), items = [];
  $('.thumbnail').each((_, card) => {
    const node = $(card), anchor = node.find('a[href*="watch.php?vid="],a[href*="view-serie.php?"]').first();
    const url = resolveSafeUrl(anchor.attr('href') || '', baseUrl, { allowHttp: false, allowedHosts: ['yam.ahwaktv.net'] });
    const title = anchor.attr('title') || node.find('h3 a').text().trim() || anchor.find('img').attr('alt') || '';
    if (!url || !title || seen.has(url)) return;
    seen.add(url);
    const image = node.find('img').first();
    const item = normalizeCatalogItem({ ref: refFor(url), url, title,
      poster: image.attr('data-echo') || image.attr('data-src') || image.attr('src') || '',
      type: new URL(url).pathname === '/view-serie.php' ? 'series' : inferContentType(title, url, 'movie'),
    }, context(baseUrl));
    if (item) items.push(item);
  });
  const nextLink = $('a[rel="next"], .pagination li.active + li a').first().attr('href');
  let next = null;
  if (nextLink) {
    const safe = resolveSafeUrl(nextLink, baseUrl, { allowHttp: false, allowedHosts: ['yam.ahwaktv.net'] });
    const number = safe ? Number(new URL(safe).searchParams.get('page')) : NaN;
    if (Number.isInteger(number) && number > 1) next = number;
  }
  return attachResultMeta(items, { ok: true, providerId: 'ahwak', url: baseUrl, next_page: next });
}
export async function scrapeCatalog(category = 'latest', currentPage = 1, options = {}) {
  const path = AHWAK_CONFIG.categories[category];
  if (!path) throw Error('AHWAK_UNKNOWN_CATEGORY');
  const url = new URL(path, ORIGIN);
  if (!Number.isInteger(currentPage) || currentPage < 1 || currentPage > 500) throw Error('AHWAK_BAD_PAGE');
  if (currentPage > 1) url.searchParams.set('page', currentPage);
  const result = await page(url.href, options);
  return parseAhwakCatalog(result.html, result.url);
}
export async function scrapeSearch(query, currentPage = 1, options = {}) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 120) return [];
  const url = new URL('/search.php', ORIGIN); url.searchParams.set('keywords', q);
  if (!Number.isInteger(currentPage) || currentPage < 1 || currentPage > 500) throw Error('AHWAK_BAD_PAGE');
  if (currentPage > 1) url.searchParams.set('page', currentPage);
  const result = await page(url.href, options);
  return parseAhwakCatalog(result.html, result.url);
}
export function parseAhwakDetails(html, baseUrl) {
  const $ = cheerio.load(html), title = $('h1').first().text().trim();
  if (!title) throw Error('AHWAK_DETAILS_STRUCTURE_CHANGED');
  const episodes = [];
  $('.SeasonsEpisodesMains .tabcontent').each((_, section) => {
    const season = Number(($(section).attr('id') || '').match(/^Season(\d+)$/)?.[1]);
    if (!Number.isInteger(season) || season < 1) return;
    $(section).find('.thumbnail a[href*="watch.php?vid="]').each((_, anchor) => {
      const node = $(anchor), observedTitle = node.attr('title') || node.text().trim();
      const url = resolveSafeUrl(node.attr('href') || '', baseUrl, { allowHttp: false, allowedHosts: ['yam.ahwaktv.net'] });
      if (!url || !observedTitle) return;
      episodes.push({ title: observedTitle, url, ref: refFor(url), season,
        number: extractEpisodeNumber(observedTitle, url) });
    });
  });
  const poster = $('meta[property="og:image"]').attr('content') || $('.pm-poster-img img,.pm-series-thumb img,.pm-series-poster img').first().attr('src') || '';
  const overview = $('.pm-series-description .description,#pm-video-description').first().text().trim();
  return normalizeDetailsResult({ title, sourceUrl: baseUrl, ref: refFor(baseUrl),
    poster, overview, year: extractYear(title),
    type: new URL(baseUrl).pathname === '/view-serie.php' || /مسلسل|الحلقة/.test(title) ? 'series' : 'movie',
    episodes: normalizeEpisodeList(episodes, context(baseUrl)), servers: [],
  }, context(baseUrl));
}
export async function scrapeDetails(ref, options = {}) {
  let result = await page(decodeProviderRef(ref), options);
  const original = result.url;
  const $ = cheerio.load(result.html);
  const parent = $('a[href*="view-serie.php?"]').first().attr('href');
  let parentRef = null;
  if (new URL(original).pathname === '/watch.php' && parent) {
    const target = decodeProviderRef(new URL(parent, original).href);
    result = await page(target, options);
    parentRef = refFor(target);
  }
  return attachResultMeta({ ...parseAhwakDetails(result.html, result.url),
    requested_source_ref: refFor(original), observed_parent_ref: parentRef },
    { ok: true, providerId: 'ahwak', url: result.url });
}
export async function scrapeEpisodes(ref, options = {}) { return (await scrapeDetails(ref, options)).episodes; }
export async function scrapeServers(ref, options = {}) {
  let result = await page(decodeProviderRef(ref), options);
  let $ = cheerio.load(result.html);
  const playLink = $('#play-video[href],#player a[href*="see.php?vid="]').first().attr('href');
  if (playLink) {
    result = await page(decodeProviderRef(new URL(playLink, result.url).href), options);
    $ = cheerio.load(result.html);
  }
  const raw = extractRawStreamsFromText(result.html, result.url);
  $('[data-embed-url]').each((_, node) => {
    const url = resolveSafeUrl($(node).attr('data-embed-url') || '', result.url, { allowHttp: false });
    if (url) raw.push({ url, type: 'embed', label: $(node).text().trim() });
  });
  return attachResultMeta(normalizeServerList(raw, { ...context(result.url), providerName: 'أهواك تي في', codePrefix: 'AH' }),
    { ok: raw.length > 0, providerId: 'ahwak', url: result.url });
}
export async function resolveStream(ref, options = {}) {
  const servers = await scrapeServers(ref, options), direct = [];
  const pending = servers.slice(0, 6);
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const server = pending[cursor++];
      if (isValidDirectMediaUrl(server.url)) direct.push(server);
      else if (!options.fixtureHtml) {
        try { direct.push(...await unwrapEmbedToDirectStreams(server.url, decodeProviderRef(ref))); } catch {}
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const safe = direct.filter(server => isValidDirectMediaUrl(server.url));
  const primary = safe[0];
  return attachResultMeta({ ok: Boolean(primary), providerId: 'ahwak', url: primary?.url || null,
    streamUrl: primary?.url || null, streamType: primary?.streamType || primary?.type || null,
    headers: primary?.headers || {}, servers: safe },
    { ok: Boolean(primary), providerId: 'ahwak', errorCode: primary ? null : 'SERVER_EXTRACTION_FAILED' });
}
