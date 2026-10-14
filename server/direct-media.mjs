// Cloud services only inspect response headers. Video bodies belong to devices.
const BROWSER_ORIGIN = 'https://th-505.github.io';
const WEB_FORMATS = new Set(['hls', 'mp4', 'webm']);
const FORMATS = new Map([
  ['.m3u8', 'hls'], ['.mp4', 'mp4'], ['.mpd', 'dash'],
  ['.mkv', 'matroska'], ['.webm', 'webm'], ['.ts', 'mpeg-ts'], ['.m2ts', 'mpeg-ts'],
]);

export function directFormat(value) {
  const path = new URL(value).pathname.toLowerCase();
  return [...FORMATS].find(([extension]) => path.endsWith(extension))?.[1] || 'unknown';
}

function contentFormat(type, url) {
  const mime = String(type || '').split(';')[0].trim().toLowerCase();
  if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'application/json') return 'unknown';
  if (/mpegurl/.test(mime)) return 'hls';
  if (mime === 'application/dash+xml') return 'dash';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/webm') return 'webm';
  if (/matroska/.test(mime)) return 'matroska';
  if (mime === 'video/mp2t' || mime === 'video/mpeg') return 'mpeg-ts';
  return directFormat(url);
}

export async function probeDirectMedia(value, headers, {
  validateUrl,
  fetchImpl = globalThis.fetch,
  browser = false,
} = {}) {
  if (typeof validateUrl !== 'function') throw Error('MEDIA_URL_VALIDATOR_REQUIRED');
  let target = validateUrl(value);
  if (directFormat(target) === 'unknown') throw Error('EXPECTED_DIRECT_MEDIA_URL');
  const requestHeaders = browser
    ? { Origin: BROWSER_ORIGIN, Referer: BROWSER_ORIGIN + '/', 'User-Agent': headers['User-Agent'] }
    : headers;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(target, {
      method: 'HEAD', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(5000), headers: requestHeaders,
    });
    // Never read a video body, including bodies incorrectly sent in HEAD replies.
    await response.body?.cancel();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3 || !response.headers.get('location')) throw Error('MEDIA_REDIRECT_LIMIT');
      target = validateUrl(new URL(response.headers.get('location'), target).href);
      if (directFormat(target) === 'unknown') throw Error('EXPECTED_DIRECT_MEDIA_URL');
      continue;
    }
    const kind = contentFormat(response.headers.get('content-type'), target);
    const acao = response.headers.get('access-control-allow-origin');
    return {
      url: target.href || String(target), status: response.status, kind,
      playable: response.ok && kind !== 'unknown',
      webPlayable: browser && response.ok && WEB_FORMATS.has(kind) && (acao === '*' || acao === BROWSER_ORIGIN),
      contentType: response.headers.get('content-type') || '',
    };
  }
  throw Error('MEDIA_REDIRECT_LIMIT');
}

export function streamExpiry(url, now = Date.now()) {
  const u = new URL(url);
  const seconds = Number(u.searchParams.get('expires'));
  const hex = u.searchParams.get('txTime');
  return Math.min(now + 240000,
    seconds > 0 ? seconds * 1000 : Infinity,
    hex && /^[a-f0-9]+$/i.test(hex) ? parseInt(hex, 16) * 1000 : Infinity);
}

export function directSource(url, headers, { kind = directFormat(url), label = 'تلقائي', webPlayable = false } = {}) {
  if (kind === 'unknown') throw Error('EXPECTED_DIRECT_MEDIA_URL');
  const expires = streamExpiry(url);
  if (expires <= Date.now() + 30000) throw Error('STREAM_EXPIRED');
  return {
    media_path: url, media_url: url, stream_url: url,
    media_type: kind === 'hls' ? 'm3u8' : kind,
    playback_mode: 'direct', headers: { ...headers }, playback_headers: { ...headers },
    expires_at: new Date(expires).toISOString(),
    label, web_playable: webPlayable,
  };
}

export function filterBrowserSources(data) {
  const sources = (data.media_sources || [data]).filter(s => {
    const format = String(s.format || s.media_type || '').toLowerCase();
    return s.web_playable === true && WEB_FORMATS.has(format === 'm3u8' ? 'hls' : format);
  });
  if (sources.length) return { ...data, ...sources[0], media_sources: sources, download_available: false };
  const result = { ...data };
  for (const key of ['media_path', 'media_url', 'media_src', 'stream_url', 'headers', 'playback_headers', 'iframe_url', 'resolver_url', 'resolver_headers', 'wrapper_url']) delete result[key];
  return { ...result, media_sources: [], download_available: false,
    playback_unavailable: true, playback_reason: 'DIRECT_WEB_CORS_UNAVAILABLE' };
}
