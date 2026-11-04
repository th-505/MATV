import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFostaCatalog, parseFostaDetails, scrapeSearch, scrapeServers, resolveStream,
  decodeProviderRef } from '../server/scrapers/sites/fosta.mjs';
import { SEARCH_HTML, SERIES_HTML, MOVIE_HTML, PLAY_HTML, FIXTURE_META } from '../scripts/fixtures/providers/fosta.fixture.mjs';

test('Fosta observed search cards and independent references', async () => {
  const items = await scrapeSearch('طالع نازل', 1, { fixtureHtml: SEARCH_HTML });
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.equal(item.source, 'fosta');
    assert.ok(decodeProviderRef(item.ref).startsWith('https://ffosta-tv.autos/watch.php?vid='));
  }
  assert.equal(parseFostaCatalog('<div>no cards</div>').length, 0);
});
test('Fosta observed seasons and numbers stay owned by the source', () => {
  const details = parseFostaDetails(SERIES_HTML, FIXTURE_META.urls.seriesDetail);
  assert.deepEqual(details.episodes.map(item => item.number), [1,2,3,4,5,6,7,8,9]);
  assert.ok(details.episodes.every(item => item.season === 1));
  assert.equal(parseFostaDetails(MOVIE_HTML, FIXTURE_META.urls.movieDetail).episodes.length, 0);
  const changed = SERIES_HTML.replaceAll('الحلقة 9', 'الحلقة 1217');
  assert.ok(parseFostaDetails(changed, FIXTURE_META.urls.seriesDetail).episodes.some(e => e.number === 1217));
});
test('Fosta embedded servers cannot become direct playback by assertion', async () => {
  const servers = await scrapeServers(FIXTURE_META.urls.movieDetail, { fixtureHtml: PLAY_HTML });
  assert.ok(servers.length >= 2);
  const resolved = await resolveStream(FIXTURE_META.urls.movieDetail, { fixtureHtml: PLAY_HTML });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.streamUrl, null);
});
test('Fosta rejects non-source details and private address references', () => {
  assert.throws(() => decodeProviderRef('https://127.0.0.1/watch.php?vid=a'));
  assert.throws(() => decodeProviderRef('https://other.example/watch.php?vid=a'));
  assert.throws(() => decodeProviderRef('https://ffosta-tv.autos/account.php'));
});
