// scripts/providers/laroza.fixture.test.mjs
// Offline fixture validation test suite for Laroza provider (لاروزا, code: LZ)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  EMPTY_SEARCH_HTML,
  SERIES_DETAILS_HTML,
  MOVIE_DETAILS_HTML,
  WATCH_HTML,
  PACKED_PLAYER_HTML,
  DIRECT_STREAM_SAMPLE,
  SYNTHETIC_ARABIC_DIGITS_SERIES_HTML,
  SYNTHETIC_ARABIC_DIGITS_META
} from '../fixtures/providers/laroza.fixture.mjs';

import {
  PROVIDER_META,
  LAROZA_SITE_CONFIG,
  resolveLarozaTargetUrl,
  buildLarozaRef,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive
} from '../../server/scrapers/sites/laroza.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting Laroza Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'laroza');
assert.equal(PROVIDER_META.code, 'LZ');
assert.equal(PROVIDER_META.name, 'لاروزا (Laroza)');
assert.ok(PROVIDER_META.domains.includes('https://larooza.beer'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.queryParam, 'keywords');
assert.ok(PROVIDER_META.searchSpec.pathTemplate.includes('keywords={query}'));

// 2. REFERENCE FORMAT & TARGET URL RESOLUTION
console.log('2. Testing Reference Format & Target URL Resolution...');
const ref1 = buildLarozaRef('/play.php?vid=film2020');
assert.ok(ref1.startsWith('laroza:'), 'Reference must start with laroza:');
const resolvedUrl1 = resolveLarozaTargetUrl(ref1);
assert.equal(resolvedUrl1, 'https://larooza.beer/play.php?vid=film2020');

const refSeries = buildLarozaRef('/view-serie1.php?ser=show2021');
const resolvedSeriesUrl = resolveLarozaTargetUrl(refSeries);
assert.equal(resolvedSeriesUrl, 'https://larooza.beer/view-serie1.php?ser=show2021');

// /video.php is automatically rewritten to /play.php
assert.equal(
  resolveLarozaTargetUrl('https://larooza.beer/video.php?vid=demo123'),
  'https://larooza.beer/play.php?vid=demo123'
);

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('latest', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.ok(catalogItems.length >= 3, `Expected at least 3 items, got ${catalogItems.length}`);
assert.equal(catalogItems[0].source, 'laroza');
assert.equal(catalogItems[0].serverPrefix, 'LZ');
assert.ok(catalogItems[0].ref.startsWith('laroza:'));
assert.ok(catalogItems[0].url.startsWith('https://larooza.beer/'));
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// Ensure duplicates were eliminated
const filmCards = catalogItems.filter((i) => i.url.includes('vid=film2020'));
assert.equal(filmCards.length, 1, 'Duplicate film entries must be deduplicated to exactly 1');

// Ensure private link and advertisement links were excluded
assert.ok(!catalogItems.some((i) => i.url.includes('127.0.0.1')));
assert.ok(!catalogItems.some((i) => i.url.includes('vid=AD')));

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('عثمان', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 2);
assert.equal(searchResults[0].source, 'laroza');
assert.equal(searchResults[0].serverPrefix, 'LZ');
assert.ok(searchResults[0].title.includes('عثمان'));
assert.ok(searchResults._meta?.ok);

// 4b. Empty Search Result Handling
console.log('4b. Testing Empty Search Results...');
const emptySearchResults = await scrapeSearch('xyznonexistent999xyz', 1, {
  fixtureHtml: EMPTY_SEARCH_HTML
});
assert.equal(emptySearchResults.length, 0);
assert.equal(emptySearchResults._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

const emptyQueryResults = await scrapeSearch('');
assert.equal(emptyQueryResults.length, 0);
assert.equal(emptyQueryResults._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. SERIES DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Fixture Scraping...');
const seriesDetails = await scrapeDetails(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(seriesDetails.title.includes('Example 2021'));
assert.equal(seriesDetails.type, 'series');
assert.equal(seriesDetails.source, 'laroza');
assert.equal(seriesDetails.imdb_id, 'tt1234567');
assert.ok(seriesDetails.overview.includes('تدور أحداث'));
assert.ok(Array.isArray(seriesDetails.episodes));
assert.equal(seriesDetails.episodes.length, 3);
assert.ok(seriesDetails._meta?.ok);

// 5b. Movie Details Fixture Scraping
console.log('5b. Testing Movie Details Fixture Scraping...');
const movieDetails = await scrapeDetails(FIXTURE_META.urls.episodeWatch, {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(movieDetails.title.includes('Example 2020'));
assert.equal(movieDetails.type, 'movie');
assert.equal(movieDetails.imdb_id, 'tt7654321');

// 6. EPISODES FIXTURE & STRICT ASCENDING ORDER AUDIT
console.log('6. Testing Episodes Ordering & Deduplication...');
const episodes = await scrapeEpisodes(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(episodes.length, 3);
const epNumbers = episodes.map((e) => e.number);
assert.deepEqual(epNumbers, [1, 2, 3], 'Episodes must be strictly sorted ascending: 1, 2, 3');
for (const ep of episodes) {
  assert.equal(ep.season, 1);
  assert.ok(ep.ref.startsWith('laroza:'));
  assert.ok(ep.url.startsWith('https://larooza.beer/'));
  assert.equal(ep.watch_available, true);
  assert.equal(ep.source, 'laroza');
}

// 7. SERVERS FIXTURE & CODE PREFIX LZ AUDIT
console.log('7. Testing Servers Fixture & Code Prefix LZ...');
const servers = await scrapeServers(FIXTURE_META.urls.episodeWatch, {
  fixtureHtml: WATCH_HTML,
  playerFixtureHtml: PACKED_PLAYER_HTML
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 4, `Expected at least 4 servers, got ${servers.length}`);
for (let i = 0; i < servers.length; i++) {
  const s = servers[i];
  assert.equal(s.code, `LZ-${i + 1}`, `Server code must follow format LZ-${i + 1}`);
  assert.equal(s.serverCode, `LZ-${i + 1}`);
  assert.ok(s.url, 'Server must have a URL');
  assert.ok(['m3u8', 'mp4', 'embed'].includes(s.type), 'Server type must be valid');
  assert.ok(s.headers?.Referer, 'Server must include Referer header');
}

// Verify direct HLS server unwrapped from player fixture
const directHlsServer = servers.find((s) => s.type === 'm3u8');
assert.ok(directHlsServer, 'Should have direct m3u8 stream unwrapped from player');
assert.equal(directHlsServer.url, 'https://cdn2.okprimeone.site/hls/demo/master.m3u8');

// Verify embed servers have verified: false
const embedServer = servers.find((s) => s.type === 'embed');
assert.ok(embedServer);
assert.equal(embedServer.verified, false, 'An iframe/embed URL is NEVER a direct video (verified: false)');

// 8. RESOLVE STREAM FIXTURE AUDIT
console.log('8. Testing Stream Resolution from Fixture...');
const stream = await resolveStream(FIXTURE_META.urls.episodeWatch, {
  playerFixtureHtml: PACKED_PLAYER_HTML
});
assert.equal(stream.ok, true);
assert.equal(stream.providerId, 'laroza');
assert.equal(stream.type, 'm3u8');
assert.equal(stream.url, 'https://cdn2.okprimeone.site/hls/demo/master.m3u8');
assert.ok(stream.headers?.Referer);

// 9. LIVE CAPABILITY (UNSUPPORTED)
console.log('9. Testing Live Capability Contract...');
const liveResult = await scrapeLive();
assert.equal(liveResult.length, 0);
assert.equal(liveResult._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

// 10. SSRF AND SECURITY BOUNDARIES
console.log('10. Testing SSRF and Unsafe URL Rejection...');
await assert.rejects(
  () => scrapeDetails('http://127.0.0.1/private'),
  /UNSAFE_|ScraperError/
);
await assert.rejects(
  () => scrapeDetails('http://169.254.169.254/latest/meta-data'),
  /UNSAFE_|ScraperError/
);
await assert.rejects(
  () => resolveStream('http://127.0.0.1:8080/stream.m3u8'),
  /UNSAFE_|ScraperError/
);
await assert.rejects(
  () => resolveStream('https://user:secret@larooza.beer/play.php?vid=1'),
  /UNSAFE_|ScraperError/
);

// 11. SYNTHETIC SPECIAL CASE: Arabic-Indic Digits in Episode Numbers
console.log('11. Testing Synthetic Special Case: Arabic-Indic Digits...');
assert.equal(SYNTHETIC_ARABIC_DIGITS_META.isSyntheticSpecialCase, true);
const syntheticEpisodes = await scrapeEpisodes('https://larooza.beer/view-serie1.php?ser=synthetic', {
  fixtureHtml: SYNTHETIC_ARABIC_DIGITS_SERIES_HTML
});
assert.equal(syntheticEpisodes.length, 3);
const syntheticNumbers = syntheticEpisodes.map((e) => e.number);
assert.deepEqual(
  syntheticNumbers,
  [1, 4, 15],
  'Arabic-Indic numerals (١, ٤, ١٥) must be normalized to (1, 4, 15) and sorted ascending'
);
assert.equal(syntheticEpisodes[0].season, 2, 'Season ٢ must parse to 2');

console.log('\nAll 11 Laroza fixture tests passed successfully!');
