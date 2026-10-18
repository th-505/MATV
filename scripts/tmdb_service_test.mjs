import assert from 'node:assert/strict';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
const { getUserTmdbKey, tmdbFetch, normalizeTmdbItem, fetchFullTmdbDetails, fetchNetflixHomeShelves } = await import('../web/core/tmdb-service.js');

let networkCalls = 0;
globalThis.fetch = async (url, options) => {
  networkCalls++;
  return {
    ok: true,
    async json() {
      return { results: [{ id: 42, media_type: 'movie', title: 'Example', release_date: '2024-01-01', vote_average: 7.5 }] };
    },
    url,
    options,
  };
};

assert.equal(getUserTmdbKey(), '');
assert.deepEqual(await tmdbFetch('/movie/top_rated'), { results: [] });
assert.equal(networkCalls, 0, 'the client must not ship a built-in TMDb credential');

localStorage.setItem('matv_user_tmdb_key', '0123456789abcdef0123456789abcdef');
const [first, concurrent] = await Promise.all([
  tmdbFetch('/movie/top_rated', { page: '1' }),
  tmdbFetch('/movie/top_rated', { page: '1' }),
]);
assert.deepEqual(first, concurrent);
assert.equal(networkCalls, 1, 'concurrent duplicate calls should share one request');
assert.match([...localStorage.values.keys()].find((key) => key.startsWith('matv_tmdb_v7_')), /top_rated/);

await tmdbFetch('/movie/top_rated', { page: '1' });
assert.equal(networkCalls, 1, 'successful responses should use the one-hour local cache');
await tmdbFetch('//attacker.example/steal');
assert.equal(networkCalls, 1, 'non-TMDb paths must be rejected before fetch');

localStorage.setItem('matv_user_tmdb_key', 'eyJhbGciOiJIUzI1NiJ9.payload.signature');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  networkCalls++;
  assert.equal(new URL(url).searchParams.has('api_key'), false);
  assert.equal(options.headers.Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature');
  return { ok: true, async json() { return { results: [] }; } };
};
await tmdbFetch('/search/movie', { query: 'film' });
globalThis.fetch = originalFetch;

assert.equal(normalizeTmdbItem({ id: 7, title: 'Unknown' }).year, '');
assert.equal(normalizeTmdbItem({ id: 7, title: 'Unknown' }).rating, '0.0');
assert.equal(normalizeTmdbItem({ title: 'Missing ID' }), null);

globalThis.fetch = async () => ({ ok: true, async json() { return { id: 1396, name: 'Example', number_of_episodes: 12, seasons: [] }; } });
localStorage.setItem('matv_user_tmdb_key', '0123456789abcdef0123456789abcdef');
const details = await fetchFullTmdbDetails('tv', '1396', 1);
assert.deepEqual(details.episodes, [], 'missing season data must not fabricate episode numbers');

console.log('web TMDb service tests passed');

localStorage.removeItem('matv_user_tmdb_key');
let homeCalls=0;
globalThis.fetch=async(url,options)=>{
  homeCalls++;
  assert.equal(new URL(url).pathname,'/api/v1/tmdb/trending');
  assert.equal(options.headers.Authorization,undefined);
  assert.equal(new URL(url).searchParams.has('api_key'),false);
  return {ok:true,json:async()=>({status:'success',data:[{id:'42',ref:'tmdb:movie:42',title:'Server home',type:'movie',poster:'https://image.tmdb.org/t/p/w500/poster.jpg'}]})};
};
const home=await fetchNetflixHomeShelves();
assert.equal(homeCalls,1);
assert.equal(home.heroItems[0].href,'tmdb:movie:42');
assert.equal(home.shelves.find(row=>row.id==='shelfSeries').items.length,0,'no unrelated series fillers');
console.log('Web home uses server TMDb metadata without browser credentials');
