import assert from 'node:assert/strict';
import { FallbackProviderPool, buildFallbackProviderUrl, fallbackProviderCount, listFallbackProviders } from '../server/fallback-providers.mjs';
assert.equal(fallbackProviderCount(),0);assert.deepEqual(listFallbackProviders(),[]);
assert.throws(()=>buildFallbackProviderUrl('vidlink',{tmdbId:42,type:'movie'}),/EMBEDDED_FALLBACK_DISABLED/);
const pool=new FallbackProviderPool();assert.deepEqual(pool.ranked(),[]);
assert.throws(()=>pool.recordPlaybackSuccess('any'),/EMBEDDED_FALLBACK_DISABLED/);
assert.throws(()=>pool.recordPlaybackFailure('any'),/EMBEDDED_FALLBACK_DISABLED/);
console.log('Fallback registry: unverified third-party embedded players removed');
