import {getProviderConfig} from './scrapers/shared/provider-config.mjs';
import {createGithubIdentityVerifier} from './maintenance/github-identity.mjs';
import {createInternalWeb} from './internal-web.mjs';
import {createHarvestService} from './harvest/service.mjs';
import {masterDashboardHtml,masterDashboardCss,masterDashboardJs} from './diagnostics/master-dashboard.mjs';
import { allowedOrigin } from './security-boundary.mjs';
import { createSearchTraces, diagnosticsAuthorized } from './diagnostics/search-trace.mjs';
import { diagnosticsHtml, diagnosticsJs } from './diagnostics/dashboard.mjs';
import { BROWSE_SECTIONS, browseCatalog } from './catalog-browser.mjs';
import { createPinnedPlayback } from './pinned-playback.mjs';
import { getProvider } from './scrapers/registry.mjs';
import { createTmdbRuntime } from './tmdb-runtime.mjs';
import { createMediaAuditor } from './media-audit.mjs';
import { listSourceCapabilities } from './scrapers/source-registry.mjs';
import { directCandidate } from './scrapers/content-discovery.mjs';
import { createDiscoveryAudit } from './discovery-audit.mjs';
import { createDiscoveryCoordinator } from './discovery-coordinator.mjs';
import http from "node:http";
import { directSource, probeDirectMedia, filterBrowserSources } from "./direct-media.mjs";
import {
  assertSourceUrl,
  directCategory,
  directSearch,
  directDetails,
  directWatch,
  mediaKindFromUrl,
  fetchSourceHtml,
  BasriSource,
} from "./providers/akoam.mjs";
import { createContentRuntimeService } from "./content-runtime-service.mjs";
import { create3iskRuntime } from "./3isk-runtime.mjs";
import { createAlooyProvider, ALOOY_ORIGIN } from './providers/alooy.mjs';
import { createLarozaProvider, LAROZA_CATEGORIES, assertLarozaRef } from './providers/laroza.mjs';
import { ISK_CATEGORIES, decode3iskRef } from "./providers/3isk.mjs";
import { decodeAlooyRef } from './providers/alooy.mjs';
import { createCatalogMetadataCache } from './catalog-metadata-cache.mjs';
import { createSupabaseCatalogStore, createSupabaseDiscoveryStore } from './provider-store.mjs';
import { CatalogCategories } from "./catalog-categories.mjs";
import { buildRuntimeEnvelope, normalizeCatalogItem } from "./content-runtime.mjs";
import { createRateLimiter, getClientAddress, maybeCompress } from "./hardening.mjs";
import { scrapeRealCategory, scrapeRealSearch, scrapePinnedSource, scrapeRealDetails, activateAllScrapersForContent } from "./scrapers/index.mjs";
import { unwrapEmbedToDirectStreams } from "./scrapers/stream-unwrapper.mjs";

const MATCHES = "https://api.albasritv1.workers.dev/";
const CINEMA = "https://albas.albesriali03.workers.dev/";
const BASRI_ORIGIN = "https://www.albasritv.abrdns.com";
const BASRI_REFERER = `${BASRI_ORIGIN}/2026/09/movies-series.html`;

const ALLOWED_ORIGINS = new Set([
  "https://th-505.github.io",
  "https://theeb1230-dot.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const apiRateLimit = createRateLimiter({ windowMs: 60_000, max: 120 });
let cinemaToken = "";
let cinemaTokenExpiresAt = 0;
let cinemaSessionPromise = null;

function requireTestMode() {
  if (process.env.NODE_ENV !== "test") throw new Error("TEST_ONLY_MEDIA_REFERENCE_HOOK");
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && (allowedOrigin(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type,Content-Length,Content-Range,Accept-Ranges,Content-Disposition,X-Trace-Id");
}

function appendVary(res, value) {
  const current = String(res.getHeader("Vary") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!current.some((item) => item.toLowerCase() === value.toLowerCase())) current.push(value);
  res.setHeader("Vary", current.join(", "));
}

function sendJson(req, res, status, data) {
  const payload = JSON.stringify(data);
  const compressed = maybeCompress(req, payload);
  appendVary(res, "Accept-Encoding");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (compressed) res.setHeader("Content-Encoding", compressed.encoding);
  const body = compressed?.body || Buffer.from(payload);
  res.setHeader("Content-Length", String(body.byteLength));
  res.writeHead(status);
  res.end(body);
}

function log(event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function safeHeaderUrl(value) {
  const raw = String(value || "");
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.split("/").map(segment => encodeURIComponent(decodeURIComponent(segment))).join("/");
    return url.href;
  } catch {
    return encodeURI(raw);
  }
}

async function fetchTextJson(url, init = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "follow" });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { response, data, text };
  } finally {
    clearTimeout(timer);
  }
}

function basriHeaders(page = "/2026/09/movies-series.html", extra = {}) {
  return {
    Accept: "application/json",
    Origin: BASRI_ORIGIN,
    Referer: `${BASRI_ORIGIN}${page}`,
    "X-BSR-Page": page,
    ...extra,
  };
}

async function getMatchToken() {
  const result = await fetchTextJson(`${MATCHES}session`, { headers: basriHeaders("/2026/09/matches.html") });
  if (!result.response.ok || !result.data?.token) throw new Error(`MATCH_SESSION_${result.response.status}`);
  return String(result.data.token);
}

async function getMatches() {
  const token = await getMatchToken();
  const result = await fetchTextJson(MATCHES, { headers: basriHeaders("/2026/09/matches.html", { "X-BSR-Token": token }) });
  if (!result.response.ok) throw new Error(`MATCH_LIST_${result.response.status}`);
  return result.data;
}

async function getMatchServers(target) {
  const url = new URL(target);
  if (url.origin !== new URL(MATCHES).origin) throw new Error("BAD_MATCH_TARGET");
  const token = await getMatchToken();
  const result = await fetchTextJson(url.href, { headers: basriHeaders("/2026/09/matches.html", { "X-BSR-Token": token }) });
  if (!result.response.ok) throw new Error(`MATCH_SERVERS_${result.response.status}`);
  return result.data;
}

async function ensureCinemaSession(force = false) {
  const now = Date.now();
  if (!force && cinemaToken && cinemaTokenExpiresAt > now + 10_000) return cinemaToken;
  if (!force && cinemaSessionPromise) return cinemaSessionPromise;
  cinemaSessionPromise = (async () => {
    const result = await fetchTextJson(`${CINEMA}session`, { headers: { Accept: "application/json" } }, 15_000);
    if (!result.response.ok || !result.data?.token) throw new Error(`CINEMA_SESSION_${result.response.status}`);
    cinemaToken = String(result.data.token);
    const expiresAt = Number(result.data.expiresAt || 0);
    cinemaTokenExpiresAt = expiresAt > 10_000_000_000 ? expiresAt : expiresAt > 0 ? expiresAt * 1000 : Date.now() + 5 * 60_000;
    return cinemaToken;
  })();
  try { return await cinemaSessionPromise; } finally { cinemaSessionPromise = null; }
}

async function cinemaWorkerRequest(action, params = {}, retry = true) {
  const token = await ensureCinemaSession(false);
  const query = new URLSearchParams({ action, token, ...params });
  const result = await fetchTextJson(`${CINEMA}?${query}`, { headers: { Accept: "application/json" } }, 45_000);
  if (retry && result.response.status === 401) {
    cinemaToken = "";
    cinemaTokenExpiresAt = 0;
    await ensureCinemaSession(true);
    return cinemaWorkerRequest(action, params, false);
  }
  if (!result.response.ok) throw new Error(`CINEMA_${action.toUpperCase()}_${result.response.status}`);
  if (result.data?.status !== "success") throw new Error(`CINEMA_${action.toUpperCase()}_REJECTED`);
  return result.data;
}

async function workerOrDirect(label, workerFn, directFn) {
  try {return {data:await directFn(),source:'basri-direct'};}
  catch {return {data:await workerFn(),source:'basri-worker'};}
}

function normalizeCatalog(items = []) {
  return items.map((item) => {
    const raw = item.href || item.url || item.link || "";
    const ref = raw ? `legacy:${encodeURIComponent(raw)}` : '';
    const normalized = normalizeCatalogItem({ ...item, ref, source:'akoam' });
    return {
      ...normalized, img:normalized.poster, is_series:normalized.type !== 'movie', href:ref,
    };
  }).filter((item) => item.href);
}

function wrapEpisodes(episodes = []) {
  return episodes.map((episode, index) => {
    const raw = episode.link || episode.url || episode.href || "";
    const rawTitle = String(episode.title || episode.name || episode.label || "");
    const numMatch = rawTitle.match(/(\d+)/);
    const epNum = Number(episode.num || episode.number || episode.episodeNumber || (numMatch ? numMatch[1] : index + 1)) || (index + 1);
    return {
      ...episode,
      num: epNum,
      number: epNum,
      episodeNumber: epNum,
      title: rawTitle && !rawTitle.includes("undefined") ? rawTitle : `الحلقة ${epNum}`,
      link: raw ? `legacy:${encodeURIComponent(String(raw))}` : "",
      watch_available: episode.watch_available !== false && Boolean(raw),
    };
  });
}

async function normalizeWorkerDetails(data = {}) {
  const normalized = {
    status: "success", source: "basri-worker",
    movie_title: String(data.movie_title || data.title || "MITV"),
    poster: String(data.poster || ""), episodes: wrapEpisodes(data.episodes || []),
    download_available: false, is_iframe: false,
  };
  if (data.media_src && !data.is_iframe) {
    try {
      const url = assertSourceUrl(String(data.media_src), { allowMedia: true });
      const headers = { Referer: BASRI_REFERER, 'User-Agent': BasriSource.userAgent };
      const inspection = await inspectMediaCandidate(url.href, BASRI_REFERER);
      if (!inspection.playable) throw Error('NO_HEALTHY_DIRECT_MEDIA');
      const source = directSource(inspection.url, headers, {
        kind:inspection.kind, webPlayable:await browserPlayable(inspection.url, headers),
      });
      return { ...normalized, ...source, media_sources: [source] };
    } catch { /* Embedded or non-media fallback content is never playable. */ }
  }
  return { ...normalized, ...(normalized.episodes.length ? {} : {
    playback_unavailable: true, playback_reason: 'NO_SAFE_DIRECT_MEDIA', media_sources: [],
  }) };
}

async function cinemaSearch(query) {
  const result = await workerOrDirect(
    "search",
    () => cinemaWorkerRequest("search", { q: query }),
    () => directSearch(query),
  );
  const items = result.source === "basri-worker" ? (result.data.data || []) : result.data;
  return { status: "success", source: result.source, data: normalizeCatalog(items) };
}

async function cinemaCategory(sourceUrl, page = 1) {
  if (!sourceUrl) return { status: "success", source: "basri-direct", data: [] };
  assertSourceUrl(sourceUrl);
  const result = await workerOrDirect(
    "category",
    () => cinemaWorkerRequest("genre", { genre: sourceUrl, p: String(page || 1) }),
    () => directCategory(sourceUrl, page),
  );
  const items = result.source === "basri-worker" ? (result.data.data || []) : result.data;
  return { status: "success", source: result.source, data: normalizeCatalog(items) };
}

export function createIntegratedContentRuntime(iskRuntime, { searchCatalog = cinemaSearch, fetchCategory = cinemaCategory, fetchMatches = getMatches, searchScraper = scrapeRealSearch, alooyRuntime = createAlooyProvider(), larozaRuntime = createLarozaProvider() } = {}) {
  return createContentRuntimeService({
    fetchMatches,
    async searchCatalog(query) {
      const results = await Promise.allSettled([
        searchCatalog(query),
        iskRuntime.search(query),
        alooyRuntime.search(query),
        larozaRuntime.search(query),
        searchScraper(query)
      ]);
      const success = results.filter(result => result.status === 'fulfilled');
      if (!success.length) throw new Error('CATALOG_SEARCH_UNAVAILABLE');
      const data = success.flatMap(result => Array.isArray(result.value)
        ? result.value
        : Array.isArray(result.value?.data) ? result.value.data : []);
      return { status: 'success', source: 'catalog', data };
    },
    async fetchCategory(sourceUrl, page) {
      const larozaId = Object.keys(LAROZA_CATEGORIES).find(key => LAROZA_CATEGORIES[key] === sourceUrl);
      if (larozaId) return larozaRuntime.category(larozaId, page);
      const id = Object.keys(ISK_CATEGORIES).find(key => ISK_CATEGORIES[key] === sourceUrl);
      if (sourceUrl === ALOOY_ORIGIN + "/tv-series.html") return alooyRuntime.category("alooy-series", page);
      if (id) return iskRuntime.category(id, page);

      try {
        const res = await fetchCategory(sourceUrl, page);
        if (res && Array.isArray(res.data) && res.data.length > 0) return res;
      } catch (_) {}

      // Fallback to real multi-source scraping grid
      const catKey = sourceUrl.split('/').pop() || sourceUrl;
      const data = await scrapeRealCategory(catKey, page);
      return { status: "success", source: "scrapers-master", data };
    },
  });
}

async function inspectMediaCandidate(value, referer) {
  const headers = { Accept: '*/*', Referer: safeHeaderUrl(referer || BasriSource.origin + '/'), 'User-Agent': BasriSource.userAgent };
  return probeDirectMedia(value, headers, {
    validateUrl: url => assertSourceUrl(url, { allowMedia: true }),
  });
}

async function browserPlayable(value, headers) {
  try {
    return (await probeDirectMedia(value, headers, {
      validateUrl: url => assertSourceUrl(url, { allowMedia: true }), browser: true,
    })).webPlayable;
  } catch { return false; }
}

function extractDownloadCandidates(html = "", pageUrl = BasriSource.origin + "/") {
  const candidates = [];
  const patterns = [
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
    /(?:file|src)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const re of patterns) {
    for (const match of String(html || "").matchAll(re)) {
      try {
        const target = assertSourceUrl(new URL(match[1], pageUrl).href, { allowMedia: true });
        const looksLikeFile = /\.(?:mp4|m3u8|mpd|ts|m2ts|webm|mkv)(?:$|\?)/i.test(target.pathname + target.search);
        if (!looksLikeFile || candidates.includes(target.href)) continue;
        candidates.push(target.href);
      } catch {}
    }
  }
  return candidates;
}

export function __extractDownloadCandidatesForTest(html, pageUrl) {
  requireTestMode();
  return extractDownloadCandidates(html, pageUrl);
}

async function resolveDirectWatch(details, target) {
  const unsupported = []; const sources = [];
  const pages = await Promise.allSettled((details.watch || []).slice(0, 3).map(async watchUrl => ({watchUrl, watch:await directWatch(watchUrl,target)})));
  for (const result of pages) {
    if (result.status !== 'fulfilled') continue;
    const {watchUrl, watch} = result.value;
    for (const candidate of (watch.candidates || []).slice(0,4)) {
      if (!sources.some(source => source.candidate === candidate)) sources.push({watchUrl,candidate,watch});
    }
  }
  for (const source of sources) {
    try {
      const inspection = await inspectMediaCandidate(source.candidate, source.watchUrl);
      if (inspection.playable) return {...source, candidate:inspection.url, inspection, alternatives:sources.filter(value=>value!==source)};
      unsupported.push({kind:inspection.kind, attachment:inspection.attachment===true});
    } catch { /* Try the next validated source without exposing its URL. */ }
  }
  return {unsupported,unchecked:sources};
}

async function resolveDirectDownload(details, target) {
  for (const item of (details.downloads || []).slice(0, 3)) {
    const downloadPage = String(item?.url || item || "");
    if (!downloadPage) continue;
    try {
      assertSourceUrl(downloadPage);
      const directInspection = await inspectMediaCandidate(downloadPage, target);
      if (directInspection.playable && directInspection.kind === "mp4") {
        return { downloadPage, candidate: directInspection.url, inspection: directInspection };
      }
    } catch {}

    try {
      const { html } = await fetchSourceHtml(downloadPage, { referer: target });
      for (const candidate of extractDownloadCandidates(html, downloadPage).slice(0, 8)) {
        try {
          const inspection = await inspectMediaCandidate(candidate, downloadPage);
          if (inspection.playable && inspection.kind === "mp4") return { downloadPage, candidate:inspection.url, inspection };
        } catch (error) {
          log("cinema_download_probe_failed", { host: new URL(candidate).hostname, code: String(error?.code || ""), reason: String(error?.message || error) });
        }
      }
    } catch (error) {
      log("cinema_download_parse_failed", { reason: String(error?.message || error) });
    }
  }
  return null;
}

const metadataCache = new Map();
async function akoamMetadata(target) {
  const cached = metadataCache.get(target);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = directDetails(target);
  const entry = {promise,expires:Date.now()+120_000}; metadataCache.set(target,entry);
  if (metadataCache.size > 128) metadataCache.delete(metadataCache.keys().next().value);
  try {return await promise;} catch(error) {if(metadataCache.get(target)===entry) metadataCache.delete(target);throw error;}
}

async function directDetailsResolved(target) {
  const details = await akoamMetadata(target);
  const base = { status: 'success', source: 'basri-direct', movie_title: details.movie_title || 'MITV',
    poster: details.poster || '', episodes: wrapEpisodes(details.episodes || []), is_iframe: false, download_available: false };
  if (base.episodes.length) return base;
  if (!details.watch?.length && !details.downloads?.length) return { ...base, playback_unavailable:true, playback_reason:'NO_SAFE_DIRECT_MEDIA' };
  const [resolved, download] = await Promise.all([
    resolveDirectWatch(details, target), resolveDirectDownload(details, target),
  ]);
  const candidates = [
    ...(resolved.candidate ? [resolved, ...(resolved.alternatives || []).slice(0, 3)] : []),
    ...(download?.candidate ? [{ ...download, watchUrl: download.downloadPage }] : []),
  ];
  const sources = [], seen = new Set();
  for (const candidate of candidates) {
    try {
      const inspection = candidate.inspection || await inspectMediaCandidate(candidate.candidate, candidate.watchUrl);
      if (!inspection.playable || seen.has(inspection.url)) continue;
      seen.add(inspection.url);
      const headers = { Referer: safeHeaderUrl(candidate.watchUrl), 'User-Agent': BasriSource.userAgent };
      const source = directSource(inspection.url, headers, { kind:inspection.kind,
        label: sources.length ? `مصدر ${sources.length + 1}` : 'تلقائي',
        webPlayable:await browserPlayable(inspection.url, headers) });
      sources.push(source);
    } catch { /* Skip blocked or unsafe candidates; never offer an embed or cloud proxy. */ }
  }
  if (!sources.length) return { ...base, media_sources:[], playback_unavailable:true, playback_reason:'NO_HEALTHY_DIRECT_MEDIA' };
  return { ...base, ...sources[0], media_sources:sources,
    download_available:sources.some(s => s.media_type === 'mp4') };
}

async function cinemaDetails(ref) {
  if (
    ref.startsWith("mycima:") ||
    ref.startsWith("egydead:") ||
    ref.startsWith("anime4up:") ||
    ref.startsWith("arabseed:") ||
    ref.startsWith("witanime:") ||
    ref.startsWith("cimanow:") ||
    ref.startsWith("shahid4u:") ||
    ref.startsWith("shii4u:") ||
    ref.startsWith("moviz:") ||
    ref.startsWith("moviztime:") ||
    ref.startsWith("akwam:") ||
    ref.startsWith("3cktv:") ||
    ref.startsWith("3ck:") ||
    ref.startsWith("ristoanime:") ||
    ref.startsWith("qfilm:") ||
    ref.startsWith("ipauniverse:") ||
    ref.startsWith("mewsry:")
  ) {
    const details = await scrapeRealDetails(ref);
    if (details) return details;
  }
  if (!ref.startsWith("legacy:")) {
    const details = await scrapeRealDetails(ref);
    if (details) return details;
    throw new Error("BAD_CINEMA_REFERENCE");
  }
  const target = decodeURIComponent(ref.slice("legacy:".length));
  assertSourceUrl(target);
  try { return await directDetailsResolved(target); }
  catch { const data = await cinemaWorkerRequest("series", {series:target}); return normalizeWorkerDetails(data); }
}

function retiredMedia(req, res) {
  return sendJson(req, res, 410, { status: 'error', message: 'MEDIA_PROXY_RETIRED_USE_DIRECT_PLAYBACK', media_proxy:false });
}

function publicDetails(data, web = false) {
  if (data.playback_mode === 'client_resolve' || data.is_iframe) {
    return { status:'success', source:data.source, movie_title:data.movie_title,
      poster:data.poster || '', episodes:data.episodes || [], media_sources:[], is_iframe:false,
      download_available:false, playback_unavailable:true, playback_reason:'EDGE_DIRECT_RESOLUTION_REQUIRED' };
  }
  return web ? filterBrowserSources(data) : data;
}

export function assertCatalogReference(ref) {
  if(typeof ref!=='string' || Buffer.byteLength(ref)>1536) throw Error('BAD_CINEMA_REFERENCE');
  if(ref.startsWith('laroza:')) {assertLarozaRef(ref);return 'laroza';}
  if(ref.startsWith('3isk:')) {decode3iskRef(ref);return '3isk';}
  if(ref.startsWith('alooy:')) {decodeAlooyRef(ref);return 'alooy';}
  if(ref.startsWith('legacy:')) {
    let url;
    try {url=assertSourceUrl(decodeURIComponent(ref.slice(7)));} catch {throw Error('BAD_CINEMA_REFERENCE');}
    if(url.search || url.hash || !/^\/(?:movie|series|episode)\/[^?#]+$/.test(url.pathname) ||
      'legacy:'+encodeURIComponent(url.href)!==ref) throw Error('BAD_CINEMA_REFERENCE');
    return 'akoam';
  }
  throw Error('BAD_CINEMA_REFERENCE');
}

export function createServer({ iskRuntime = create3iskRuntime(), alooyRuntime = createAlooyProvider(), larozaRuntime = createLarozaProvider(),
  traceStore=createSearchTraces({logger:data=>log(data.event,data)}), searchPinned=scrapePinnedSource,
  catalogStore=createSupabaseCatalogStore(), catalogNow=Date.now,
  catalogLoader=null, runtimeService = createIntegratedContentRuntime(iskRuntime, { alooyRuntime, larozaRuntime }) } = {}) {
  const catalog=createCatalogMetadataCache({store:catalogStore,now:catalogNow,validateRef:assertCatalogReference,
    load:catalogLoader || (async(provider,ref)=>{
      if(provider==='laroza') return larozaRuntime.metadata(ref);
      if(provider==='alooy') return alooyRuntime.metadata(ref);
      if(provider==='3isk') return iskRuntime.metadata(ref);
      const data=await akoamMetadata(assertSourceUrl(decodeURIComponent(ref.slice(7))).href);
      return {...data,episodes:wrapEpisodes(data.episodes || [])};
    })});
  const pinnedPlayback=createPinnedPlayback({loadDetails:async({provider,ref,phase})=>{
    const runtime=provider==='3isk'?iskRuntime:provider==='alooy'?alooyRuntime:provider==='laroza'?larozaRuntime:null;
    if(runtime){
      if(phase==='metadata' && typeof runtime.metadata==='function')return runtime.metadata(ref);
      return runtime.details(ref,{platform:'web'});
    }
    const scraper=getProvider(provider)?.module;
    if(!scraper?.scrapeDetails)throw Error('PINNED_SOURCE_NOT_SUPPORTED');
    return scraper.scrapeDetails(ref,{strict:true,timeoutMs:6000,maxRetries:0});
  }});
  const discoveryMetadata = createTmdbRuntime();
  const discoveryStore = createSupabaseDiscoveryStore();
  const discoveryAudit = createDiscoveryAudit({ auditor: createMediaAuditor({
    persist: async record => {
      if (!discoveryStore) throw Error('AUDIT_STORE_NOT_CONFIGURED');
      await discoveryStore.put('audit-v1:' + record.result.id, record, record.result.expiresAt);
    },
  }) });
  const harvest=createHarvestService({metadata:discoveryMetadata,logger:data=>log(data.event,data)});
  const discovery = createDiscoveryCoordinator({
    load: async key => discoveryStore?.get('audited-v2:' + key) || null,
    persist: async ({key,result,expiresAt}) => discoveryStore?.put('audited-v2:' + key,result,expiresAt),
    maxConcurrent: 3, maxQueued: 40, ttlMs: 60_000,
    discover: async ({ ref, season, episode }, publish) => {
      // The canonical TMDB identity is authoritative, never caller-supplied title/year.
      const metadata=(await harvest.cachedWork(ref) || await discoveryMetadata.details(ref)).data;
      const series=ref.startsWith('tmdb:tv:');
      if(series){
        const episodes=(await discoveryMetadata.season(ref,season || 1)).data?.episodes || [];
        if(!episodes.some(row=>Number(row.episode_number)===Number(episode || 1)))throw Error('EPISODE_NOT_FOUND');
      }
      const expected={title:metadata.title,aliases:[metadata.original_title,...(metadata.aliases||[])],year:metadata.year,season:series?season || 1:null,episode:series?episode || 1:null};
      const cachedMedia=await harvest.media(ref,{season:series?season||1:0,episode:series?episode||1:0});
      if(cachedMedia?.length){
        // Cache stores evidence, not a permanent trust decision: re-probe and audit before release.
        const reviewed=await discoveryAudit.review(cachedMedia,expected);
        if(reviewed.approved.length)return {servers:reviewed.approved.map(source=>({provider:source.provider,quality:source.quality||null,kind:'direct',url:source.url,headers:source.headers||{},identity_verified:source.identity_verified,verification_basis:source.verification_basis,audit_pending:source.audit_pending})),reason:null};
      }
      const approved=[],seen=new Set();let rejected=0;
      await activateAllScrapersForContent(metadata.title, season || 1, episode || 1, {
        ref,year:metadata.year,type:series?'series':'movie',original_language:metadata.original_language,genres:metadata.genres,titleVariants:[metadata.original_title,...(metadata.aliases||[])],
        onSources:async candidates=>{
          const reviewed=await discoveryAudit.review(candidates,expected);
          rejected+=reviewed.quarantine.length;
          for(const source of reviewed.approved){
            if(seen.has(source.url))continue;
            seen.add(source.url);
            approved.push({provider:source.provider,quality:source.quality || null,kind:'direct',url:source.url,
              headers:source.headers || {},identity_verified:source.identity_verified,verification_basis:source.verification_basis,audit_pending:source.audit_pending});
          }
          if(approved.length)publish({servers:[...approved],reason:null});
        },
      });
      return {servers:approved,reason:approved.length?null:rejected?'IDENTITY_NOT_VERIFIED':'NO_PLAYABLE_SOURCE'};
    },
  });
  const maintenanceIdentity=createGithubIdentityVerifier();
  const internalWeb=createInternalWeb();
  const server = http.createServer(async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, "http://localhost");
    const started = Date.now();
    const client = getClientAddress(req);
    if (["/api/cinema/media", "/api/alooy/media"].includes(url.pathname)) return retiredMedia(req, res);
    const rate = apiRateLimit(`${client}:${url.pathname}`);
    if (!rate.ok) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.setHeader("X-RateLimit-Remaining", "0");
      return sendJson(req, res, 429, { status: "error", message: "RATE_LIMITED" });
    }
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    try {
      if(url.pathname==='/api/v1/providers/configuration'){
        if(req.method!=='GET')return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        return sendJson(req,res,200,{providers:listSourceCapabilities().map(source=>{
          const c=getProviderConfig(source.id);const {enabled=true,revision=0,...config}=c||{};
          return {id:source.id,revision,enabled,domain:source.domain,config};
        })});
      }
      if(url.pathname==='/api/v1/maintenance/provider-config'){
        if(req.method!=='POST')return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        try{await maintenanceIdentity(String(req.headers.authorization||'').replace(/^Bearer /,''));}catch{return sendJson(req,res,401,{message:'MAINTENANCE_AUTH_REQUIRED'})}
        let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>8192)return sendJson(req,res,413,{message:'BODY_TOO_LARGE'});}
        let body;try{body=JSON.parse(raw)}catch{return sendJson(req,res,400,{message:'INVALID_JSON'})}
        if(!body||typeof body!=='object'||Array.isArray(body)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)return sendJson(req,res,400,{message:'INVALID_REVISION'});
        try{return sendJson(req,res,200,await harvest.applyVerified(body.provider,body.config,body.expected_revision));}
        catch(error){const reason=/^[A-Z_]{3,80}$/.test(error.message)?error.message:'VERIFIED_REPAIR_NOT_APPLIED';return sendJson(req,res,422,{applied:false,reason});}
      }
      if(await internalWeb.handle(req,res,url))return;
      if (['/admin','/admin/style.css','/admin/app.js'].includes(url.pathname)) {
        if(req.method!=='GET')return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
        res.writeHead(200);return res.end(url.pathname.endsWith('.css')?masterDashboardCss:url.pathname.endsWith('.js')?masterDashboardJs:masterDashboardHtml);
      }
      if(url.pathname==='/api/v1/admin/summary'){
        if(!diagnosticsAuthorized(req))return sendJson(req,res,401,{message:'DIAGNOSTICS_AUTH_REQUIRED'});
        if(req.method!=='GET')return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        return sendJson(req,res,200,{server:{node:process.version,openssl:process.versions.openssl,uptime_seconds:Math.floor(process.uptime()),memory:process.memoryUsage()},harvest:await harvest.summary()});
      }
      if(url.pathname==='/api/v1/harvest/wake'){
        if(req.method!=='GET')return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        return sendJson(req,res,202,{configured:harvest.wake().configured});
      }
      if (url.pathname === '/diagnostics' || url.pathname === '/diagnostics/app.js') {
        if (req.method !== 'GET') return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Referrer-Policy','no-referrer');
        res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
        return res.end(url.pathname.endsWith('.js')?diagnosticsJs:diagnosticsHtml);
      }
      if (url.pathname === '/api/v1/diagnostics/searches') {
        if (!diagnosticsAuthorized(req)) return sendJson(req,res,401,{message:'DIAGNOSTICS_AUTH_REQUIRED'});
        if (req.method !== 'GET') return sendJson(req,res,405,{message:'METHOD_NOT_ALLOWED'});
        return sendJson(req,res,200,{items:traceStore.list({provider:url.searchParams.get('provider')||'',query:url.searchParams.get('q')||'',id:url.searchParams.get('id')||''}),runtime:{node:process.version,openssl:process.versions.openssl},retention_seconds:traceStore.retention_seconds});
      }
      if (url.pathname === "/health" || url.pathname === "/api/v1/health") return sendJson(req, res, 200, { status: "ok", cinema_source: "basri-original" });
      if (url.pathname === "/api/runtime/status") return sendJson(req, res, 200, runtimeService.status());
      if (url.pathname === "/api/v1/categories") return sendJson(req, res, 200, { status: 'success', data: CatalogCategories });
      if(url.pathname==='/api/v1/catalog/sections')return sendJson(req,res,200,{status:'success',data:BROWSE_SECTIONS});
      if(url.pathname==='/api/v1/catalog'){
        if(req.method!=='GET')return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        try{return sendJson(req,res,200,await browseCatalog(discoveryMetadata,url.searchParams.get('ref'),Number(url.searchParams.get('page') || 1)));}
        catch(error){return sendJson(req,res,error.message==='INVALID_CATALOG_SECTION'?400:503,{status:'error',message:error.message==='INVALID_CATALOG_SECTION'?error.message:'CATALOG_UNAVAILABLE'});}
      }
      if(url.pathname==='/api/v1/playback'){
        if(req.method!=='GET')return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        let ref=url.searchParams.get('ref') || '';
        try{
          if(ref.startsWith('legacy:'))ref='akwam:'+Buffer.from(assertSourceUrl(decodeURIComponent(ref.slice(7))).href).toString('base64url');
          const result=await pinnedPlayback.resolve({provider:ref.split(':')[0],seriesRef:ref,
            type:url.searchParams.get('type') || 'movie',season:url.searchParams.get('season') || 1,
            episode:url.searchParams.get('episode') || 1,platform:url.searchParams.get('platform') || 'web'});
          return sendJson(req,res,200,{...result,reason:result.playback_reason});
        }catch(error){
          const message=String(error?.message || 'PINNED_SOURCE_UNAVAILABLE');
          return sendJson(req,res,400,{status:'error',message:/^PINNED_[A-Z_]+$/.test(message)?message:'PINNED_SOURCE_UNAVAILABLE'});
        }
      }
      if (url.pathname === '/api/v1/explore/sources') {
        if (req.method !== 'GET') return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        return sendJson(req,res,200,{status:'success',data:listSourceCapabilities()});
      }
      if (url.pathname === "/api/v1/providers") return sendJson(req, res, 200, { status: 'success', data: [{ provider: 'akoam' }, iskRuntime.status(), alooyRuntime.status(), larozaRuntime.status()] });
      if (url.pathname.startsWith('/api/v1/3isk/')) {
        if (req.method !== 'GET') return sendJson(req, res, 405, { status: 'error', message: 'METHOD_NOT_ALLOWED' });
        const ref = url.searchParams.get('ref') || '';
        if (url.pathname === '/api/v1/3isk/status') return sendJson(req, res, 200, iskRuntime.status());
        if (url.pathname === '/api/v1/3isk/search') return sendJson(req, res, 200, await iskRuntime.search(url.searchParams.get('q') || ''));
        if (url.pathname === '/api/v1/3isk/category') return sendJson(req, res, 200, await iskRuntime.category(ref, Number(url.searchParams.get('p') || 1)));
        if (url.pathname === '/api/v1/3isk/resolve') return sendJson(req, res, 200, publicDetails(await iskRuntime.resolve(ref, { refresh: url.searchParams.get('refresh') === '1' }), url.searchParams.get('platform') === 'web'));
        if (url.pathname === '/api/v1/3isk/details') return sendJson(req, res, 200, publicDetails(await iskRuntime.details(ref, { refresh: url.searchParams.get('refresh') === '1' }), url.searchParams.get('platform') === 'web'));
        return sendJson(req, res, 404, { status: 'error', message: 'NOT_FOUND' });
      }
      if (url.pathname === '/api/v1/discovery/start') {
        if (req.method !== 'POST') return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        const input = { ref:url.searchParams.get('ref') || '', title:url.searchParams.get('title') || '',
          year:url.searchParams.get('year') || '', season:url.searchParams.get('season') || 0,
          episode:url.searchParams.get('episode') || 0 };
        if (input.title.length < 2 || input.title.length > 250 || !/^tmdb:(movie|tv):[0-9]+$/.test(input.ref) || !/^[0-9]{0,4}$/.test(input.year) || !/^[0-9]{1,3}$/.test(String(input.season)) || !/^[0-9]{1,6}$/.test(String(input.episode)) || Number(input.season) > 100 || Number(input.episode) > 100000) return sendJson(req,res,400,{status:'error',message:'INVALID_DISCOVERY_INPUT'});
        try { return sendJson(req,res,202,{status:'accepted',data:discovery.enqueue(input)}); }
        catch { return sendJson(req,res,400,{status:'error',message:'INVALID_REFERENCE'}); }
      }
      if (url.pathname === '/api/v1/discovery/status') {
        if (req.method !== 'GET') return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        try {
          const input = { ref:url.searchParams.get('ref') || '', season:url.searchParams.get('season') || 0,
            episode:url.searchParams.get('episode') || 0 };
          let state = discovery.status(input);
          if (state.state === 'missing' && discoveryStore) {
            const key = [input.ref, Number(input.season) || 0, Number(input.episode) || 0].join(':');
            const cached = await discoveryStore.get('audited-v2:' + key).catch(() => null);
            if (cached?.payload && new Date(cached.expires_at).getTime() > Date.now())
              state = {key,state:'ready',result:cached.payload,expiresAt:new Date(cached.expires_at).getTime()};
          }
          return sendJson(req,res,200,{status:'success',data:state});
        }
        catch { return sendJson(req,res,400,{status:'error',message:'INVALID_REFERENCE'}); }
      }
      if (url.pathname === "/api/v1/matches") return sendJson(req, res, 200, await runtimeService.matches());
      if (url.pathname === "/api/v1/explore") {
        if (req.method !== "GET") return sendJson(req,res,405,{status:"error",message:"METHOD_NOT_ALLOWED"});
        const q = (url.searchParams.get("q") || "").trim();
        const provider = (url.searchParams.get("provider") || "").trim().toLowerCase();
        if (q.length < 2 || q.length > 120 || !/^[a-z0-9_-]{2,30}$/.test(provider))
          return sendJson(req,res,400,{status:"error",message:"INVALID_EXPLORE_INPUT"});
        const session = url.searchParams.get('diagnostic_session') || '';
        const suppliedPlatform = url.searchParams.get('platform') || '';
        const platform = ['tv','mobile','ios','desktop','web'].includes(suppliedPlatform) ? suppliedPlatform : /Dart/i.test(req.headers['user-agent'] || '') ? 'native-unknown' : req.headers.origin ? 'web' : 'unknown';
        const trace = traceStore.start({provider,query:q,platform,session:/^[a-f0-9-]{20,64}$/i.test(session)?session:null});
        res.setHeader('X-Trace-Id',trace.id);
        // HTTP completion is observable; it does not prove the client rendered the results.
        res.once('finish',()=>trace.events.length<100&&trace.events.push({stage:'response_finished',status:res.statusCode,at_ms:Date.now()-trace.started_ms}));
        res.once('close',()=>!res.writableFinished&&trace.events.length<100&&trace.events.push({stage:'client_disconnected',at_ms:Date.now()-trace.started_ms}));
        try {
          const items = await traceStore.run(trace,()=>searchPinned(q,provider));
          return sendJson(req,res,200,{status:"success",provider,items,trace_id:trace.id,search_outcome:items.length?'results':'empty_unconfirmed'});
        } catch (error) {
          if (error?.message === "SOURCE_NOT_SUPPORTED")
            return sendJson(req,res,422,{status:"error",message:"SOURCE_NOT_SUPPORTED",provider,trace_id:trace.id});
          return sendJson(req,res,503,{status:"error",message:"SOURCE_TEMPORARILY_UNAVAILABLE",provider,trace_id:trace.id,reason:trace.reason});
        }
      }
      if (url.pathname === "/api/v1/search") return sendJson(req, res, 200, await runtimeService.search((url.searchParams.get("q") || "").trim()));
      if (url.pathname === "/api/v1/resolve") {
        const ref = (url.searchParams.get("ref") || url.searchParams.get("id") || "").trim();
        const title = (url.searchParams.get("title") || "").trim();
        const season = Math.max(1, Number(url.searchParams.get("season")) || 1);
        const episode = Math.max(1, Number(url.searchParams.get("episode")) || 1);
        const rawServers = [];

        if (ref && !ref.startsWith("tmdb:")) {
          try {
            const isScraperRef = /^(mycima|akwam|cimanow|egydead|arabseed|shahid4u|shii4u|moviztime|moviz|3cktv|3ck|anime4up|witanime|ristoanime|qfilm|ipauniverse|mewsry):/.test(ref);
            const details = isScraperRef
              ? await scrapeRealDetails(ref)
              : ref.startsWith("laroza:")
              ? await larozaRuntime.details(ref, {})
              : ref.startsWith("alooy:")
              ? await alooyRuntime.details(ref, {})
              : ref.startsWith("3isk:")
              ? await iskRuntime.details(ref, {})
              : await cinemaDetails(ref);
            const sources = details?.media_sources || details?.servers || [];
            for (const s of sources) {
              const u = s.url || s.media_path;
              if (u) {
                rawServers.push({
                  provider: s.provider || details?.source || "akwam",
                  code: s.code,
                  kind: s.kind || (/\.(m3u8|mp4)(?:$|\?)/i.test(u) ? "direct" : "embed"),
                  url: u,
                  headers: s.headers || {},
                  streamType: s.streamType,
                  quality: s.quality
                });
              }
            }
            if (details?.media_src) {
              rawServers.push({
                provider: details?.source || "akwam",
                code: details?.code,
                kind: "direct",
                url: details.media_src,
                headers: {}
              });
            }
          } catch (_) {}
        }

        // إذا لم نجد مصادر بالـ ref أو كان المطلوب عبر title، نقوم بتفعيل وتشغيل جميع القواشط المحلية
        if (rawServers.length === 0 && title && (!ref || ref.startsWith('tmdb:'))) {
          try {
            const activated = await activateAllScrapersForContent(title, season, episode, { ref, year: url.searchParams.get('year') || '',
              type: ref.startsWith('tmdb:tv:') ? 'series' : ref.startsWith('tmdb:movie:') ? 'movie' : undefined });
            const reviewed = await discoveryAudit.review(activated, { title, year: url.searchParams.get('year') || null,
              season: ref.startsWith('tmdb:tv:') ? season : null, episode: ref.startsWith('tmdb:tv:') ? episode : null });
            if (reviewed.approved.length > 0) {
              for (const s of reviewed.approved) {
                rawServers.push(s);
              }
            }
          } catch (_) {}

        }

        // 2. الفلترة الصارمة (Zero-Ads / Zero-Iframe Filter)
        // منع أي رابط يحتوي على إطار مدمج أو إعلانات، والتركيز فقط على الروابط المباشرة الخام
        let cleanServers = rawServers.filter(directCandidate);

        // 3. إذا لم نجد روابط مباشرة نقية، نقوم بفكها عميقاً عبر stream-unwrapper
        if (cleanServers.length === 0 && rawServers.length > 0) {
          for (const srv of rawServers) {
            try {
              const unwrapped = await unwrapEmbedToDirectStreams(srv.url, srv.url);
              for (const direct of unwrapped) {
                cleanServers.push({
                  provider: srv.provider,
                  code: srv.code,
                  url: direct.url,
                  kind: 'direct',
                  quality: direct.quality,
                  headers: direct.headers
                });
              }
            } catch (_) {}
          }
        }

        return sendJson(req, res, 200, {
          status: "success",
          success: true,
          servers: cleanServers.filter(directCandidate)
        });
      }
      if (url.pathname === "/api/v1/category") {
        const ref = url.searchParams.get('ref') || '';
        if (Object.hasOwn(LAROZA_CATEGORIES,ref)) {
          const result = await larozaRuntime.category(ref,Number(url.searchParams.get('p') || 1));
          if(ref==='laroza-latest' && Number(url.searchParams.get('p') || 1)===1) catalog.observeLatest(result.data);
          return sendJson(req,res,200,{ ...buildRuntimeEnvelope({ kind:'category', data:result.data, source:'laroza' }),
            ...(typeof result.has_more === 'boolean' ? {has_more:result.has_more,pagination:result.pagination} : {}) });
        }
        if (Object.hasOwn(ISK_CATEGORIES, ref)) {
          const result = await iskRuntime.category(ref, Number(url.searchParams.get('p') || 1));
          if(ref==='3isk-latest' && Number(url.searchParams.get('p') || 1)===1) catalog.observeLatest(result.data);
          return sendJson(req, res, 200, buildRuntimeEnvelope({ kind: 'category', data: result.data.map(normalizeCatalogItem), source: '3isk', cached: result.cached }));
        }
        return sendJson(req, res, 200, await runtimeService.category(ref, Number(url.searchParams.get("p") || 1)));
      }
      if (url.pathname === "/api/matches") return sendJson(req, res, 200, await getMatches());
      if (url.pathname === "/api/matches/servers") return sendJson(req, res, 200, await getMatchServers(url.searchParams.get("url") || ""));
      if (url.pathname === "/api/cinema/search") return sendJson(req, res, 200, await cinemaSearch((url.searchParams.get("q") || "").trim()));
      if (url.pathname === "/api/cinema/category") return sendJson(req, res, 200, await cinemaCategory(url.searchParams.get("url") || "", Number(url.searchParams.get("p") || 1)));
      if (url.pathname === '/api/cinema/metadata') {
        if(req.method!=='GET') return sendJson(req,res,405,{status:'error',message:'METHOD_NOT_ALLOWED'});
        const ref = url.searchParams.get('ref') || '';
        return sendJson(req,res,200,await catalog.get(ref));
      }
      if (url.pathname === "/api/cinema/details") {
        const ref = url.searchParams.get('ref') || '';
        const data = ref.startsWith('laroza:')
          ? await larozaRuntime.details(ref, { refresh:url.searchParams.get('refresh') === '1' })
          : ref.startsWith('alooy:')
          ? await alooyRuntime.details(ref, { refresh:url.searchParams.get('refresh') === '1' })
          : ref.startsWith('3isk:')
            ? await iskRuntime.details(ref, { refresh:url.searchParams.get('refresh') === '1' })
            : await cinemaDetails(ref);
        return sendJson(req,res,200,publicDetails(data, url.searchParams.get('platform') === 'web'));
      }
      return sendJson(req, res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      if(error?.message==='BAD_CINEMA_REFERENCE') return sendJson(req,res,400,{status:'error',message:error.message});
      if(error?.message==='CATALOG_BUSY') return sendJson(req,res,503,{status:'error',message:error.message});
      if (String(error?.message).startsWith('LAROZA_BAD_REFERENCE') || String(error?.message).startsWith('LAROZA_BAD_CATEGORY') || String(error?.message).startsWith('LAROZA_BAD_PAGE') || String(error?.message).startsWith('ALOOY_BAD_') || String(error?.message).startsWith('3ISK_BAD_') || String(error?.message).startsWith('3ISK_EXPECTED_')) return sendJson(req, res, 400, { status: 'error', message: error.message });
      if (res.headersSent) { res.destroy(error); return; }
      log("request_failed", { path: url.pathname, ms: Date.now() - started, error: String(error?.message || error) });
      return sendJson(req, res, 502, { status: "error", message: String(error?.message || "UPSTREAM_FAILED") });
    }
  });
  server.searchTraceStore = traceStore;
  server.harvestService=harvest;
  if(process.env.NODE_ENV!=='test')server.once('listening',()=>harvest.start());
  server.once('close',()=>void harvest.stop());
  return server;
}
