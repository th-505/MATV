import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiscoveryCoordinator } from '../server/discovery-coordinator.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
test('deduplicates same title across different viewers', async () => {
  let calls = 0;
  const coordinator = createDiscoveryCoordinator({ discover: async () => { calls++; await sleep(20); return [{ source:'licensed' }]; } });
  coordinator.enqueue({ref:'tmdb:movie:123', title:'Example'});
  coordinator.enqueue({ref:'tmdb:movie:123', title:'Example'});
  await sleep(50);
  assert.equal(calls, 1);
  assert.equal(coordinator.status({ref:'tmdb:movie:123'}).state,'ready');
});
test('different episodes are distinct and bounded', async () => {
  let active = 0, peak = 0;
  const coordinator = createDiscoveryCoordinator({ maxConcurrent:2, discover: async () => {
    active++; peak = Math.max(peak,active); await sleep(15); active--; return [];
  }});
  for(let episode=1;episode<=6;episode++) coordinator.enqueue({ref:'tmdb:tv:99',season:1,episode});
  await sleep(110);
  assert.ok(peak<=2);
  assert.equal(coordinator.status({ref:'tmdb:tv:99',season:1,episode:6}).state,'ready');
});
test('rejects arbitrary URLs and invalid identifiers', () => {
  const coordinator=createDiscoveryCoordinator({discover:async()=>[]});
  assert.throws(()=>coordinator.enqueue({ref:'https://example.com/'}),/INVALID_TMDB_REF/);
});

test('expired discovery result is refreshed automatically', async () => {
  let clock = 1000;
  let calls = 0;
  const coordinator = createDiscoveryCoordinator({
    now: () => clock, ttlMs: 10,
    discover: async () => ++calls,
  });
  coordinator.enqueue({ ref:'tmdb:movie:123', title:'Example' });
  await sleep(20);
  assert.equal(calls, 1);
  clock = 1011;
  coordinator.enqueue({ ref:'tmdb:movie:123', title:'Example' });
  await sleep(20);
  assert.equal(calls, 2);
});

test('loads previously cached results instead of calling scrapers', async () => {
  let calls = 0;
  const coordinator = createDiscoveryCoordinator({
    now: () => 1000,
    load: async () => ({ payload:[{ provider:'licensed',url:'https://example.com/test.mp4' }],
      expires_at:new Date(5000).toISOString() }),
    discover: async () => { calls++; return []; },
  });
  coordinator.enqueue({ ref:'tmdb:movie:123', title:'Example' });
  await sleep(20);
  assert.equal(calls, 0);
  assert.equal(coordinator.status({ref:'tmdb:movie:123'}).result.length, 1);
});
