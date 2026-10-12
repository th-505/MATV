export function directPlaybackUrl(data, now = Date.now()) {
  if (data?.playback_mode !== 'direct') return '';
  try {
    const url = new URL(data.media_url || data.media_path);
    const miravd = /^s\d+\.grzcdn\.com$/.test(url.hostname);
    const expires = miravd ? Date.parse(data.expires_at) : Number(url.searchParams.get('expires')) * 1000;
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(miravd || /^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$/i.test(url.hostname)) ||
      !url.pathname.startsWith('/hls/') || !/\.(m3u8|mp4)$/.test(url.pathname) ||
      (!miravd && !url.searchParams.get('token')) || !Number.isSafeInteger(expires) || expires <= now + 30_000) return '';
    return url.href;
  } catch { return ''; }
}
