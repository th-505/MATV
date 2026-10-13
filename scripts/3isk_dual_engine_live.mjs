import assert from 'node:assert/strict';
import { createServer } from '../server/app.mjs';
import { create3iskRuntime } from '../server/3isk-runtime.mjs';
import { encode3iskRef, assert3iskStream, unpack3iskPlayer } from '../server/providers/3isk.mjs';

let server;
let base = process.argv[2];
if (!base) {
  server = createServer({ iskRuntime: create3iskRuntime({ store: null }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const results = [];
try {
  for (const [extractor, path] of [
    ['ukrcdn', '/watch/episodes/serie-teskilat-season-1-episode-187/'],
    ['miravd', '/watch/movies/movie-sari-zarflar-2026/'],
  ]) {
    const ref = encode3iskRef('https://3iskk.xyz' + path);
    const response = await fetch(new URL(`/api/v1/3isk/resolve?ref=${encodeURIComponent(ref)}&refresh=1`, base), { signal: AbortSignal.timeout(90_000) });
    const body = await response.json();
    if (response.status !== 200) {
      results.push({ extractor, api_status: response.status, message: body.message, passed: false });
      continue;
    }
    assert.equal(body.extractor, extractor);
    const resolutionMode = body.playback_mode;
    if (extractor === 'miravd') {
      assert.equal(resolutionMode, 'client_resolve');
      assert.equal(body.player_type, 'miravd');
      assert.equal(body.iframe_url, body.resolver_url);
      assert.equal(body.resolver_headers.Referer, body.wrapper_url);
      const player = new URL(body.iframe_url);
      assert.equal(player.origin, 'https://miravd.com');
      assert(/^\/embed-[a-zA-Z0-9]+\.html$/.test(player.pathname));
      const response = await fetch(player, {headers:body.resolver_headers, redirect:'error', signal:AbortSignal.timeout(30_000)});
      assert.equal(response.status, 200);
      const unpacked = unpack3iskPlayer(await response.text());
      body.stream_url = unpacked.match(/https:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/)?.[0];
      assert3iskStream(body.stream_url);
      body.media_url = body.stream_url;
      body.headers = body.playback_headers = {Referer:'https://miravd.com/', 'User-Agent':body.resolver_headers['User-Agent']};
    }
    assert.equal(body.stream_url, body.media_url);
    assert.deepEqual(body.headers, body.playback_headers);
    if (extractor === 'ukrcdn') assert.equal(body.resolver_url, undefined);
    let url = assert3iskStream(body.stream_url);
    assert.equal(body.headers.Referer, extractor === 'miravd' ? 'https://miravd.com/' : url.origin + '/');
    let segmentStatus;
    for (let depth = 0; depth < 4; depth++) {
      assert3iskStream(url.href);
      const manifest = await fetch(url, { headers: body.headers, signal: AbortSignal.timeout(30_000) });
      assert.equal(manifest.status, 200);
      const text = await manifest.text(); assert(text.trimStart().startsWith('#EXTM3U'));
      const lines = text.split(/\r?\n/).map(value => value.trim());
      const variant = lines.findIndex(value => value.startsWith('#EXT-X-STREAM-INF:'));
      if (variant >= 0) {
        url = new URL(lines.slice(variant + 1).find(value => value && !value.startsWith('#')), url);
        continue;
      }
      const segment = new URL(lines.find(value => value && !value.startsWith('#')), url);
      assert.equal(segment.origin, url.origin);
      const media = await fetch(segment, { headers: { ...body.headers, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30_000) });
      segmentStatus = media.status; assert([200, 206].includes(segmentStatus));
      const reader = media.body.getReader(); const data = await reader.read(); await reader.cancel();
      assert(data.value?.length); break;
    }
    assert(segmentStatus);
    results.push({ extractor, resolution_mode: resolutionMode, api_status: 200, stream_host: new URL(body.stream_url).hostname,
      referer: body.headers.Referer, manifest_status: 200, segment_status: segmentStatus, passed: true });
  }
  console.log(JSON.stringify({ location: server ? 'workspace-server' : new URL(base).origin, results,
    passed: results.every(result => result.passed) }));
  if (!results.every(result => result.passed)) process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
}
