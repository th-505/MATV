import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMetadataHandler } from '../supabase/functions/matv-miravd-metadata/index.mjs';
const key = 'fixture-secret', hash = createHash('sha256').update(key).digest('hex');
let calls = 0;
const handler = createMetadataHandler({ tokenHash: hash, fetchImpl: async (url, options) => {
  calls++; assert.equal(url, 'https://miravd.com/embed-demo.html');
  assert.equal(options.headers.Referer, 'https://3iskk.xyz/embed/1/123/1/');
  assert.equal(options.headers['x-matv-resolver-key'], undefined);
  return new Response('sources:[{file:"https://s43.grzcdn.com/hls/master.m3u8"}]');
} });
const body = { player_url: 'https://miravd.com/embed-demo.html', wrapper_url: 'https://3iskk.xyz/embed/1/123/1/' };
const request = (token, payload = body) => new Request('https://worker.invalid', { method: 'POST',
  headers: { 'x-matv-resolver-key': token }, body: JSON.stringify(payload) });
assert.equal((await handler(request(''))).status, 401);
assert.equal((await handler(request('wrong'))).status, 401); assert.equal(calls, 0);
assert.equal((await handler(request(key, { ...body, player_url: 'http://127.0.0.1/private' }))).status, 400);
assert.equal(calls, 0);
const result = await (await handler(request(key))).json();
assert.equal(result.stream_url, 'https://s43.grzcdn.com/hls/master.m3u8');
assert.equal(result.headers.Referer, 'https://miravd.com/'); assert.equal(calls, 1);
console.log('metadata worker: mandatory custom auth, trusted sources, wrapper referer and JSON stream contract passed');
