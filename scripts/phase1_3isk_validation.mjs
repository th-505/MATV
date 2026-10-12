import assert from 'node:assert/strict';
import { assert3iskStream } from '../server/providers/3isk.mjs';

const base = new URL(process.argv[2]);
assert.equal(base.protocol, 'https:');
async function json(path) {
  const r = await fetch(new URL(path, base), { signal: AbortSignal.timeout(90_000) });
  assert.equal(r.status, 200, path.split('?')[0]);
  const data = await r.json(); assert.equal(data.status, 'success'); return data;
}
const results = [];
for (const category of ['3isk-latest', '3isk-turkish', '3isk-dubbed', '3isk-movies']) {
  const catalog = await json(`/api/v1/category?ref=${category}`);
  assert(catalog.data.length > 0);
  let ref = catalog.data[0].ref;
  let playback = await json(`/api/cinema/details?ref=${encodeURIComponent(ref)}&refresh=1`);
  if (playback.episodes?.length) {
    ref = playback.episodes[0].ref;
    playback = await json(`/api/cinema/details?ref=${encodeURIComponent(ref)}&refresh=1`);
  }
  assert.equal(playback.playback_mode, 'direct');
  assert(playback.playback_headers['User-Agent']);
  let url = assert3iskStream(playback.media_url).href;
  let segmentStatus;
  for (let depth = 0; depth < 4; depth++) {
    assert3iskStream(url);
    const r = await fetch(url, { headers: playback.playback_headers, signal: AbortSignal.timeout(30_000) });
    assert.equal(r.status, 200, `${category} manifest`);
    const body = await r.text(); assert(body.trimStart().startsWith('#EXTM3U'));
    const lines = body.split(/\r?\n/).map(line => line.trim());
    const variant = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
    if (variant >= 0) {
      url = new URL(lines.slice(variant + 1).find(line => line && !line.startsWith('#')), url).href;
      continue;
    }
    const segment = new URL(lines.find(line => line && !line.startsWith('#')), url);
    assert.equal(segment.origin, new URL(url).origin);
    const media = await fetch(segment, { headers: { ...playback.playback_headers, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30_000) });
    segmentStatus = media.status; assert([200, 206].includes(segmentStatus), `${category} segment`);
    const reader = media.body.getReader(); const chunk = await reader.read(); await reader.cancel();
    assert(chunk.value?.length > 0); break;
  }
  assert(segmentStatus, 'Missing media segment');
  const row = { category, count: catalog.data.length, title: catalog.data[0].title,
    host: new URL(playback.media_url).hostname, referer: playback.playback_headers.Referer,
    manifest_status: 200, segment_status: segmentStatus, direct: true };
  results.push(row); console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ passed: true, api: base.origin, results }));
