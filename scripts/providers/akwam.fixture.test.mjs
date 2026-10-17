// scripts/providers/akwam.fixture.test.mjs
// Offline fixture test suite for Akwam / Akoam provider (أكوام, code: AK)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  EMPTY_SEARCH_HTML,
  SERIES_DETAILS_HTML,
  MOVIE_DETAILS_HTML,
  EPISODE_WATCH_HTML,
  DOWNET_BRIDGE_HTML,
  FIXTURE_URL_MAP
} from '../fixtures/providers/akwam.fixture.mjs';

import {
  PROVIDER_META,
  AKWAM_CONFIG,
  resolveAkwamTargetUrl,
  encodeAkwamRef,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive,
  scrapeAkwamCategory,
  scrapeAkwamCatalog,
  scrapeAkoamCatalog,
  searchAkwam,
  extractAkwamStreamsAndEpisodes
} from '../../server/scrapers/sites/akwam.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting Akwam Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'akwam');
assert.equal(PROVIDER_META.code, 'AK');
assert.equal(PROVIDER_META.name, 'أكوام (Akwam)');
assert.ok(PROVIDER_META.domains.includes('https://akwam.ss'));
assert.ok(PROVIDER_META.domains.includes('https://ak.sv'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/search?q={query}');
assert.equal(PROVIDER_META.searchSpec.queryParam, 'q');

// 2. URL & REF RESOLUTION
console.log('2. Testing URL & Ref Resolution...');
assert.equal(
  resolveAkwamTargetUrl('/movie/5678/the-beekeeper'),
  'https://akwam.ss/movie/5678/the-beekeeper'
);
assert.equal(
  resolveAkwamTargetUrl('https://ak.sv/series/1234/hulm-ashraf'),
  'https://akwam.ss/series/1234/hulm-ashraf'
);
const testUrl = 'https://akwam.ss/movie/5678/the-beekeeper';
const encoded = encodeAkwamRef(testUrl);
assert.ok(encoded.startsWith('akwam:'));
assert.equal(resolveAkwamTargetUrl(encoded), testUrl);

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('movies', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 4, 'Catalog fixture contains 4 items');
assert.equal(catalogItems[0].source, 'akwam');
assert.equal(catalogItems[0].serverPrefix, 'AK');
assert.equal(catalogItems[0].type, 'movie');
assert.equal(catalogItems[0].is_series, false);
assert.ok(catalogItems[0].ref.startsWith('akwam:'));
assert.equal(catalogItems[0].url, 'https://akwam.ss/movie/5678/the-beekeeper-2024');
assert.ok(catalogItems[0].title.includes('The Beekeeper 2024'));
assert.equal(catalogItems[0].year, '2024');
assert.equal(catalogItems[0].rating, '7.6');
assert.equal(catalogItems[0].quality, '1080p WEB-DL');
assert.ok(catalogItems[0].poster.includes('the-beekeeper-2024.jpg'));

// Second card is a series
assert.equal(catalogItems[1].type, 'series');
assert.equal(catalogItems[1].is_series, true);
assert.equal(catalogItems[1].url, 'https://akwam.ss/series/1234/hulm-ashraf');
assert.equal(catalogItems[1].year, '2025');
assert.equal(catalogItems[1].rating, '8.4');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('أشرف', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 2);
assert.equal(searchResults[0].type, 'series');
assert.equal(searchResults[0].is_series, true);
assert.equal(searchResults[0].year, '2025');
assert.equal(searchResults[0].source, 'akwam');
assert.equal(searchResults[1].type, 'movie');
assert.equal(searchResults[1].is_series, false);
assert.ok(searchResults[1].title.includes('أشرف حرامي'));
assert.ok(searchResults._meta?.ok);

// 4b. Empty query handling
const emptySearch = await scrapeSearch('');
assert.equal(emptySearch.length, 0);
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 4c. Non-existent query fixture handling
const noResultsSearch = await scrapeSearch('xyznonexistent999xyz', 1, {
  fixtureHtml: EMPTY_SEARCH_HTML
});
assert.equal(noResultsSearch.length, 0);
assert.equal(noResultsSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. SERIES DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Fixture Scraping...');
const seriesDetails = await scrapeDetails('https://akwam.ss/series/1234/hulm-ashraf', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(seriesDetails.type, 'series');
assert.equal(seriesDetails.source, 'akwam');
assert.ok(seriesDetails.title.includes('حلم أشرف'));
assert.equal(seriesDetails.year, '2025');
assert.equal(seriesDetails.rating, '8.4');
assert.equal(seriesDetails.quality, '1080p WEB-DL');
assert.ok(seriesDetails.genres.includes('كوميدي'));
assert.ok(seriesDetails.genres.includes('دراما'));
assert.ok(seriesDetails.overview.includes('شاب يسعى لتحقيق أحلامه'));
assert.ok(Array.isArray(seriesDetails.episodes));
assert.equal(seriesDetails.episodes.length, 3);
assert.equal(seriesDetails.episodes[0].number, 1);
assert.equal(seriesDetails.episodes[1].number, 2);
assert.equal(seriesDetails.episodes[2].number, 3);
assert.ok(seriesDetails._meta?.ok);

// 6. STANDALONE EPISODES FIXTURE SCRAPING
console.log('6. Testing Standalone Episodes Fixture Scraping...');
const episodes = await scrapeEpisodes('https://akwam.ss/series/1234/hulm-ashraf', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 3);
assert.equal(episodes[0].number, 1);
assert.equal(episodes[0].season, 1);
assert.equal(episodes[0].source, 'akwam');
assert.equal(episodes[1].number, 2);
assert.equal(episodes[2].number, 3);
assert.ok(episodes[0].url.includes('/episode/89517/'));
assert.ok(episodes._meta?.ok);

// 7. MOVIE DETAILS FIXTURE SCRAPING
console.log('7. Testing Movie Details Fixture Scraping...');
const movieDetails = await scrapeDetails('https://akwam.ss/movie/5678/the-beekeeper-2024', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.equal(movieDetails.type, 'movie');
assert.equal(movieDetails.source, 'akwam');
assert.ok(movieDetails.title.includes('The Beekeeper'));
assert.equal(movieDetails.year, '2024');
assert.equal(movieDetails.rating, '7.6');
assert.ok(movieDetails.genres.includes('أكشن'));
assert.ok(movieDetails._meta?.ok);

// 8. SERVERS FIXTURE EXTRACTION
console.log('8. Testing Servers Fixture Extraction (from Downet player HTML)...');
const serversFromPlayer = await scrapeServers('https://akwam.ss/watch/9901/hulm-ashraf-ep1', {
  fixtureHtml: DOWNET_BRIDGE_HTML
});
assert.ok(Array.isArray(serversFromPlayer));
assert.ok(serversFromPlayer.length >= 3, `Expected at least 3 servers, got ${serversFromPlayer.length}`);
for (let i = 0; i < serversFromPlayer.length; i++) {
  const s = serversFromPlayer[i];
  assert.equal(s.code, `AK-${i + 1}`, `Server code must be AK-${i + 1}`);
  assert.equal(s.provider, 'akwam');
  assert.equal(s.type, 'mp4');
  assert.ok(s.url.startsWith('https://s201d1.downet.net/'));
  assert.ok(s.headers?.Referer);
}
assert.equal(serversFromPlayer[0].quality, '1080p');
assert.equal(serversFromPlayer[1].quality, '720p');
assert.equal(serversFromPlayer[2].quality, '480p');
assert.ok(serversFromPlayer._meta?.ok);

console.log('8b. Testing Multi-step Server Bridge via fixtures map...');
const serversMultiStep = await scrapeServers('https://akwam.ss/episode/89517/hulm-ashraf/الحلقة-1', {
  fixtures: FIXTURE_URL_MAP
});
assert.ok(Array.isArray(serversMultiStep));
assert.ok(serversMultiStep.length >= 1, `Multi-step server extraction returned ${serversMultiStep.length} servers`);
assert.equal(serversMultiStep[0].code, 'AK-1');
assert.equal(serversMultiStep[0].type, 'mp4');
assert.ok(serversMultiStep[0].url.includes('.downet.net'));
assert.ok(serversMultiStep._meta?.ok);

// 9. RESOLVE STREAM FIXTURE RESOLUTION
console.log('9. Testing Resolve Stream Fixture Resolution...');
const resolvedStream = await resolveStream('https://akwam.ss/watch/9901/hulm-ashraf-ep1', {
  fixtureHtml: DOWNET_BRIDGE_HTML
});
assert.equal(resolvedStream.ok, true);
assert.equal(resolvedStream.providerId, 'akwam');
assert.equal(resolvedStream.type, 'mp4');
assert.equal(resolvedStream.quality, '1080p');
assert.ok(resolvedStream.url.startsWith('https://s201d1.downet.net/media/token123/hulm-ashraf-1-1080p.mp4'));
assert.ok(resolvedStream.headers?.Referer);

console.log('9b. Testing Direct Media URL pass-through in resolveStream...');
const directMediaUrl = 'https://s201d1.downet.net/media/sample.mp4';
const directResolved = await resolveStream(directMediaUrl);
assert.equal(directResolved.ok, true);
assert.equal(directResolved.type, 'mp4');
assert.equal(directResolved.url, directMediaUrl);

// 10. LIVE CAPABILITY CONTRACT
console.log('10. Testing Live Capability Contract (UNSUPPORTED_CAPABILITY)...');
const liveRes = await scrapeLive();
assert.equal(liveRes.length, 0);
assert.equal(liveRes._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

// 11. BACKWARD-COMPATIBLE EXPORTS
console.log('11. Testing Backward-Compatible Exports...');
assert.equal(typeof scrapeAkwamCategory, 'function');
assert.equal(typeof scrapeAkwamCatalog, 'function');
assert.equal(typeof scrapeAkoamCatalog, 'function');
assert.equal(typeof searchAkwam, 'function');
assert.equal(typeof extractAkwamStreamsAndEpisodes, 'function');
assert.equal(AKWAM_CONFIG.code, 'AK');

const streamsAndEps = await extractAkwamStreamsAndEpisodes('https://akwam.ss/series/1234/hulm-ashraf', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(streamsAndEps.episodes));
assert.equal(streamsAndEps.episodes.length, 3);

console.log('\n=== All Akwam Fixture Tests Passed Successfully! ===');
