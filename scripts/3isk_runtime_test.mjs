import assert from 'node:assert/strict';
import { create3iskRuntime } from '../server/3isk-runtime.mjs';
import { encode3iskRef } from '../server/providers/3isk.mjs';
import { createSupabaseProviderStore } from '../server/provider-store.mjs';

let clock = 1_790_000_000_000; let calls = 0; let fail = false;
const ref = encode3iskRef('https://3iskk.xyz/watch/episodes/demo/');
const rows = new Map(); const events = [];
const store = {
  get: async key => rows.get(key),
  put: async (key, payload, expiry) => rows.set(key, { payload, expires_at: new Date(expiry).toISOString() }),
  event: async (...args) => events.push(args),
  remove: async key => rows.delete(key),
  prune: async () => {},
};
const provider = { resolve: async () => {
  calls++; if (fail) throw new Error('3ISK_HTTP_403');
  const expiry = clock + 3600_000;
  return { status: 'success', playback_mode: 'direct', media_url: `https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=${calls}&expires=${expiry / 1000}`, expires_at: new Date(expiry).toISOString() };
} };
const runtime = create3iskRuntime({ provider, store, now: () => clock });
const [first, coalesced] = await Promise.all([runtime.details(ref), runtime.details(ref)]);
assert.equal(calls, 1); assert.equal(first.media_url, coalesced.media_url);
assert.equal((await runtime.details(ref)).cached, true); assert.equal(calls, 1);
const restarted = create3iskRuntime({ provider, store, now: () => clock });
assert.equal((await restarted.details(ref)).cached, true); assert.equal(calls, 1, 'Supabase cache survives runtime restart');
clock += 3540_001;
const renewed = await restarted.details(ref);
assert.equal(calls, 2); assert.notEqual(first.media_url, renewed.media_url);
assert.equal((await restarted.details(ref, { refresh: true })).cached, false); assert.equal(calls, 3);
fail = true;
await assert.rejects(restarted.details(ref, { refresh: true }), /403/);
assert.equal(rows.has(`playback:${ref}`), false, 'failed forced refresh must not retain revoked stream in durable cache');
assert.equal(events.at(-1)[1], 'failed');
fail = false;
const outage = create3iskRuntime({ provider, now: () => clock, store: { get() { throw new Error('offline'); }, put() { throw new Error('offline'); }, event() { throw new Error('offline'); }, prune() { throw new Error('offline'); } } });
assert.equal((await outage.details(ref)).playback_mode, 'direct'); assert.equal(outage.status().storage_error, 'SUPABASE_CACHE_UNAVAILABLE');
const writeFailure = create3iskRuntime({ provider, now: () => clock, store: { get: async () => null, put() { throw new Error('write denied'); }, event: async () => {}, prune: async () => {} } });
await writeFailure.details(ref);
assert.equal(writeFailure.status().storage_error, 'SUPABASE_CACHE_UNAVAILABLE', 'successful event logging must not hide a failed cache write');

const requests = [];
const adapter = createSupabaseProviderStore({ url: 'https://test.supabase.co', key: 'sb_secret_fixture', fetchImpl: async (url, init) => {
  requests.push({ url: new URL(url), init }); return init.method === 'GET' ? Response.json([]) : new Response(null, { status: 204 });
} });
await adapter.get(`playback:${ref}`, clock);
await adapter.put('key', { test: true }, clock + 1000, clock);
assert.equal(requests[0].url.searchParams.get('expires_at'), `gt.${new Date(clock).toISOString()}`);
assert.equal(requests[0].init.headers.apikey, 'sb_secret_fixture');
assert.equal(requests[0].init.headers.Authorization, undefined);
assert.equal(requests[1].init.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
assert.throws(() => createSupabaseProviderStore({ url: 'https://test.supabase.co', key: 'sb_publishable_test' }), /SERVER_KEY/);
console.log('3isk runtime: coalescing, durable cache, expiry, renewal and database outage passed');
