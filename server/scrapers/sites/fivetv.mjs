// 5TV: Najd-owned HTML reader; beta has its own implementation.
import * as cheerio from 'cheerio';
import {fetchProviderHtml, resolveSafeUrl} from '../shared/http.mjs';
import {effectiveProviderDomains} from '../shared/provider-config.mjs';
import {normalizeCatalogItem, normalizeDetailsResult, normalizeEpisodeList, normalizeServerList,
  normalizeDigits, extractEpisodeNumber, extractYear} from '../shared/normalize.mjs';
import {ScraperError, SCRAPER_ERROR_CODES as E, attachResultMeta, createEmptyArrayResult, classifyNetworkError} from '../shared/errors.mjs';
import {extractRawStreamsFromText, unwrapEmbedToDirectStreams} from '../stream-unwrapper.mjs';
import {directCandidate} from '../shared/direct-candidate.mjs';

const ID = 'fivetv';
const BASE = 'https://ho26374qa.5ivtv.in';
// Exact aliases observed in the capture and the 2026-11-06 live redirect chain.
const DOMAINS = [BASE, 'https://ho35284qa.5ivtv.in', 'https://new61.5tv.lol'];
// Observed public availability-check hop that returns to new61.5tv.lol.
// This is a network redirect allowance, not a content or player domain.
const REDIRECT_HOSTS = ['ur5ive.vip'];
export const PROVIDER_META = Object.freeze({
  id: 'fivetv', name: 'فايف تي في (5TV)', code: 'FTV', domains: DOMAINS,
  mirrorOf: null,
  capabilities: {catalog: true, search: true, details: true, episodes: true, servers: true, resolve: true, live: false},
  searchSpec: {method: 'GET', pathTemplate: '/search/?q={query}', queryParam: 'q', encoding: 'utf-8', pagination: '/search/page/{page}/?q={query}'},
  notImplemented: {}
});
export const FIVETV_CONFIG = Object.freeze({
  id: ID, baseUrl: BASE, domains: DOMAINS,
  categories: {home: '/', series: '/latest-series/', movies: '/latest-movies/', episodes: '/latest-episodes/', rows: '/new-rows/'},
  categoryLabels: {home: 'الرئيسية', series: 'أحدث المسلسلات', movies: 'أحدث الأفلام', episodes: 'أحدث الحلقات', rows: 'الإضافات الجديدة'}
});
// Only player hosts observed on watch controls, never ad frames or download links.
const PLAYER_HOSTS = ['71stream.one', 'ult4vid.one', 'dsvplay.com', 'morencius.com', 'hgcloud.to', 'vidmoly.net'];
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const ref = url => ID + ':' + Buffer.from(url).toString('base64url');
const safe = (value, base) => value ? resolveSafeUrl(value, base, {allowHttp: false}) : '';
const site = (value, base = BASE) => value ? resolveSafeUrl(value, base, {
  allowHttp: false, allowedHosts: effectiveProviderDomains(ID, DOMAINS)
}) : '';
function target(value) {
  let raw = String(value || '');
  if (raw.startsWith(ID + ':')) {
    raw = raw.slice(ID.length + 1);
    if (!raw.startsWith('https://') && !raw.startsWith('/')) raw = Buffer.from(raw, 'base64url').toString('utf8');
  }
  const url = site(raw);
  if (!url || !/^\/(?:series|episode|movie)\/[^/]+\/?$/.test(new URL(url).pathname))
    throw new ScraperError(E.UNSAFE_URL, 'FIVETV_INVALID_CONTENT_REFERENCE', {providerId: ID});
  return url;
}
async function page(url, options) {
  const response = await fetchProviderHtml(url, {...options, providerId: ID, allowHttp: false,
    allowedHosts: [...effectiveProviderDomains(ID, DOMAINS), ...REDIRECT_HOSTS]});
  // A handshake/landing page must never become the content result.
  if (!site(response.url)) throw new ScraperError(E.UNSAFE_URL, 'FIVETV_FOREIGN_CONTENT_RESPONSE', {providerId: ID});
  if (!response.ok) throw new ScraperError(response.status === 403 ? E.ACCESS_BLOCKED : E.STRUCTURE_CHANGED,
    'FIVETV_HTTP_' + response.status, {providerId: ID, status: response.status});
  return response;
}
function pagination($, url) {
  const current = Number(new URL(url).pathname.match(/\/page\/(\d+)/)?.[1]) || 1;
  let next = null;
  for (const node of $('a.next.page-numbers, .pagination a[rel=next], a[rel=next]').toArray()) {
    const candidate = site($(node).attr('href'), url);
    if (!candidate) continue;
    const u = new URL(candidate), base = new URL(url);
    const clean = p => p.replace(/\/page\/\d+\/?$/, '/');
    const n = Number(u.pathname.match(/\/page\/(\d+)/)?.[1] || u.searchParams.get('paged'));
    if (clean(u.pathname) === clean(base.pathname) && n > current &&
        (!base.searchParams.has('q') || u.searchParams.get('q') === base.searchParams.get('q'))) {
      next = {next_page: n, next_url: candidate}; break;
    }
  }
  return next || {next_page: null, next_url: null};
}
export function parseFiveTvCatalog(html, url = BASE + '/') {
  const $ = cheerio.load(html), items = [], seen = new Set();
  $('article.ftv-home-poster-card, article.ftv-home-episode-card, article.ftv-tax-card, article.ftv-status-row__card, article.ftv-hero-slide').each((_, el) => {
    const card = $(el);
    const a = card.find('a[href]').filter((_, a) => /\/(series|movie|episode)\//.test($(a).attr('href') || '')).first();
    const urlValue = site(a.attr('href'), url);
    if (!urlValue || seen.has(urlValue)) return;
    const img = card.find('img').first();
    const title = text(card.find('.ftv-home-poster-card__title, .ftv-home-episode-card__title, .ftv-tax-card__title, h2, h3').first().text() || img.attr('alt') || a.attr('title'));
    if (!title) return;
    const type = new URL(urlValue).pathname.startsWith('/movie/') ? 'movie' : 'series';
    const item = normalizeCatalogItem({ref: ref(urlValue), title, url: urlValue, type,
      poster: safe(img.attr('data-src') || img.attr('src'), url),
      year: extractYear(card.find('[class*="--year"], .ftv-tax-card__year').first().text()) || extractYear(title), source: ID},
    {providerId: ID, baseUrl: url, allowHttp: false});
    if (item) { seen.add(urlValue); items.push(item); }
  });
  const more = pagination($, url);
  return attachResultMeta(items, {providerId: ID, url, ...more, has_more: more.next_page !== null,
    errorCode: items.length ? null : ($('.ftv-search-empty').length ? E.EMPTY_RESULT : E.STRUCTURE_CHANGED)});
}
export function parseFiveTvEpisodes(html, url) {
  const $ = cheerio.load(html), rows = [];
  $('.ftv-season-panel a.ftv-series-episode-card, .ftv-season-panel a.ftv-episode-card').each((_, el) => {
    const a = $(el), link = site(a.attr('href'), url);
    if (!link || !new URL(link).pathname.startsWith('/episode/')) return;
    const title = text(a.find('strong').first().text() || a.text());
    const number = extractEpisodeNumber(title, '');
    const observedSeason = normalizeDigits(a.closest('[data-season-panel]').attr('data-season-panel'));
    const season = /^\d+$/.test(observedSeason) && Number(observedSeason) > 0 ? Number(observedSeason) : 1;
    rows.push({ref: ref(link), title, url: link, number, season, source: ID});
  });
  return normalizeEpisodeList(rows, {providerId: ID, baseUrl: url, allowHttp: false});
}
export function parseFiveTvServers(html, url) {
  const $ = cheerio.load(html), rows = [];
  $('.ftv-watch-tab[data-server-url]').each((_, el) => {
    const node = $(el);
    if (node.attr('data-server-vip') === '1' || node.is('[disabled], [aria-disabled=true]')) return;
    const link = safe(node.attr('data-server-url'), url);
    if (!link) return;
    const direct = directCandidate({url: link});
    if (!direct && !PLAYER_HOSTS.includes(new URL(link).hostname)) return;
    rows.push({url: link, name: text(node.find('strong').text()) || '5TV', quality: text(node.find('small').text()),
      type: direct ? (/\.m3u8(?:[?#]|$)/i.test(link) ? 'm3u8' : 'mp4') : 'embed',
      headers: {Referer: url}, verified: false});
  });
  return normalizeServerList(rows, {providerId: ID, providerName: PROVIDER_META.name, codePrefix: 'FTV', baseUrl: url, allowHttp: false})
    .map(row => ({...row, verified: false}));
}
export function parseFiveTvDetails(html, url) {
  const $ = cheerio.load(html), title = text($('.ftv-content-hero__title').first().text());
  if (!title) throw new ScraperError(E.STRUCTURE_CHANGED, 'FIVETV_MISSING_CONTENT_TITLE', {providerId: ID});
  const parent = site($('.ftv-episode-poster-back').attr('href'), url);
  const isEpisode = new URL(url).pathname.startsWith('/episode/');
  const type = new URL(url).pathname.startsWith('/movie/') ? 'movie' : 'series';
  const img = $('.ftv-content-hero__poster img').first();
  const result = normalizeDetailsResult({ref: ref(url), title, sourceUrl: url, type,
    year: extractYear($('.ftv-content-hero__year').text()),
    poster: safe(img.attr('data-src') || img.attr('src'), url),
    overview: text($('.ftv-content-hero__description').text()),
    genres: $('.ftv-content-hero__genres a').map((_, el) => text($(el).text())).get(),
    episodes: type === 'movie' ? [] : parseFiveTvEpisodes(html, url), servers: parseFiveTvServers(html, url)},
  {providerId: ID, baseUrl: url, allowHttp: false});
  if (isEpisode) {
    result.episode_number = extractEpisodeNumber(title, '');
    result.parent_url = parent;
    result.series_url = parent;
    result.series_title = title.replace(/\s*[—–-]?\s*(?:الحلقة|الحلقه|episode)\s*[\d٠-٩۰-۹]+.*$/i, '').trim();
  }
  return result;
}
function pageNumber(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new ScraperError(E.STRUCTURE_CHANGED, 'FIVETV_INVALID_PAGE');
  return n;
}
async function list(url, options) {
  try { const r = await page(url, options); return parseFiveTvCatalog(r.html, r.url); }
  catch (error) { const e = classifyNetworkError(error); return createEmptyArrayResult(ID, e.code, e.message, {url}); }
}
export async function scrapeCatalog(category = 'home', number = 1, options = {}) {
  const path = FIVETV_CONFIG.categories[category];
  if (!path) return createEmptyArrayResult(ID, E.UNSUPPORTED_CAPABILITY, 'FIVETV_UNKNOWN_CATEGORY');
  const n = pageNumber(number);
  return list(new URL(n === 1 ? path : path + 'page/' + n + '/', BASE).href, options);
}
export async function scrapeSearch(query = '', number = 1, options = {}) {
  const q = text(query);
  if (!q || q.length > 120) return createEmptyArrayResult(ID, E.EMPTY_RESULT);
  const n = pageNumber(number), url = new URL(n === 1 ? '/search/' : '/search/page/' + n + '/', BASE);
  url.searchParams.set('q', q);
  return list(url.href, options);
}
export async function scrapeDetails(value, options = {}) {
  const url = target(value), r = await page(url, options);
  return attachResultMeta(parseFiveTvDetails(r.html, r.url), {providerId: ID, url: r.url});
}
export async function scrapeEpisodes(value, options = {}) {
  const details = await scrapeDetails(value, options);
  return attachResultMeta(details.episodes, {providerId: ID, url: details.sourceUrl});
}
export async function scrapeServers(value, options = {}) {
  const url = target(value), r = await page(url, options), rows = parseFiveTvServers(r.html, r.url);
  return attachResultMeta(rows, {providerId: ID, url: r.url, errorCode: rows.length ? null : E.SERVER_EXTRACTION_FAILED});
}
export async function resolveStream(value, options = {}) {
  const raw = String(value || ''), player = safe(raw);
  let rows;
  if (player && PLAYER_HOSTS.includes(new URL(player).hostname)) {
    if (typeof options.playerFixtureHtml === 'string') rows = extractRawStreamsFromText(options.playerFixtureHtml, player);
    else rows = await unwrapEmbedToDirectStreams(player,
      site(options.referer || options.headers?.Referer || options.headers?.referer) || BASE + '/');
  } else {
    rows = await scrapeServers(value, options);
    if (rows._meta?.errorCode) throw new ScraperError(rows._meta.errorCode, 'FIVETV_SERVERS_UNAVAILABLE', {providerId: ID});
  }
  const direct = rows.find(directCandidate);
  if (direct) return {...direct, ok: true, providerId: ID, streamUrl: direct.url, verified: false};
  // The shared media orchestrator resolves embeds and probes actual containers.
  if (rows[0]?.type === 'embed') return {...rows[0], ok: true, providerId: ID, streamUrl: rows[0].url, verified: false};
  throw new ScraperError(E.SERVER_EXTRACTION_FAILED, 'FIVETV_NO_MEDIA', {providerId: ID});
}
export async function scrapeLive() {
  return createEmptyArrayResult(ID, E.UNSUPPORTED_CAPABILITY, 'FIVETV_VOD_ONLY');
}
