import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createTmdbRuntime } from '../server/tmdb-runtime.mjs';
import { createMitvRuntimeServer } from '../server/index-runtime.mjs';

const calls = [];
const key = 'fixture-server-only-key';
const runtime = createTmdbRuntime({ apiKey: key, backupApiKey: '', bearerToken: '',
  fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ results: [{ id: 7, title: 'Fixture' }] }));
  } });
const [a, b] = await Promise.all([
  runtime.catalog('/movie/popular', { page: 1, language: 'ar-SA' }),
  runtime.catalog('/movie/popular', { language: 'ar-SA', page: '1' }),
]);
assert.equal(calls.length, 1, 'canonical params and concurrent duplicates share one upstream request');
assert.deepEqual(a, b);
a.results[0].title = 'mutation';
assert.equal((await runtime.catalog('/movie/popular', { page: 1 })).results[0].title, 'Fixture');
assert.equal(calls[0].url.origin, 'https://api.themoviedb.org');
assert.equal(calls[0].url.searchParams.get('api_key'), key);
assert.equal(calls[0].options.redirect, 'error');
for (const path of ['https://attacker.example/key', '//attacker.example/key', '/movie/1/../../account',
  '/movie/1?api_key=x', '/authentication/token/new', '/tv/2/season/101', '/movie/0', '/discover/movie#x']) {
  await assert.rejects(runtime.catalog(path), /TMDB_BAD_CATALOG_PATH/);
}
for (const params of [{ api_key: 'attacker' }, { access_token: 'attacker' }, { page: '501' }, { page: '-1' },
  { query: 'x'.repeat(121) }, { include_adult: true }, { append_to_response: 'account_states' },
  { language: 'bad' }, { sort_by: 'arbitrary' }, { query: { nested: 'x' } },
  { ['__proto__']: 'x' }, { with_genres: '28&api_key=x' }]) {
  await assert.rejects(runtime.catalog('/discover/movie', params), /TMDB_BAD_CATALOG_PARAMS/);
}
assert.equal(calls.length, 1, 'invalid requests never consume credentials/quota');
await runtime.catalog('/tv/12/season/100');
const disabled = createTmdbRuntime({ apiKey: '', backupApiKey: '', bearerToken: '' });
await assert.rejects(disabled.catalog('/movie/popular'), /TMDB_NOT_CONFIGURED/);
let failoverCalls = 0;
const failover = createTmdbRuntime({ apiKey: 'primary', backupApiKey: 'backup', bearerToken: '', fetchImpl: async () => {
  failoverCalls++; return failoverCalls === 1 ? new Response('', { status: 401 }) : new Response('{"results":[]}');
} });
await failover.catalog('/movie/popular'); assert.equal(failoverCalls, 2);
const failing = createTmdbRuntime({ apiKey: key, backupApiKey: '', bearerToken: '', fetchImpl: async () => { throw Error(`network leaked ${key}`); } });
await assert.rejects(failing.catalog('/movie/popular'), error => !error.message.includes(key) && error.message === 'TMDB_NETWORK_ERROR');
const quota = createTmdbRuntime({ apiKey: key, backupApiKey: '', bearerToken: '', maxRequestsPerMinute: 1,
  fetchImpl: async () => new Response('{"results":[]}') });
await quota.catalog('/movie/popular');
await assert.rejects(quota.catalog('/tv/popular'), /TMDB_RATE_LIMITED/);
let release;
const bounded = createTmdbRuntime({ apiKey: key, backupApiKey: '', bearerToken: '', maxConcurrentRequests: 1, maxQueuedRequests: 0,
  fetchImpl: async () => new Promise(resolve => { release = () => resolve(new Response('{"results":[]}')); }) });
const blocked = bounded.catalog('/movie/popular');
await assert.rejects(bounded.catalog('/tv/popular'), /TMDB_BUSY/); release(); await blocked;

const server = createMitvRuntimeServer({ baseServer: createServer((req, res) => { res.writeHead(404); res.end(); }), tmdbRuntime: runtime,
  fallbackRuntime: { status: () => ({}) } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${base}/api/v1/tmdb/catalog?path=%2Fmovie%2Fpopular&page=1`);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).results[0].id, 7);
  for (const query of ['path=https://attacker.example', 'path=/movie/popular&api_key=x',
    'path=/movie/popular&page=1&page=2', 'path=/movie/popular&path=/tv/popular']) {
    const response = await fetch(`${base}/api/v1/tmdb/catalog?${query}`);
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes(key), false);
  }
  assert.equal((await fetch(`${base}/api/v1/tmdb/catalog`, { method: 'POST' })).status, 405);
} finally { await new Promise(resolve => server.close(resolve)); }

class Storage {
  values = new Map(); get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index]; }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.localStorage = new Storage();
globalThis.window = {};
globalThis.document = { querySelector: () => ({ content: 'https://backend.example' }) };
const clientCalls = [];
globalThis.fetch = async (url, options) => {
  clientCalls.push({ url: new URL(url), options });
  return new Response('{"results":[{"id":10,"title":"Public fixture"}]}');
};
const { tmdbFetch } = await import('../web/core/tmdb-service.js');
const browserResult = await tmdbFetch('/movie/popular');
assert.equal(browserResult.results[0].id, 10);
assert.equal(clientCalls[0].url.origin, 'https://backend.example');
assert.equal(clientCalls[0].url.pathname, '/api/v1/tmdb/catalog');
assert.equal(clientCalls[0].url.searchParams.get('path'), '/movie/popular');
assert.equal(clientCalls[0].url.searchParams.has('api_key'), false);
assert.equal(Object.hasOwn(clientCalls[0].options.headers, 'Authorization'), false);
const before = clientCalls.length;
await tmdbFetch('/discover/movie', { api_key: 'injection' });
assert.equal(clientCalls.length, before);
localStorage.setItem('matv_user_tmdb_key', '0123456789abcdef0123456789abcdef');
await tmdbFetch('/movie/top_rated');
assert.equal(clientCalls.at(-1).url.origin, 'https://api.themoviedb.org', 'explicit BYOK remains personal');
const source = await readFile(new URL('../web/core/tmdb-service.js', import.meta.url), 'utf8');
assert.equal(source.includes('DEFAULT_V3_'), false);
console.log('TMDb catalog security tests passed: browser/server isolation, allowlists, cache, failover, quota, concurrency, HTTP');
