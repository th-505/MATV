import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseExplorationStore } from '../server/exploration-store.mjs';
import { createExplorationLibrary } from '../server/discovery-coordinator.mjs';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const url = 'https://example.supabase.co';
const key = 'sb_secret_server-only';
const entry = { provider: 'akwam', ref: 'akwam:test', title: 'Example', savedAt: 1000,
  lastWatchedAt: null, season: 0, episode: 0, position: 0 };
function fixture() {
  const rows = new Map(); const calls = []; let revision = 0;
  const fetchImpl = async (target, options) => {
    const parsed = new URL(target); calls.push({ target: parsed, options });
    const token = options.headers.Authorization;
    const owner = token === 'Bearer alice-token' ? alice : token === 'Bearer bob-token' ? bob : null;
    if (!owner) return Response.json({ error: 'invalid' }, { status: 401 });
    if (parsed.pathname === '/auth/v1/user') return Response.json({ id: owner, email: 'private@example.com' });
    const params = parsed.searchParams;
    if (options.method === 'GET') return Response.json([...rows.values()].filter(row =>
      row.user_id === owner && row.user_id === params.get('user_id').slice(3) && row.kind === params.get('kind').slice(3)));
    const body = JSON.parse(options.body);
    if (options.method === 'POST') {
      assert.equal(body.user_id, owner);
      const identity = JSON.stringify([owner, body.kind, body.item_key]);
      if (rows.has(identity)) return Response.json({ error: 'duplicate' }, { status: 409 });
      const row = { ...body, sync_revision: ++revision }; rows.set(identity, row);
      return Response.json([row], { status: 201 });
    }
    assert.equal(options.method, 'PATCH');
    const identity = JSON.stringify([owner, params.get('kind').slice(3), params.get('item_key').slice(3)]);
    const previous = rows.get(identity);
    if (!previous || String(previous.sync_revision) !== params.get('sync_revision').slice(3)) return Response.json([]);
    const row = { ...previous, ...body, sync_revision: ++revision }; rows.set(identity, row);
    return Response.json([row]);
  };
  const store = createSupabaseExplorationStore({ enabled: true, url, key, fetchImpl, now: () => 2000 });
  return { store, rows, calls };
}
test('rollout is disabled by default and absent credentials remain unconfigured', async () => {
  const disabled = createSupabaseExplorationStore({ enabled: false, url, key, fetchImpl: () => assert.fail() });
  assert.equal(disabled.configured, false);
  await assert.rejects(disabled.authenticate('Bearer alice-token'), /EXPLORATION_DISABLED/);
  const missing = createSupabaseExplorationStore({ enabled: true, url: '', key: '' });
  assert.equal(missing.configured, false);
  await assert.rejects(missing.authenticate('Bearer alice-token'), /EXPLORATION_NOT_CONFIGURED/);
  assert.throws(() => createSupabaseExplorationStore({ enabled: true, url, key: 'sb_publishable_public' }), /SERVER_KEY_REQUIRED/);
  assert.throws(() => createSupabaseExplorationStore({ enabled: true, url, key, kind: 'history' }), /BAD_KIND/);
});
test('auth requires remotely verified Bearer identity and ignores caller owner claims', async () => {
  const { store, calls } = fixture();
  for (const value of ['', 'Basic x', 'Bearer bad token', 'Bearer invalid']) await assert.rejects(store.authenticate(value), /AUTH_REQUIRED/);
  const session = await store.authenticate('Bearer alice-token');
  assert.equal(session.userId, alice);
  assert.equal(session.email, undefined);
  await assert.rejects(session.loadUser(bob), /OWNER_MISMATCH/);
  await assert.rejects(session.saveUser(bob, []), /OWNER_MISMATCH/);
  await session.loadUser(alice);
  const auth = calls.find(call => call.target.pathname === '/auth/v1/user' && call.options.headers.Authorization === 'Bearer alice-token');
  assert.equal(auth.options.headers.apikey, key);
  assert.equal(auth.options.headers.Authorization, 'Bearer alice-token');
  assert.equal(auth.options.redirect, 'error');
  assert.ok(auth.options.signal instanceof AbortSignal);
  const read = calls.find(call => call.target.pathname.startsWith('/rest/'));
  assert.equal(read.target.searchParams.get('user_id'), 'eq.' + alice);
  assert.equal(read.target.searchParams.get('kind'), 'eq.exploration');
  assert.equal(read.target.searchParams.get('item_key'), 'like.tatv:exploration:*');
});
test('owners are isolated and unapproved fields never enter metadata', async () => {
  const { store, calls } = fixture();
  const a = await store.authenticate('Bearer alice-token');
  const b = await store.authenticate('Bearer bob-token');
  await a.loadUser(alice);
  await a.saveUser(alice, [{ ...entry, headers: { Authorization: 'secret' }, url: 'https://cdn.example/test.mp4', user_id: bob }]);
  assert.deepEqual(await b.loadUser(bob), []);
  const [loaded] = await a.loadUser(alice);
  assert.equal(loaded.ref, entry.ref);
  assert.equal(loaded.url, undefined);
  const posted = JSON.parse(calls.find(call => call.options.method === 'POST').options.body);
  assert.equal(posted.user_id, alice);
  assert.equal(posted.kind, 'exploration');
  assert.equal(posted.metadata.library, 'exploration');
  assert.equal(posted.metadata.headers, undefined);
  assert.equal(posted.metadata.url, undefined);
  assert.ok(!JSON.stringify(loaded).includes('alice-token'));
});
test('deletions use tombstones and restore through revision-checked updates', async () => {
  const { store, rows, calls } = fixture();
  const session = await store.authenticate('Bearer alice-token');
  await session.loadUser(alice); await session.saveUser(alice, [entry]);
  await session.loadUser(alice); await session.saveUser(alice, []);
  assert.equal([...rows.values()][0].deleted, true);
  assert.deepEqual(await session.loadUser(alice), []);
  await session.saveUser(alice, [entry]);
  assert.equal([...rows.values()][0].deleted, false);
  assert.equal(calls.filter(call => call.options.method === 'DELETE').length, 0);
});
test('same-row concurrent updates conflict instead of silently losing progress', async () => {
  const { store } = fixture();
  const a = await store.authenticate('Bearer alice-token');
  await a.loadUser(alice); await a.saveUser(alice, [entry]);
  const b = await store.authenticate('Bearer alice-token');
  await a.loadUser(alice); await b.loadUser(alice);
  await a.saveUser(alice, [{ ...entry, position: 20, lastWatchedAt: 2000 }]);
  await assert.rejects(b.saveUser(alice, [{ ...entry, position: 10, lastWatchedAt: 1500 }]), /STORE_CONFLICT/);
  assert.equal((await a.loadUser(alice))[0].position, 20);
});
test('concurrent inserts of different works are preserved; duplicate inserts conflict', async () => {
  const { store } = fixture();
  const a = await store.authenticate('Bearer alice-token');
  const b = await store.authenticate('Bearer alice-token');
  await a.loadUser(alice); await b.loadUser(alice);
  await a.saveUser(alice, [entry]);
  await b.saveUser(alice, [{ ...entry, ref: 'akwam:other' }]);
  assert.equal((await a.loadUser(alice)).length, 2);
  const c = await store.authenticate('Bearer alice-token');
  const d = await store.authenticate('Bearer alice-token');
  await c.loadUser(alice); await d.loadUser(alice);
  const next = { ...entry, ref: 'akwam:third' };
  await c.saveUser(alice, [...await c.loadUser(alice), next]);
  await assert.rejects(d.saveUser(alice, [entry, { ...entry, ref: 'akwam:other' }, next]), /STORE_CONFLICT/);
});
test('library service persists exact progress with verified session adapters', async () => {
  const { store } = fixture();
  const session = await store.authenticate('Bearer alice-token');
  const library = createExplorationLibrary({ loadUser: session.loadUser, saveUser: session.saveUser, now: () => 2000 });
  await library.save(session.userId, entry);
  await library.recordWatch(session.userId, { ...entry, season: 2, episode: 4, position: 42, playedSeconds: 15, playing: true });
  const nextRequest = await store.authenticate('Bearer alice-token');
  assert.equal((await nextRequest.loadUser(alice))[0].position, 42);
});
test('invalid URLs, auth outages, timeouts and storage errors expose no response secrets', async () => {
  for (const bad of ['http://example.supabase.co', 'https://example.supabase.co/x', 'https://example.supabase.co/?x=1', 'https://other.example'])
    assert.throws(() => createSupabaseExplorationStore({ enabled: true, url: bad, key }), /SUPABASE_BAD_URL/);
  const run = fetchImpl => createSupabaseExplorationStore({ enabled: true, url, key, fetchImpl });
  await assert.rejects(run(async () => Response.json({ secret: key }, { status: 503 })).authenticate('Bearer alice-token'), /AUTH_UNAVAILABLE/);
  await assert.rejects(run(async () => { throw new DOMException('secret signed-url', 'TimeoutError'); }).authenticate('Bearer alice-token'), error => error.message === 'EXPLORATION_STORE_TIMEOUT');
  const store = run(async target => new URL(target).pathname.startsWith('/auth/') ? Response.json({ id: alice }) : Response.json({ secret: key }, { status: 400 }));
  const session = await store.authenticate('Bearer alice-token');
  await assert.rejects(session.loadUser(alice), error => error.message === 'EXPLORATION_STORE_HTTP_400');
  await assert.rejects(session.saveUser(alice, []), /LOAD_REQUIRED/);
});
test('wrong-owner database rows are rejected even after successful authentication', async () => {
  const store = createSupabaseExplorationStore({ enabled: true, url, key, fetchImpl: async target =>
    new URL(target).pathname.startsWith('/auth/') ? Response.json({ id: alice }) : Response.json([{ user_id: bob, kind: 'exploration', item_key: 'tatv:exploration:x' }]) });
  const session = await store.authenticate('Bearer alice-token');
  await assert.rejects(session.loadUser(alice), /SCOPE_MISMATCH/);
});
