import assert from 'node:assert/strict';
import { createServer, createIntegratedContentRuntime } from '../server/app.mjs';
import { create3iskRuntime } from '../server/3isk-runtime.mjs';
import { encode3iskRef } from '../server/providers/3isk.mjs';
import { directPlaybackUrl } from '../web/core/direct-playback.js';

const episodeRef = encode3iskRef('https://3iskk.xyz/watch/episodes/demo/');
const seriesRef = encode3iskRef('https://3iskk.xyz/watch/tvshows/demo/');
const expiry = Date.now() + 3600_000;
const stream = `https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=fixture&expires=${Math.floor(expiry / 1000)}`;
const movieRef = encode3iskRef('https://3iskk.xyz/watch/movies/demo/');
let resolutions = 0;
const provider = {
  category: async () => ({ status: 'success', source: '3isk', data: [{ title: 'عمل', ref: seriesRef, is_series: true, source: '3isk' }] }),
  search: async () => ({ status: 'success', source: '3isk', data: [{ title: 'عمل', ref: seriesRef, is_series: true, source: '3isk' }] }),
  details: async () => ({ status: 'success', source: '3isk', episodes: [{ ref: episodeRef, num: 1 }] }),
  resolve: async ref => { if (ref === movieRef) return {status:'success', playback_mode:'client_resolve', player_type:'miravd', iframe_url:'https://miravd.com/embed-fixture.html', resolver_url:'https://miravd.com/embed-fixture.html', wrapper_url:'https://3iskk.xyz/embed/1/12345/1/', resolver_headers:{Referer:'https://3iskk.xyz/embed/1/12345/1/', 'User-Agent':'fixture-UA'}}; resolutions++; return { status: 'success', source: '3isk', playback_mode: 'direct', stream_url: stream, headers: { Referer: 'https://s1.ukrcdn.xyz/', 'User-Agent': 'fixture-UA' }, playback_headers: { Referer: 'https://s1.ukrcdn.xyz/', 'User-Agent': 'fixture-UA' }, media_url: stream, media_path: stream, media_type: 'm3u8', expires_at: new Date(Math.floor(expiry / 1000) * 1000).toISOString(), download_available: false }; },
};
const iskRuntime = create3iskRuntime({ provider, store: null });
const integrated = createIntegratedContentRuntime(iskRuntime, {
  searchCatalog: async () => { throw new Error('Akoam unavailable'); },
  fetchCategory: async () => ({ status: 'success', data: [] }),
  fetchMatches: async () => ({ data: [] }),
});
assert.equal((await integrated.search('عمل')).data[0].source, '3isk');
const server = createServer({ iskRuntime, runtimeService: integrated });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const category = await (await fetch(`${base}/api/v1/category?ref=3isk-dubbed`)).json();
  assert.equal(category.kind, 'category'); assert.equal(category.data[0].ref, seriesRef);
  const providers = await (await fetch(`${base}/api/v1/providers`)).json();
  assert.equal(providers.data[1].playback_mode, 'direct');
  const response = await fetch(`${base}/api/cinema/details?ref=${encodeURIComponent(episodeRef)}`, { headers: { Origin: 'https://th-505.github.io' } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://th-505.github.io');
  assert.match(response.headers.get('cache-control'), /no-store/);
  const payload = await response.json();
  assert.equal(payload.media_url, stream); assert.equal(payload.playback_mode, 'direct');
  assert.equal(directPlaybackUrl(payload), stream);
  assert.equal(directPlaybackUrl({ ...payload, media_url: 'https://evil.example/hls/master.m3u8' }), '');
  assert.equal(directPlaybackUrl(payload, expiry + 1), '');
  await fetch(`${base}/api/cinema/details?ref=${encodeURIComponent(episodeRef)}&refresh=1`);
  assert.equal(resolutions, 2);
  const strict = await (await fetch(`${base}/api/v1/3isk/resolve?ref=${encodeURIComponent(episodeRef)}`)).json();
  assert.equal(strict.stream_url, stream); assert.deepEqual(strict.headers, strict.playback_headers);
  assert.equal(strict.resolver_url, undefined);
  const handoffResponse = await fetch(`${base}/api/v1/3isk/resolve?ref=${encodeURIComponent(movieRef)}`);
  assert.equal(handoffResponse.status, 200);
  const handoff = await handoffResponse.json();
  assert.equal(handoff.playback_unavailable, true);
  assert.equal(handoff.playback_reason, 'EDGE_DIRECT_RESOLUTION_REQUIRED');
  assert.equal(handoff.playback_mode, undefined);
  assert.equal(handoff.player_type, undefined);
  assert.equal(handoff.iframe_url, undefined);
  assert.equal(handoff.resolver_url, undefined);
  assert.equal(handoff.stream_url, undefined);
  assert.equal(handoff.resolver_headers, undefined);
  assert.equal(handoff.wrapper_url, undefined);
  assert.equal((await fetch(`${base}/api/v1/3isk/resolve?ref=${encodeURIComponent(seriesRef)}`)).status, 400);
  assert.equal((await fetch(`${base}/api/cinema/details?ref=3isk:!!!`)).status, 400);
  assert.equal((await fetch(`${base}/hls/demo/master.m3u8`)).status, 404, 'no video relay endpoint is installed');
  assert.equal((await fetch(`${base}/api/v1/3isk/status`, { method: 'POST' })).status, 405);
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('3isk HTTP: categories, search isolation, direct contract, CORS and refresh passed');
