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

const EDGE_RESOLVER_BASE = 'https://matv-edge-resolver.dada1000100.workers.dev';

export async function resolvePlaybackUrl(ref, detailsData = null) {
  // 1. Direct media URL in detailsData if available
  if (detailsData) {
    const direct = detailsData.media_src || detailsData.media_url || detailsData.stream_url || detailsData.url;
    if (direct && typeof direct === 'string' && /^https?:\/\//i.test(direct)) {
      return {
        url: direct,
        format: /\.m3u8(?:$|\?)/i.test(direct) ? 'hls' : 'mp4',
        provider: detailsData.provider || 'سيرفر مباشر',
        sources: [{ name: 'سيرفر مباشر 1', url: direct }]
      };
    }
    if (Array.isArray(detailsData.media_sources) && detailsData.media_sources.length > 0) {
      const valid = detailsData.media_sources.filter(s => s && (s.url || s.media_path));
      if (valid.length > 0) {
        const first = valid[0];
        const u = first.url || first.media_path;
        return {
          url: u,
          format: first.media_type === 'm3u8' || /\.m3u8(?:$|\?)/i.test(u) ? 'hls' : 'mp4',
          provider: first.provider || 'سيرفر مباشر',
          sources: valid.map((s, idx) => ({
            name: s.label || s.quality || `سيرفر ${idx + 1}`,
            url: s.url || s.media_path,
            format: s.media_type
          }))
        };
      }
    }
  }

  // 2. Resolve via Cloudflare Edge Worker
  const targetRef = String(ref || detailsData?.ref || detailsData?.link || detailsData?.href || detailsData?.id || '').trim();
  if (targetRef) {
    try {
      let edgeUrl = `${EDGE_RESOLVER_BASE}/v1/resolve?ref=${encodeURIComponent(targetRef)}`;
      if (targetRef.startsWith('matchserver:')) {
        edgeUrl = `${EDGE_RESOLVER_BASE}/v1/matches/playback?ref=${encodeURIComponent(targetRef)}`;
      } else if (targetRef.startsWith('match:')) {
        edgeUrl = `${EDGE_RESOLVER_BASE}/v1/matches/resolve?ref=${encodeURIComponent(targetRef)}`;
      }

      const res = await fetch(edgeUrl, {
        headers: { 'Accept': 'application/json' },
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.sources) && json.sources.length > 0) {
          const playable = json.sources.filter(s => s.web_playable !== false && s.url && /^https?:\/\//i.test(s.url));
          const list = playable.length > 0 ? playable : json.sources;
          if (list.length > 0 && list[0].url) {
            return {
              url: list[0].url,
              format: list[0].format === 'hls' || /\.m3u8(?:$|\?)/i.test(list[0].url) ? 'hls' : 'mp4',
              provider: list[0].provider || list[0].provider_id || 'سيرفر مباشر',
              headers: list[0].headers || {},
              sources: list.map((s, idx) => ({
                name: s.quality ? `${s.provider || ''} ${s.quality}`.trim() : (s.provider || `سيرفر ${idx + 1}`),
                url: s.url,
                format: s.format,
                headers: s.headers || {}
              }))
            };
          }
        }
      }
    } catch (e) {
      console.warn('Edge resolution failed for:', targetRef, e);
    }
  }

  // 3. Fallback to directPlaybackUrl
  if (detailsData) {
    const legacy = directPlaybackUrl(detailsData);
    if (legacy) {
      return { url: legacy, format: 'hls', sources: [{ name: 'سيرفر مباشر', url: legacy }] };
    }
  }

  return null;
}

