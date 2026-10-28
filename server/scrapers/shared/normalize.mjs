import { contentIdentity, explicitEpisode, explicitSeason } from '../../../shared/content-identity.js';
// server/scrapers/shared/normalize.mjs
// Unified normalizers for Arabic/English numbers, episodes, seasons, catalog items, details, and servers
import { resolveSafeUrl } from './http.mjs';
import {decideSourceCatalog,observedRuntimeMinutes,compactCatalogDecision} from './catalog-decision.mjs';

const ARABIC_INDIC_START = 0x0660;
const EASTERN_ARABIC_START = 0x06f0;

const ARABIC_ORDINAL_MAP = new Map([
  ['الاولى', 1], ['الأولى', 1], ['الاول', 1], ['الأول', 1],
  ['الثانية', 2], ['الثانيه', 2], ['الثاني', 2],
  ['الثالثة', 3], ['الثالثه', 3], ['الثالث', 3],
  ['الرابعة', 4], ['الرابعه', 4], ['الرابع', 4],
  ['الخامسة', 5], ['الخامسه', 5], ['الخامس', 5],
  ['السادسة', 6], ['السادسه', 6], ['السادس', 6],
  ['السابعة', 7], ['السابعه', 7], ['السابع', 7],
  ['الثامنة', 8], ['الثامنه', 8], ['الثامن', 8],
  ['التاسعة', 9], ['التاسعه', 9], ['التاسع', 9],
  ['العاشرة', 10], ['العاشره', 10], ['العاشر', 10]
]);

export function normalizeDigits(input = '') {
  return String(input || '').replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      return String(code - ARABIC_INDIC_START);
    }
    if (code >= EASTERN_ARABIC_START && code <= EASTERN_ARABIC_START + 9) {
      return String(code - EASTERN_ARABIC_START);
    }
    return ch;
  });
}

export function cleanTitleText(raw = '') {
  const text = normalizeDigits(String(raw || ''))
    .replace(/\s+/g, ' ')
    .replace(/^(مشاهدة|تحميل|فيلم|مسلسل|انمي|أنمي|برنامج)\s+/i, (m) => m) // preserve type words if meaningful, trim noise
    .replace(/\s*(مترجم|مدبلج)?\s*(اون لاين|أون لاين|اونلاين|كامل|بجودة عالية|HD|WEB-DL|BluRay)\s*$/gi, '')
    .trim();
  return text || String(raw || '').trim();
}

export function extractYear(text = '') {
  const normalized = normalizeDigits(String(text || ''));
  const m = normalized.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[1] : '';
}

export function extractSeasonNumber(text = '', defaultSeason = 1) {
  return explicitSeason(text,text) || defaultSeason;
}

export function extractEpisodeNumber(text = '', url = '', _legacyFallback = null) {
  const raw=normalizeDigits(String(text||'')).trim();
  const explicit=explicitEpisode(raw,url);
  if(explicit!==null)return explicit;
  for(const[word,n]of ARABIC_ORDINAL_MAP.entries())if(new RegExp(`(?:الحلقة|الحلقه|حلقة|حلقه)\\s+${word}(?=\\s|$|[-_/])`,'i').test(raw))return n;
  // A bare number is observed source data; an index/year/sequel elsewhere is not.
  const n=/^\d{1,5}$/.test(raw)?Number(raw):null;
  return Number.isSafeInteger(n)&&n>0?n:null;
}

export function inferContentType(title = '', url = '', defaultType = 'movie') {
  const combined = `${title} ${url}`.toLowerCase();
  if (/انمي|أنمي|anime|ona|ova/.test(combined)) return 'anime';
  if (/مسلسل|حلقة|الحلقة|موسم|الموسم|series|season|episode|ep-/i.test(combined) && !/فيلم|movie|film/i.test(title)) {
    return 'series';
  }
  if (/فيلم|movie|film/i.test(combined)) return 'movie';
  return defaultType;
}

export function normalizeCatalogItem(raw = {}, context = {}) {
  const { providerId = '', baseUrl = '', defaultType = 'movie', allowHttp = true } = context;
  const url = resolveSafeUrl(raw.url || raw.link || raw.sourceUrl || '', baseUrl, { allowHttp });
  const rawTitle = String(raw.title || raw.name || '').trim();
  if (!url || !rawTitle) return null;

  const title = normalizeDigits(rawTitle).replace(/\s+/g, ' ').trim();
  const poster = resolveSafeUrl(raw.poster || raw.image || raw.thumbnail || '', baseUrl, { allowHttp });
  const year = String(raw.year || extractYear(title) || '').trim();
  const type = raw.type || inferContentType(title, url, defaultType);
  const source = raw.source || providerId;
  const ref = raw.ref || (source ? `${source}:${url}` : url);

  return {
    id: raw.id || ref,
    ref,
    title,
    originalTitle: raw.originalTitle || '',
    url,
    sourceUrl: url,
    poster,
    image: poster,
    year,
    quality: raw.quality || '',
    rating: raw.rating || '',
    category: raw.category || type,
    type,
    source
  };
}

export function normalizeEpisodeList(rawEpisodes = [], context = {}) {
  const { providerId = '', baseUrl = '', defaultSeason = 1, allowHttp = true } = context;
  const byKey = new Map();

  rawEpisodes.forEach((ep, idx) => {
    if (!ep) return;
    const rawUrl = ep.url || ep.link || ep.sourceUrl || ep.ref || '';
    const cleanRawUrl = rawUrl.includes(':http') ? rawUrl.slice(rawUrl.indexOf('http')) : rawUrl;
    const url = resolveSafeUrl(cleanRawUrl, baseUrl, { allowHttp });
    if (!url) return;

    const rawTitle = String(ep.title || ep.name || '').trim();
    const season = Number(ep.season) > 0 ? Number(ep.season) : extractSeasonNumber(`${rawTitle} ${url}`, defaultSeason);
    const observed=extractEpisodeNumber(rawTitle,url);
    const field=Number(ep.episode_number??ep.episodeNumber??ep.number??ep.num);
    const number=observed??(Number.isSafeInteger(field)&&field>0?field:null);
    const title = rawTitle ? normalizeDigits(rawTitle).replace(/\s+/g, ' ').trim() : number?`الحلقة ${number}`:'حلقة غير مرقمة';
    const ref = ep.ref && ep.ref.includes(':') ? ep.ref : providerId ? `${providerId}:${url}` : url;

    // Deduplicate by URL first, and also avoid duplicate (season, number) pointing to same path
    const dedupKey = `${season}:${number}:${url}`;
    if (!byKey.has(url) && !byKey.has(dedupKey)) {
      const normalizedEp = {
        id: ep.id || url,
        episode_number:number,
        watch_available:number!==null&&ep.watch_available!==false,
        number,
        season,
        title,
        name: title,
        url,
        link: url,
        sourceUrl: url,
        ref,
        source: ep.source || providerId
      };
      byKey.set(url, normalizedEp);
      byKey.set(dedupKey, normalizedEp);
    }
  });

  const uniqueEpisodes = Array.from(new Set(byKey.values()));
  uniqueEpisodes.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return (a.number??Number.MAX_SAFE_INTEGER) - (b.number??Number.MAX_SAFE_INTEGER);
  });

  return uniqueEpisodes;
}

export function normalizeDetailsResult(raw = {}, context = {}) {
  const { providerId = '', baseUrl = '', allowHttp = true } = context;
  const sourceUrl = resolveSafeUrl(raw.sourceUrl || raw.url || '', baseUrl, { allowHttp });
  const title = normalizeDigits(String(raw.title || '').trim());
  const poster = resolveSafeUrl(raw.poster || raw.image || '', baseUrl, { allowHttp });
  const identity=contentIdentity({...raw,title,url:sourceUrl,type:raw.type || (raw.episodes?.length?'series':'movie')});
  const episodes = identity.type === 'movie' ? [] : normalizeEpisodeList(raw.episodes || [], { providerId, baseUrl: sourceUrl || baseUrl, defaultSeason:identity.season_number||1, allowHttp });

  // Group seasons if not explicitly provided
  let seasons = Array.isArray(raw.seasons) ? raw.seasons : [];
  if (seasons.length === 0 && episodes.length > 0) {
    const seasonMap = new Map();
    for (const ep of episodes) {
      if (!seasonMap.has(ep.season)) {
        seasonMap.set(ep.season, {
          season: ep.season,
          number: ep.season,
          title: `الموسم ${ep.season}`,
          episodes: []
        });
      }
      seasonMap.get(ep.season).episodes.push(ep);
    }
    seasons = Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);
  }

  const type =
    raw.type ||
    (episodes.length > 0 ? inferContentType(title, sourceUrl, 'series') : inferContentType(title, sourceUrl, 'movie'));

  const result={
    id: raw.id || (providerId && sourceUrl ? `${providerId}:${sourceUrl}` : sourceUrl),
    ref: raw.ref || (providerId && sourceUrl ? `${providerId}:${sourceUrl}` : sourceUrl),
    title,
    originalTitle: String(raw.originalTitle || '').trim(),
    poster,
    image: poster,
    overview: String(raw.overview || raw.description || raw.story || '').trim(),
    story: String(raw.story || raw.overview || raw.description || '').trim(),
    year: String(raw.year || extractYear(title) || '').trim(),
    type,
    category: type,
    is_series: Boolean(raw.is_series !== undefined ? raw.is_series : (type === 'series' || episodes.length > 0)),
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => String(g).trim()).filter(Boolean) : [],
    rating: String(raw.rating || '').trim(),
    quality: String(raw.quality || '').trim(),
    seasons,
    episodes,
    servers: Array.isArray(raw.servers) ? raw.servers : [],
    source: raw.source || providerId,
    sourceUrl,
    ...identity
  };
  result.runtime_minutes=observedRuntimeMinutes(raw.runtime_minutes??raw.duration);
  result.catalog_decision=compactCatalogDecision(decideSourceCatalog(result));
  result.source_edition=result.catalog_decision.edition;
  return result;
}

export function normalizeServerList(rawServers = [], context = {}) {
  const { providerId = '', providerName = '', codePrefix = 'SRV', baseUrl = '', allowHttp = true } = context;
  const seen = new Set();
  const normalized = [];

  for (const srv of rawServers) {
    if (!srv) continue;
    const rawUrl = srv.url || srv.embedUrl || srv.src || '';
    const url = resolveSafeUrl(rawUrl, baseUrl, { allowHttp });
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const idx = normalized.length + 1;
    const code = srv.code || srv.serverCode || `${codePrefix}-${idx}`;
    const streamType =
      srv.streamType ||
      srv.type ||
      (url.toLowerCase().includes('.m3u8') || url.toLowerCase().includes('/hls/')
        ? 'm3u8'
        : url.toLowerCase().includes('.mp4')
          ? 'mp4'
          : 'embed');

    normalized.push({
      id: srv.id || `${providerId || codePrefix.toLowerCase()}-${idx}`,
      code,
      serverCode: code,
      name: srv.name || srv.label || `${providerName || codePrefix} #${idx}`,
      label: srv.label || srv.name || `${code}`,
      url,
      quality: srv.quality || (streamType === 'm3u8' ? 'AUTO-HLS' : 'HD'),
      type: streamType,
      streamType,
      source: srv.source || providerId,
      headers: srv.headers || {}
    });
  }

  return normalized;
}
