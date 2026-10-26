import { getProvider } from './scrapers/registry.mjs';
import { assertSafeScraperUrl, fetchSafeResponse } from './scrapers/shared/http.mjs';
import { classifyFallbackProbeResponse } from './fallback-probe.mjs';

const ALIASES = Object.freeze({ akoam: 'akwam', wecima: 'mycima', moviz: 'moviztime', '3ck': '3cktv' });
const DEFAULT_ORIGIN = 'https://th-505.github.io';
const BLOCKED_HEADERS = /^(?:accept-charset|accept-encoding|access-control-request-headers|access-control-request-method|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|permissions-policy|referer|te|trailer|transfer-encoding|upgrade|user-agent|via|proxy-.*|sec-.*)$/i;
export function canonicalPinnedSource(value) {
  const raw = String(value || '').toLowerCase();
  const provider = ALIASES[raw] || raw;
  if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(raw) || !getProvider(provider)?.meta) throw Error('PINNED_SOURCE_NOT_SUPPORTED');
  return provider;
}
function sourceDomains(provider) {
  return (getProvider(provider).meta.domains || []).map(value => new URL(value).hostname.toLowerCase());
}
function sourceRef(value, provider, { fromMetadata = false } = {}) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) throw Error('PINNED_INVALID_REFERENCE');
  let payload, ref;
  if (/^https:\/\//.test(value)) {
    if (!fromMetadata) throw Error('PINNED_INVALID_REFERENCE');
    payload = value; ref = `${provider}:${value}`;
  } else {
    const match = value.match(/^([a-z0-9_-]+):(.+)$/);
    if (!match) throw Error('PINNED_INVALID_REFERENCE');
    let owner;
    try { owner = canonicalPinnedSource(match[1]); } catch { throw Error('PINNED_SOURCE_CONFLICT'); }
    if (owner !== provider) throw Error('PINNED_SOURCE_CONFLICT');
    payload = match[2]; ref = `${provider}:${payload}`;
    if (!payload.startsWith('https://')) {
      if (!/^[A-Za-z0-9_-]{1,3000}$/.test(payload)) throw Error('PINNED_INVALID_REFERENCE');
      const decoded = Buffer.from(payload, 'base64url').toString('utf8');
      if (Buffer.from(decoded).toString('base64url') !== payload ||
          (!decoded.startsWith('/') && !decoded.startsWith('https://')) ||
          decoded.startsWith('//') || /[\u0000-\u0020\u007f\\]/.test(decoded)) throw Error('PINNED_INVALID_REFERENCE');
      payload = decoded;
    }
  }
  const domains = sourceDomains(provider);
  if (!domains.length) throw Error('PINNED_SOURCE_NOT_SUPPORTED');
  let url;
  try {
    url = new URL(payload, `https://${domains[0]}`);
    assertSafeScraperUrl(url.href, { allowHttp: false, allowedHosts: domains });
  } catch { throw Error('PINNED_INVALID_REFERENCE'); }
  if (url.username || url.password || url.port || url.hash || !domains.includes(url.hostname.toLowerCase()))
    throw Error('PINNED_INVALID_REFERENCE');
  return ref;
}
function unwrap(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : payload;
}
function assertOwnership(data, provider) {
  for (const value of [data.provider, data.selected_source, data.source]) {
    if (!value) continue;
    const raw = String(value).toLowerCase();
    if (raw === 'tmdb' || raw === 'fallback') throw Error('PINNED_SOURCE_CONFLICT');
    if (getProvider(ALIASES[raw] || raw) && canonicalPinnedSource(raw) !== provider) throw Error('PINNED_SOURCE_CONFLICT');
  }
}
function episodeNumber(row) { return Number(row.episode_number ?? row.episodeNumber ?? row.number ?? row.episode ?? row.num); }
function seasonNumber(row, metadata) { return Number(row.season_number ?? row.season ?? metadata.season_number ?? metadata.season ?? NaN); }
function candidateList(data) {
  const entries = [...(Array.isArray(data.media_sources) ? data.media_sources : []),
    ...(Array.isArray(data.servers) ? data.servers : [])];
  const own = data.media_src || data.media_path || data.media_url || data.stream_url;
  if (own) entries.push({ ...data, url: own });
  return entries;
}
function candidateOf(value, provider) {
  if (!value || typeof value !== 'object' || ['kind', 'type', 'streamType'].some(key => value[key] === 'embed') || value.is_iframe === true) return null;
  assertOwnership(value, provider);
  let url;
  try {
    url = assertSafeScraperUrl(value.url || value.media_src || value.media_path || value.media_url || value.stream_url || '', { allowHttp: false });
    if (url.username || url.password || url.port || url.hash || !/\.(?:mp4|m3u8)$/i.test(url.pathname)) return null;
  } catch { return null; }
  const rawHeaders = value.headers || value.playback_headers || {};
  if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) return null;
  const headers = {};
  for (const [key, raw] of Object.entries(rawHeaders)) {
    if (!/^[!#$%&'*+.^_`|~\w-]{1,80}$/.test(key) || typeof raw !== 'string' || raw.length > 2048 || /[\r\n\u0000]/.test(raw)) return null;
    headers[key] = raw;
  }
  return { provider, kind: 'direct', url: url.href, headers,
    quality: typeof value.quality === 'string' ? value.quality.slice(0, 40) : null,
    web_playable: value.web_playable === true,
    container: /\.m3u8$/i.test(url.pathname) ? 'hls' : 'mp4' };
}

/** A bounded HEAD response check, not a guarantee that HLS segments or codecs work. */
export async function probePinnedMedia(candidate, { platform, origin = DEFAULT_ORIGIN } = {}) {
  const response = await fetchSafeResponse(candidate.url, { method: 'HEAD', allowHttp: false,
    maxRetries: 0, maxRedirects: 2, timeoutMs: 4000,
    headers: platform === 'web' ? { Origin: origin, Referer: origin + '/' } : candidate.headers });
  const classified = classifyFallbackProbeResponse({ status: response.status, contentType: response.headers?.get?.('content-type') });
  const allowedOrigin = response.headers?.get?.('access-control-allow-origin');
  return { ...classified, statusCode: response.status,
    webPlayable: classified.playable && ['hls', 'mp4'].includes(classified.container) &&
      (allowedOrigin === '*' || allowedOrigin === origin) };
}

/** Never searches or switches sources: only metadata -> exact episode -> direct media. */
export function createPinnedPlayback({ loadDetails, probe = probePinnedMedia, maxSources = 8,
  browserOrigin = DEFAULT_ORIGIN } = {}) {
  if (typeof loadDetails !== 'function') throw Error('PINNED_DETAILS_LOADER_REQUIRED');
  const origin = new URL(browserOrigin);
  if (origin.origin !== browserOrigin || (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)))
    throw Error('PINNED_INVALID_BROWSER_ORIGIN');
  const limit = Math.min(16, Math.max(1, Number(maxSources) || 8));
  async function resolve(input = {}) {
    const provider = canonicalPinnedSource(input.provider);
    const seriesRef = sourceRef(input.seriesRef, provider);
    const type = input.type === 'tv' ? 'series' : input.type;
    if (!['movie', 'series'].includes(type)) throw Error('PINNED_INVALID_TYPE');
    const platform = input.platform || 'web';
    if (!['web', 'native'].includes(platform)) throw Error('PINNED_INVALID_PLATFORM');
    const season = type === 'series' ? Number(input.season) : 0;
    const episode = type === 'series' ? Number(input.episode) : 0;
    if (![season, episode].every(Number.isSafeInteger) || season < 0 || episode < 0 || season > 100 || episode > 100000 ||
      (type === 'series' && (!season || !episode))) throw Error('PINNED_INVALID_EPISODE');
    const base = { provider, series_ref: seriesRef, episode_ref: null, season, episode, platform, servers: [] };
    const unavailable = reason => ({ ...base, status: 'unavailable', playback_unavailable: true, playback_reason: reason });
    let details;
    try { details = unwrap(await loadDetails({ provider, ref: seriesRef, phase: 'metadata', platform })); }
    catch { return unavailable('PINNED_SOURCE_UNAVAILABLE'); }
    assertOwnership(details, provider);
    let mediaRef = seriesRef;
    if (type === 'series') {
      const matching = (Array.isArray(details.episodes) ? details.episodes : []).filter(row => row &&
        seasonNumber(row, details) === season && episodeNumber(row) === episode && row.watch_available !== false);
      if (!matching.length) return unavailable('PINNED_EPISODE_NOT_FOUND');
      const refs = new Set();
      for (const row of matching) {
        assertOwnership(row, provider);
        const candidate = row.ref || row.episode_id || row.url || row.link || row.id;
        refs.add(sourceRef(candidate, provider, { fromMetadata: true }));
      }
      if (refs.size !== 1) return unavailable('PINNED_EPISODE_AMBIGUOUS');
      mediaRef = [...refs][0]; base.episode_ref = mediaRef;
      try { details = unwrap(await loadDetails({ provider, ref: mediaRef, phase: 'episode', platform })); }
      catch { return unavailable('PINNED_SOURCE_UNAVAILABLE'); }
      assertOwnership(details, provider);
      // Explicit metadata contradictions can never be papered over by a playable URL.
      const declaredSeason = details.season_number ?? details.season;
      const declaredEpisode = details.episode_number ?? details.episodeNumber ?? details.number;
      if ((declaredSeason != null && Number(declaredSeason) !== season) ||
          (declaredEpisode != null && Number(declaredEpisode) !== episode)) return unavailable('PINNED_EPISODE_CONFLICT');
    }
    const candidates = [], seen = new Set();
    for (const row of candidateList(details)) {
      const candidate = candidateOf(row, provider);
      if (!candidate || seen.has(candidate.url)) continue;
      seen.add(candidate.url); candidates.push(candidate);
      if (candidates.length >= limit) break;
    }
    if (!candidates.length) return unavailable('PINNED_DIRECT_MEDIA_NOT_FOUND');
    const servers = [];
    for (const candidate of candidates) {
      // Native requirements cannot be silently promised by a browser player.
      if (platform === 'web' && !candidate.web_playable && Object.keys(candidate.headers).some(name => BLOCKED_HEADERS.test(name))) continue;
      let verified = platform === 'web' && candidate.web_playable;
      if (!verified) {
        let result;
        try { result = await probe(candidate, { platform, origin: browserOrigin }); } catch { continue; }
        verified = result?.playable === true && ['mp4', 'hls'].includes(result.container) &&
          [200, 206].includes(result.statusCode) && (platform === 'native' || result.webPlayable === true);
      }
      if (!verified) continue;
      servers.push({ ...candidate, ...(platform === 'web' ? { headers: {}, web_playable: true } : {}),
        series_ref: seriesRef, episode_ref: type === 'series' ? mediaRef : null, season, episode,
        ...(platform === 'web' ? { web_probe_basis: 'declared-or-response-headers' } : {}) });
    }
    if (!servers.length) return unavailable(platform === 'web' ? 'PINNED_DIRECT_WEB_UNAVAILABLE' : 'PINNED_DIRECT_MEDIA_UNAVAILABLE');
    return { ...base, status: 'success', servers, playback_unavailable: false, playback_reason: null };
  }
  return Object.freeze({ resolve });
}
