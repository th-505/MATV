// scripts/providers/qfilm.fixture.test.mjs
// Offline fixture-based test suite for كيو فيلم (QFilm, Code: QM)
import assert from 'node:assert/strict';
import {
  PROVIDER_ID,
  PROVIDER_NAME,
  PROVIDER_CODE,
  PROVIDER_META,
  QFILM_CONFIG,
  decodeProviderRef,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractQFilmStreams,
  scrapeQfilmCatalog,
  scrapeQfilmSearch,
  scrapeQfilmDetails,
  scrapeQfilmEpisodes,
  scrapeQfilmServers
} from '../../server/scrapers/sites/qfilm.mjs';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  SEARCH_EMPTY_HTML,
  MOVIE_DETAILS_HTML,
  SERIES_DETAILS_HTML,
  WATCH_EMBED_HTML,
  SPECIAL_CASE_FIXTURES
} from '../fixtures/providers/qfilm.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting QFilm (QM) Offline Fixture Test Suite ===');

// 1. PROVIDER_META & CONFIG CONTRACT
console.log('1. Checking PROVIDER_META and QFILM_CONFIG contract...');
assert.equal(PROVIDER_META.id, 'qfilm');
assert.equal(PROVIDER_META.name, 'كيو فيلم (QFilm)');
assert.equal(PROVIDER_META.code, 'QM');
assert.deepEqual(PROVIDER_META.domains, ['https://a.qfilm.tv', 'https://qfilm.tv']);
assert.equal(PROVIDER_META.mirrorOf, null);
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);

assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');
assert.equal(PROVIDER_META.searchSpec.encoding, 'utf-8');

assert.equal(QFILM_CONFIG.id, 'qfilm');
assert.equal(QFILM_CONFIG.code, 'QM');
assert.equal(QFILM_CONFIG.baseUrl, 'https://a.qfilm.tv');
assert.equal(QFILM_CONFIG.fallbackUrl, 'https://qfilm.tv');
console.log('   ✓ PROVIDER_META and QFILM_CONFIG verified');

// 2. FIXTURE ISOLATION
console.log('2. Verifying fixture metadata isolation...');
assert.equal(FIXTURE_META.isRealLiveSample, true);
assert.equal(FIXTURE_META.providerId, 'qfilm');
assert.ok(FIXTURE_META.obstacles['a.qfilm.tv'].includes('ENOTFOUND'));
assert.equal(SPECIAL_CASE_FIXTURES.isSyntheticSpecialCase, true);
console.log('   ✓ Fixture isolation verified');

// 3. CATALOG SCRAPER (OFFLINE FIXTURE)
console.log('3. Testing scrapeCatalog with CATALOG_HTML...');
const catalog = await scrapeCatalog('movies', 1, { fixtureHtml: CATALOG_HTML });
assert.ok(Array.isArray(catalog), 'Catalog must return an array');
assert.equal(catalog._meta.ok, true);
assert.equal(catalog.length, 3, `Expected 3 catalog items, got ${catalog.length}`);

const item1 = catalog[0];
assert.ok(item1.title.includes('Interstellar'));
assert.equal(item1.year, '2014');
assert.equal(item1.rating, '8.7');
assert.equal(item1.quality, '1080p BluRay');
assert.equal(item1.type, 'movie');
assert.equal(item1.serverPrefix, 'QM');
assert.equal(item1.source, 'qfilm');
assert.ok(item1.url.startsWith('https://a.qfilm.tv/movie/'));
assert.ok(item1.ref.startsWith('qfilm:'));

const item3 = catalog[2];
assert.ok(item3.title.includes('Breaking Bad'));
assert.equal(item3.type, 'series');
assert.equal(item3.is_series, true);
console.log(`   ✓ Catalog parsed ${catalog.length} items with accurate metadata`);

// 4. SEARCH SCRAPER (POSITIVE & EMPTY)
console.log('4. Testing scrapeSearch with positive and empty search fixtures...');
const searchPositive = await scrapeSearch('انترستيلر', 1, { fixtureHtml: SEARCH_HTML });
assert.ok(Array.isArray(searchPositive));
assert.equal(searchPositive._meta.ok, true);
assert.equal(searchPositive.length, 1);
assert.ok(searchPositive[0].title.includes('Interstellar'));
assert.equal(searchPositive[0].serverPrefix, 'QM');
console.log('   ✓ Positive search query correctly extracted');

const searchEmpty = await scrapeSearch('nonexistent', 1, { fixtureHtml: SEARCH_EMPTY_HTML });
assert.ok(Array.isArray(searchEmpty));
assert.equal(searchEmpty.length, 0);
assert.equal(searchEmpty._meta.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('   ✓ Empty search correctly returned EMPTY_RESULT');

const searchBlank = await scrapeSearch('', 1);
assert.equal(searchBlank.length, 0);
assert.equal(searchBlank._meta.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('   ✓ Blank search query immediately returns EMPTY_RESULT');

// 5. DETAILS SCRAPER (MOVIE & SERIES)
console.log('5. Testing scrapeDetails with MOVIE_DETAILS_HTML and SERIES_DETAILS_HTML...');
const movieDetails = await scrapeDetails('https://a.qfilm.tv/movie/interstellar-2014/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.equal(movieDetails._meta.ok, true);
assert.ok(movieDetails.title.includes('Interstellar'));
assert.equal(movieDetails.year, '2014');
assert.equal(movieDetails.rating, '8.7');
assert.equal(movieDetails.quality, '1080p BluRay');
assert.equal(movieDetails.type, 'movie');
assert.ok(movieDetails.overview.includes('رواد الفضاء'));
assert.ok(movieDetails.genres.includes('خيال علمي'));
assert.ok(movieDetails.genres.includes('مغامرة'));
assert.ok(movieDetails.servers.length >= 2, `Expected servers in details, got ${movieDetails.servers.length}`);
console.log(`   ✓ Movie details parsed (${movieDetails.servers.length} servers extracted)`);

const seriesDetails = await scrapeDetails('https://a.qfilm.tv/series/breaking-bad/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(seriesDetails._meta.ok, true);
assert.ok(seriesDetails.title.includes('Breaking Bad'));
assert.equal(seriesDetails.type, 'series');
assert.equal(seriesDetails.year, '2008');
assert.equal(seriesDetails.rating, '9.5');
assert.equal(seriesDetails.episodes.length, 3);
console.log('   ✓ Series details and embedded episodes parsed');

// 6. EPISODES SCRAPER
console.log('6. Testing scrapeEpisodes with SERIES_DETAILS_HTML...');
const episodes = await scrapeEpisodes('https://a.qfilm.tv/series/breaking-bad/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(episodes._meta.ok, true);
assert.equal(episodes.length, 3);
assert.equal(episodes[0].number, 1);
assert.equal(episodes[1].number, 2);
assert.equal(episodes[2].number, 3);
assert.equal(episodes[0].season, 1);
assert.ok(episodes[0].url.includes('breaking-bad-s1-ep1'));
console.log('   ✓ Episodes parsed in strictly ascending order');

// 7. SERVERS SCRAPER (QM-1, QM-2..., embed verification rule)
console.log('7. Testing scrapeServers with MOVIE_DETAILS_HTML...');
const servers = await scrapeServers('https://a.qfilm.tv/movie/interstellar-2014/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.equal(servers._meta.ok, true);
assert.ok(servers.length >= 2);

servers.forEach((srv, idx) => {
  assert.equal(srv.code, `QM-${idx + 1}`);
  assert.equal(srv.serverCode, `QM-${idx + 1}`);
  assert.ok(['m3u8', 'mp4', 'embed'].includes(srv.type));
  // An iframe/embed URL is NEVER verified playback
  if (srv.type === 'embed') {
    assert.equal(srv.verified, false, 'Embed servers must have verified: false');
  }
});
console.log(`   ✓ Servers correctly formatted with QM- prefix (${servers.map(s => s.code).join(', ')})`);

// 8. RESOLVE STREAM
console.log('8. Testing resolveStream with MOVIE_DETAILS_HTML...');
const resolved = await resolveStream('https://a.qfilm.tv/movie/interstellar-2014/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.equal(resolved._meta.ok, true);
assert.ok(resolved.code.startsWith('QM-'));
assert.ok(resolved.streamUrl.startsWith('http'));
assert.ok(['m3u8', 'mp4', 'embed'].includes(resolved.type));
// Verified is false until live playback probe
assert.equal(resolved.verified, false);
console.log(`   ✓ resolveStream selected primary server ${resolved.code} (${resolved.type})`);

// 9. BACKWARD COMPATIBILITY & NAMED ALIASES
console.log('9. Testing backward-compatible extractQFilmStreams and aliases...');
const legacyExtraction = await extractQFilmStreams('https://a.qfilm.tv/movie/interstellar-2014/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(Array.isArray(legacyExtraction.servers));
assert.ok(legacyExtraction.servers.length >= 2);
assert.equal(legacyExtraction.source, 'qfilm');

assert.equal(scrapeQfilmCatalog, scrapeCatalog);
assert.equal(scrapeQfilmSearch, scrapeSearch);
assert.equal(scrapeQfilmDetails, scrapeDetails);
assert.equal(scrapeQfilmEpisodes, scrapeEpisodes);
assert.equal(scrapeQfilmServers, scrapeServers);
console.log('   ✓ Backward-compatible exports verified');

// 10. SYNTHETIC SPECIAL CASES
console.log('10. Testing synthetic special cases (Arabic numerals & deduplication)...');
const arabicNumeralsCatalog = await scrapeCatalog('series', 1, {
  fixtureHtml: SPECIAL_CASE_FIXTURES.arabicEasternNumeralsHtml
});
assert.equal(arabicNumeralsCatalog.length, 1);
assert.equal(arabicNumeralsCatalog[0].year, '2024');
assert.equal(arabicNumeralsCatalog[0].rating, '8.5');

const dedupEpisodes = await scrapeEpisodes('https://a.qfilm.tv/series/test/', {
  fixtureHtml: SPECIAL_CASE_FIXTURES.deduplicatedEpisodesHtml
});
assert.equal(dedupEpisodes.length, 2);
assert.equal(dedupEpisodes[0].number, 1);
assert.equal(dedupEpisodes[1].number, 2);
console.log('   ✓ Synthetic edge cases successfully verified');

console.log('\n=== All QFilm (QM) Offline Fixture Tests PASSED ===');
