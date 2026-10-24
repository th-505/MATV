import assert from 'node:assert/strict';
import test from 'node:test';
import { createExplorationLibrary, createDiscoveryCoordinator } from '../server/discovery-coordinator.mjs';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup() {
  let clock = 1000;
  const store = new Map();
  const jobs = [];
  const library = createExplorationLibrary({ now: () => clock, idleMs: 100,
    loadUser: async user => structuredClone(store.get(user)),
    saveUser: async (user, rows) => { await tick(); store.set(user, structuredClone(rows)); },
    enqueue: input => jobs.push(input),
  });
  return { library, store, jobs, setClock: value => { clock = value; } };
}
const item = { provider: 'akwam', ref: 'akwam:example', title: 'Example' };
test('private lists share discovery identity without sharing owner or progress', async () => {
  const { library, jobs } = setup();
  await library.save('alice', item);
  assert.deepEqual(await library.list('bob'), []);
  await library.save('bob', item);
  await library.recordWatch('alice', { ...item, season: 2, episode: 4, position: 321,
    playedSeconds: 15, playing: true });
  const [alice] = await library.list('alice');
  const [bob] = await library.list('bob');
  assert.equal(alice.position, 321);
  assert.equal(bob.position, 0);
  assert.deepEqual(jobs[0], jobs[1]);
  assert.equal(jobs[0].userId, undefined);
});
test('visits, saving again, paused heartbeats and seeking do not renew idle deadline', async () => {
  const { library, setClock } = setup();
  await library.save('alice', item);
  setClock(1050);
  await library.save('alice', item);
  await library.recordWatch('alice', { ...item, position: 500, playedSeconds: 0, playing: true });
  await library.recordWatch('alice', { ...item, position: 500, playedSeconds: 20, playing: false });
  setClock(1100);
  const [entry] = await library.list('alice');
  assert.equal(entry.refreshNeeded, true);
  assert.equal(entry.position, 0);
  assert.equal(entry.lastWatchedAt, null);
  assert.equal(entry.title, 'Example');
});
test('actual playback renews retention and preserves exact source, season, episode and position', async () => {
  const { library, setClock } = setup();
  await library.save('alice', item);
  await library.save('alice', { ...item, provider: 'mycima' });
  setClock(1090);
  await library.recordWatch('alice', { ...item, season: 3, episode: 8, position: 25.5,
    playedSeconds: 12, playing: true });
  setClock(1150);
  const entries = await library.list('alice');
  assert.equal(entries[0].refreshNeeded, false);
  assert.equal(entries[0].provider, 'akwam');
  assert.equal(entries[0].season, 3);
  assert.equal(entries[0].episode, 8);
  assert.equal(entries[0].position, 25.5);
  assert.equal(entries[1].refreshNeeded, true);
  assert.equal(entries[1].lastWatchedAt, null);
  setClock(1190);
  assert.equal((await library.list('alice'))[0].refreshNeeded, true);
});
test('concurrent saves for one owner do not overwrite each other; deletion stays private', async () => {
  const { library } = setup();
  await Promise.all([library.save('alice', item), library.save('alice', { ...item, ref: 'akwam:second' })]);
  assert.equal((await library.list('alice')).length, 2);
  await library.save('bob', item);
  await library.remove('alice', item);
  assert.equal((await library.list('alice')).length, 1);
  assert.equal((await library.list('bob')).length, 1);
});
test('validation rejects missing identity, invalid progress', async () => {
  const { library } = setup();
  await assert.rejects(library.list(''), /AUTH_REQUIRED/);
  await assert.rejects(library.save('alice', { ...item, provider: '../akwam' }), /INVALID_EXPLORATION/);
  await library.save('alice', item);
  await assert.rejects(library.recordWatch('alice', { ...item, position: Infinity }), /INVALID_WATCH_PROGRESS/);
  await assert.rejects(library.recordWatch('alice', { ...item, episode: -1 }), /INVALID_WATCH_PROGRESS/);
  await assert.rejects(library.recordWatch('alice', { ...item, playedSeconds: 121 }), /INVALID_WATCH_PROGRESS/);
});
test('discovery jobs are deduplicated per provider and expired status cannot expose stale results', async () => {
  let clock = 10;
  const seen = [];
  const coordinator = createDiscoveryCoordinator({ now: () => clock, ttlMs: 10,
    discover: async input => { seen.push(input.provider); return []; } });
  const input = { ref: 'tmdb:tv:123', season: 1, episode: 2 };
  coordinator.enqueue({ ...input, provider: 'akwam' });
  coordinator.enqueue({ ...input, provider: 'mycima' });
  coordinator.enqueue({ ...input, provider: 'akwam' });
  await tick(); await tick();
  assert.deepEqual(seen.sort(), ['akwam', 'mycima']);
  clock = 20;
  assert.equal(coordinator.status({ ...input, provider: 'akwam' }).state, 'missing');
});
test('discovery validates limits and episode identity and bounds cached work', async () => {
  assert.throws(() => createDiscoveryCoordinator({ discover: async () => [], maxConcurrent: 0 }), /INVALID_DISCOVERY_LIMITS/);
  const coordinator = createDiscoveryCoordinator({ discover: async () => [], maxCached: 2 });
  assert.throws(() => coordinator.enqueue({ ref: 'tmdb:tv:1', season: -1 }), /INVALID_DISCOVERY_EPISODE/);
  for (const id of [1, 2, 3]) coordinator.enqueue({ ref: `tmdb:movie:${id}` });
  await tick(); await tick();
  assert.ok(coordinator.metrics().cached <= 2);
});
test('a zero-length waiting queue still permits immediate work', async () => {
  let release;
  const coordinator = createDiscoveryCoordinator({ maxConcurrent: 1, maxQueued: 0,
    discover: () => new Promise(resolve => { release = resolve; }) });
  assert.equal(coordinator.enqueue({ ref: 'tmdb:movie:1' }).state, 'running');
  assert.equal(coordinator.enqueue({ ref: 'tmdb:movie:2' }).state, 'busy');
  await tick(); release([]); await tick();
  assert.equal(coordinator.status({ ref: 'tmdb:movie:1' }).state, 'ready');
});
