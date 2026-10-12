// Run against the actual public service after its deploy becomes live.
import assert from 'node:assert/strict';
import { encode3iskRef, assert3iskStream } from '../server/providers/3isk.mjs';

const base = new URL(process.argv[2] || '');
assert.equal(base.protocol, 'https:');
assert(!base.username && !base.password && !base.search && !base.hash && base.pathname === '/');
async function json(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(90_000) });
  assert.equal(response.status, 200, `Deployment route failed: ${path.split('?')[0]}`);
  return response.json();
}
console.log('Checking public health...');
assert.equal((await json('/health')).status, 'ok');
console.log('Checking live catalog...');
const catalog = await json('/api/v1/category?ref=3isk-turkish&p=1');
assert(catalog.data.length > 0);
const episodeRef = encode3iskRef('https://3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/');
console.log('Resolving a fresh token from the deployment network...');
const playback = await json(`/api/cinema/details?ref=${encodeURIComponent(episodeRef)}&refresh=1`);
assert.equal(playback.playback_mode, 'direct');
let url = assert3iskStream(playback.media_url).href;
assert(Date.parse(playback.expires_at) > Date.now() + 60_000);
const status = await json('/api/v1/3isk/status');
assert.equal(status.storage, 'supabase'); assert.equal(status.storage_error, null);
const again = await json(`/api/cinema/details?ref=${encodeURIComponent(episodeRef)}`);
assert.equal(again.cached, true); assert.equal(again.media_url, playback.media_url);
console.log('Checking HLS from outside the deployment network...');
let segmentStatus;
for (let depth = 0; depth < 4; depth++) {
  assert3iskStream(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const body = await response.text(); assert(body.trimStart().startsWith('#EXTM3U'));
  const lines = body.split(/\r?\n/).map(line => line.trim());
  const variant = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
  if (variant >= 0) {
    url = new URL(lines.slice(variant + 1).find(line => line && !line.startsWith('#')), url).href;
    continue;
  }
  const segmentUrl = new URL(lines.find(line => line && !line.startsWith('#')), url);
  assert.equal(segmentUrl.origin, new URL(url).origin);
  const segment = await fetch(segmentUrl, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30_000) });
  segmentStatus = segment.status; assert([200, 206].includes(segmentStatus));
  const reader = segment.body.getReader(); const chunk = await reader.read(); await reader.cancel();
  assert(chunk.value?.length > 0);
  break;
}
assert(segmentStatus, 'No media segment found');
console.log(JSON.stringify({ passed: true, api_base: base.origin, catalog_count: catalog.data.length, playback_mode: playback.playback_mode,
  storage: status.storage, cached: again.cached, stream_host: new URL(playback.media_url).hostname, expires_at: playback.expires_at, segment_status: segmentStatus }));
