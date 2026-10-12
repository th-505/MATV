export const ISK_ORIGIN = 'https://3iskk.xyz';
export const ISK_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function assert3iskStream(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !(/^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$/i.test(url.hostname) || /^s\d+\.grzcdn\.com$/i.test(url.hostname)) || url.port || url.username || url.password || !url.pathname.startsWith('/hls/') || !/\.(m3u8|mp4)$/.test(url.pathname)) throw new Error('3ISK_BAD_STREAM');
  return url;
}

export function findPlayerStream(html) {
  const values = (html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/g) || []).filter(value => {
    try { assert3iskStream(value); return true; } catch { return false; }
  });
  return values.find(value => new URL(value).pathname.endsWith('/master.m3u8')) || values[0];
}

export function playbackResult(stream, extractor, now) {
  if (!stream) throw new Error('3ISK_STREAM_NOT_FOUND');
  const url = assert3iskStream(stream);
  const miravd = extractor === 'miravd';
  if (miravd !== /^s\d+\.grzcdn\.com$/.test(url.hostname)) throw new Error('3ISK_BAD_STREAM');
  const expires = miravd ? now() + 5 * 60_000 : Number(url.searchParams.get('expires')) * 1000;
  if ((!miravd && !url.searchParams.get('token')) || !Number.isSafeInteger(expires) || expires <= now() + 60_000) throw new Error('3ISK_STREAM_EXPIRED');
  const headers = { Referer: miravd ? 'https://miravd.com/' : url.origin + '/', 'User-Agent': ISK_UA };
  return { extractor, playback_mode: 'direct', stream_url: url.href, headers,
    media_url: url.href, media_path: url.href, playback_headers: headers,
    media_type: url.pathname.endsWith('.mp4') ? 'mp4' : 'm3u8',
    expires_at: new Date(expires).toISOString(), download_available: false };
}
