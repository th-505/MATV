import assert from 'node:assert/strict';
import { FallbackProviderPool, buildFallbackProviderUrl, fallbackProviderCount, listFallbackProviders,
  registerVerifiedFallbackProvider, resolveFallbackStreams } from '../server/fallback-providers.mjs';
assert.equal(fallbackProviderCount(),0);assert.deepEqual(listFallbackProviders(),[]);
assert.throws(()=>buildFallbackProviderUrl('vidlink'),/NO_VERIFIED_DIRECT_PROVIDER/);
assert.throws(()=>registerVerifiedFallbackProvider({id:'unverified',resolve:async()=>({})}),/FALLBACK_PROVIDER_NOT_VERIFIED/);
const pool=new FallbackProviderPool();assert.deepEqual(pool.ranked(),[]);
assert.deepEqual(await resolveFallbackStreams('missing',{}),{status:'unavailable',source:'missing',data:{playback_unavailable:true,media_sources:[]}});
registerVerifiedFallbackProvider({id:'fixture',verified:true,resolve:async()=>({media_sources:[
  {url:'https://media.example/verified.mp4',kind:'direct',verified:true},
  {url:'https://media.example/unverified.mp4',kind:'direct',verified:false},
  {url:'https://media.example/player',kind:'embed',verified:true},
  {url:'https://media.example/player?name=.mp4',kind:'direct',verified:true},
]})});
assert.equal(fallbackProviderCount(),1);
assert.equal((await resolveFallbackStreams('fixture',{})).data.media_sources.length,1);
console.log('Fallback registry: verified direct providers only; absent/embedded/unverified sources rejected');
