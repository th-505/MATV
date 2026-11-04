export function directCandidate(server) {
  if (server?.kind === 'embed' || server?.type === 'embed' || server?.streamType === 'embed') return false;
  try {
    const u = new URL(server?.url || '');
    return u.protocol === 'https:' && /\.(mp4|m3u8)$/i.test(u.pathname);
  } catch { return false; }
}
