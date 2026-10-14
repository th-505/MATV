import assert from 'node:assert/strict';
import { FallbackPlaybackRuntime } from '../server/fallback-runtime.mjs';
const runtime = new FallbackPlaybackRuntime();
assert.equal(runtime.status().configured, false);
assert.equal(runtime.status().providers, 0);
assert.equal(runtime.status().media_proxy, false);
for (const identity of [{tmdbId:1396,type:'tv',season:1,episode:1},{tmdbId:42,type:'movie'}]) {
  const result=runtime.resolve(identity);
  assert.equal(result.status,'unavailable');
  assert.equal(result.data.playback_unavailable,true);
  assert.deepEqual(result.data.media_sources,[]);
  assert.equal(result.data.ref,undefined);
  assert.equal(result.data.media_type,undefined);
  assert(!JSON.stringify(result).includes('https://'));
}
assert.throws(()=>runtime.resolve({tmdbId:'1;evil',type:'movie'}),/INVALID_TMDB_ID/);
assert.throws(()=>runtime.resolve({tmdbId:10,type:'tv',season:0,episode:1}),/INVALID_SEASON/);
let calls=0;
await assert.rejects(()=>runtime.openDirectMedia('any',{range:'bytes=0-',fetchImpl:async()=>{calls++;}}),/MEDIA_PROXY_RETIRED/);
await assert.rejects(()=>runtime.probe('any',{fetchImpl:async()=>{calls++;}}),/EMBEDDED_FALLBACK_DISABLED/);
assert.equal(calls,0);
for(const operation of ['inspect','next','recordFailure','recordSuccess']) assert.throws(()=>runtime[operation]('any'),/EMBEDDED_FALLBACK_DISABLED/);
console.log('fallback_runtime_test: embedded playback disabled; no cloud media fetch');
