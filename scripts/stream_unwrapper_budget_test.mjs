import assert from 'node:assert/strict';
import { unwrapEmbedToDirectStreams } from '../server/scrapers/stream-unwrapper.mjs';

const originalFetch = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 302, headers: { Location: 'https://93.184.216.34/redirected-player' } });
  };
  const result = await unwrapEmbedToDirectStreams('https://93.184.216.34/player', 'https://qfilm.test/', {
    maxRequests: 1,
    maxDurationMs: 2000
  });
  assert.deepEqual(result, [], 'redirect beyond the shared request budget must not produce a player result');
  assert.equal(requests, 1, 'redirect hops count toward the total QFilm resolution request budget');
  console.log('stream unwrapper request budget: redirects are counted; over-budget hop was not fetched');
} finally {
  globalThis.fetch = originalFetch;
}
