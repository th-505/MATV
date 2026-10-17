// HTTP API integration test for search -> details -> episode -> direct source resolution.
// This validates application routing/contracts with deterministic provider fixtures; it does not claim native playback.
import assert from 'node:assert/strict';
import { createServer } from '../server/app.mjs';

const cases = [
  { id: 'moviztime', query: 'batman', ref: 'moviztime:https://moviz-time.quest/film/the-batman-2022', type: 'movie' },
  { id: 'akwam', query: 'المسلسل التجريبي', ref: 'akoam:https://akwam.ss/series/test-series', type: 'series' },
  { id: 'anime4up_rest', query: 'one piece', ref: 'anime4up_rest:https://w1.anime4up.rest/anime/test-one-piece', type: 'anime' },
  { id: 'yallashoot', query: 'live match', ref: 'sports_live:https://yalla-shoot.tv/match/test-match', type: 'live' }
];
const detailsCalls = [];
const runtimeService = {
  version: '1.0.44',
  status: () => ({ status: 'ok', version: '1.0.44' }),
  async search() { return { status: 'success', version: '1.0.44', kind: 'search', source: 'runtime', cached: false, health: null, data: [] }; },
  async matches() { return { status: 'success', version: '1.0.44', kind: 'matches', data: [] }; },
  async category() { return { status: 'success', version: '1.0.44', kind: 'category', data: [] }; }
};
const providerSearch = async (providerId, query) => {
  if (query === 'no-result-query') return { status: 'no_results', provider_id: providerId, data: [], diagnostics: { result_count: 0 } };
  if (query === 'failing-query') return { status: 'error', provider_id: providerId, data: [], error: { code: 'ACCESS_BLOCKED' } };
  const item = cases.find((entry) => entry.id === providerId && entry.query === query);
  if (!item) return { status: 'unsupported', provider_id: providerId, data: [], error: { code: 'SEARCH_UNSUPPORTED' } };
  return { status: 'success', provider_id: providerId, provider_name: providerId, data: [{ id: item.ref, ref: item.ref, title: `Fixture ${item.type}`, source: providerId, providerId }] };
};
const providerDetails = async (ref) => {
  detailsCalls.push(ref);
  const item = cases.find((entry) => ref.startsWith(entry.ref.split(':')[0] + ':') || new URL(entry.ref.slice(entry.ref.indexOf(':') + 1)).hostname === (() => { try { return new URL(ref).hostname; } catch { return ''; } })());
  if (!item) return null;
  const episodes = item.type === 'series' ? [
    { number: 1, title: 'الحلقة 1', ref: `${item.ref}:episode-1`, url: `${item.ref}:episode-1` },
    { number: 2, title: 'الحلقة 2', ref: `${item.ref}:episode-2`, url: `${item.ref}:episode-2` }
  ] : [];
  return {
    id: item.ref, ref: item.ref, source: item.id, providerId: item.id,
    title: `Fixture ${item.type}`, type: item.type, episodes,
    servers: [{ provider: item.id, code: 'T-1', kind: 'direct', type: 'm3u8', url: `https://media.example/${item.id}.m3u8`, headers: {} }],
    media_sources: [{ provider: item.id, code: 'T-1', kind: 'direct', type: 'm3u8', url: `https://media.example/${item.id}.m3u8`, headers: {} }]
  };
};

const server = createServer({ runtimeService, providerSearch, providerDetails });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const item of cases) {
    const searchResponse = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(item.query)}&provider=${item.id}`);
    assert.equal(searchResponse.status, 200, `${item.id} search HTTP status`);
    const search = await searchResponse.json();
    assert.equal(search.kind, 'search');
    assert.equal(search.provider_id, item.id);
    assert.equal(search.data.length, 1, `${item.id} search should return one fixture result`);
    assert.equal(search.data[0].ref, item.ref);
    assert.equal(search.data[0].source, item.id);

    const detailsResponse = await fetch(`${base}/api/cinema/details?ref=${encodeURIComponent(item.ref)}`);
    assert.equal(detailsResponse.status, 200, `${item.id} details HTTP status`);
    const details = await detailsResponse.json();
    assert.equal(details.providerId, item.id);
    assert.equal(details.title, `Fixture ${item.type}`);

    if (item.type === 'series') {
      assert.deepEqual(details.episodes.map((episode) => episode.number), [1, 2], 'episode chronology must remain stable');
      const epRef = details.episodes[0].ref;
      const playbackResponse = await fetch(`${base}/api/v1/resolve?ref=${encodeURIComponent(epRef)}`);
      assert.equal(playbackResponse.status, 200);
      const playback = await playbackResponse.json();
      assert.equal(playback.servers.length, 1);
      assert.equal(playback.servers[0].provider, item.id);
      assert.match(playback.servers[0].url, /\.m3u8$/);
    }
  }

  const emptyResponse = await fetch(`${base}/api/v1/search?q=no-result-query&provider=moviztime`);
  assert.equal(emptyResponse.status, 200);
  const empty = await emptyResponse.json();
  assert.equal(empty.status, 'no_results');
  assert.deepEqual(empty.data, [], 'no result must stay empty; no catalog substitution is allowed');

  const failedResponse = await fetch(`${base}/api/v1/search?q=failing-query&provider=moviztime`);
  assert.equal(failedResponse.status, 503);
  assert.equal((await failedResponse.json()).error.code, 'ACCESS_BLOCKED');

  const unsupportedResponse = await fetch(`${base}/api/v1/search?q=one%20piece&provider=egydead_live`);
  assert.equal(unsupportedResponse.status, 422);
  assert.equal((await unsupportedResponse.json()).status, 'unsupported');

  assert.ok(detailsCalls.some((ref) => ref.startsWith('sports_live:')), 'the registered sports_live alias must reach provider details routing');
  console.log('PASS: real HTTP route sequence covers provider search, details, episode ordering, direct server resolution, empty/error/unsupported outcomes. This is API integration only, not a device playback claim.');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
