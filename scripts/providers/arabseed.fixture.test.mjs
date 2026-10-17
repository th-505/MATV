// scripts/providers/arabseed.fixture.test.mjs
// Offline fixture validation test suite for ArabSeed provider (عرب سيد, code: AD)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  EMPTY_SEARCH_HTML,
  SERIES_DETAILS_HTML,
  WATCH_PAGE_HTML
} from '../fixtures/providers/arabseed.fixture.mjs';

import {
  PROVIDER_META,
  ARABSEED_CONFIG,
  rewriteToActiveArabSeedDomain,
  resolveArabSeedTargetUrl,
  encodeArabSeedRef,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/arabseed.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting ArabSeed Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'arabseed');
assert.equal(PROVIDER_META.code, 'AD');
assert.ok(PROVIDER_META.name.includes('عرب سيد'));
assert.ok(PROVIDER_META.domains.includes('https://www.arabseed.wine'));
assert.ok(PROVIDER_META.domains.includes('https://asd.homes'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.equal(PROVIDER_META.searchSpec.queryParam, 'find');
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/find/?find={query}');

// 2. DOMAIN REWRITING & REF RESOLUTION
console.log('2. Testing Domain Rewriting & Target Resolution...');
assert.equal(
  rewriteToActiveArabSeedDomain('https://arabseed.show/movies/test/'),
  'https://www.arabseed.wine/movies/test/'
);
assert.equal(
  rewriteToActiveArabSeedDomain('https://asd.homes/watch/test-1/'),
  'https://www.arabseed.wine/watch/test-1/'
);
assert.equal(
  rewriteToActiveArabSeedDomain('/movies/demo/'),
  'https://www.arabseed.wine/movies/demo/'
);

const ref = encodeArabSeedRef('https://www.arabseed.wine/series/test-series/');
assert.ok(ref.startsWith('arabseed:'));
const resolvedUrl = resolveArabSeedTargetUrl(ref);
assert.equal(resolvedUrl, 'https://www.arabseed.wine/series/test-series/');

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('movies_foreign', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 4, 'Catalog fixture contains 4 items');
assert.equal(catalogItems[0].source, 'arabseed');
assert.equal(catalogItems[0].serverPrefix, 'AD');
assert.equal(catalogItems[0].type, 'movie');
assert.equal(catalogItems[0].is_series, false);
assert.ok(catalogItems[0].ref.startsWith('arabseed:'));
assert.ok(catalogItems[0].url.startsWith('https://www.arabseed.wine/movies/'));
assert.ok(catalogItems[0].poster.startsWith('https://www.arabseed.wine/wp-content/'));
assert.ok(catalogItems[0].title.includes('Batman Part II 2026'));
assert.equal(catalogItems[0].year, '2026');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// Verify series item in catalog
const seriesItem = catalogItems[1];
assert.equal(seriesItem.type, 'series');
assert.equal(seriesItem.is_series, true);
assert.ok(seriesItem.title.includes('المؤسس عثمان'));

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('عثمان', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 2);
assert.equal(searchResults[0].source, 'arabseed');
assert.equal(searchResults[0].serverPrefix, 'AD');
assert.ok(searchResults[0].title.includes('المؤسس عثمان'));
assert.ok(searchResults._meta?.ok);

// 4b. Empty search error handling
const emptyQuery = await scrapeSearch('');
assert.equal(emptyQuery.length, 0);
assert.equal(emptyQuery._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

const emptyResults = await scrapeSearch('nonexistent', 1, {
  fixtureHtml: EMPTY_SEARCH_HTML
});
assert.equal(emptyResults.length, 0);
assert.equal(emptyResults._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Scraping...');
const details = await scrapeDetails('https://www.arabseed.wine/series/al-muassis-osman-season-6/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(details.title.includes('المؤسس عثمان'));
assert.equal(details.type, 'series');
assert.equal(details.year, '2024');
assert.ok(details.poster.startsWith('https://www.arabseed.wine/wp-content/'));
assert.ok(details.overview.includes('الغازي عثمان'));
assert.ok(Array.isArray(details.genres));
assert.ok(details.genres.includes('تاريخي'));
assert.ok(Array.isArray(details.episodes));
assert.equal(details.episodes.length, 4);
assert.ok(details._meta?.ok);

// 6. EPISODES FIXTURE SCRAPING
console.log('6. Testing Standalone Episode List Extraction...');
const episodes = await scrapeEpisodes('https://www.arabseed.wine/series/al-muassis-osman-season-6/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 4);
for (let i = 0; i < episodes.length; i++) {
  assert.equal(episodes[i].number, i + 1);
  assert.equal(episodes[i].season, 6);
  assert.equal(episodes[i].source, 'arabseed');
  assert.ok(episodes[i].url.startsWith('https://www.arabseed.wine/watch/'));
  assert.ok(episodes[i].ref.startsWith('arabseed:'));
}
assert.ok(episodes._meta?.ok);

// 7. SERVERS FIXTURE EXTRACTION
console.log('7. Testing Server Extraction from Watch Page...');
const servers = await scrapeServers('https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/', {
  fixtureHtml: WATCH_PAGE_HTML
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 2, `Expected at least 2 servers, got ${servers.length}`);
assert.equal(servers[0].code, 'AD-1');
assert.equal(servers[0].provider, 'arabseed');
assert.equal(servers[0].type, 'm3u8');
assert.equal(servers[0].url, 'https://stream1.asd.homes/vid.m3u8');

assert.equal(servers[1].code, 'AD-2');
assert.equal(servers[1].type, 'mp4');
assert.equal(servers[1].url, 'https://stream1.asd.homes/vid.mp4');
assert.ok(servers._meta?.ok);

// 8. STREAM RESOLUTION
console.log('8. Testing Stream Resolution...');
// a) Direct media resolution
const directResolved = await resolveStream('https://stream1.asd.homes/vid.m3u8');
assert.equal(directResolved.ok, true);
assert.equal(directResolved.providerId, 'arabseed');
assert.equal(directResolved.type, 'm3u8');
assert.equal(directResolved.url, 'https://stream1.asd.homes/vid.m3u8');

// b) Watch page resolution
const watchResolved = await resolveStream('https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/', {
  fixtureHtml: WATCH_PAGE_HTML
});
assert.equal(watchResolved.ok, true);
assert.equal(watchResolved.providerId, 'arabseed');
assert.ok(watchResolved.url.startsWith('https://stream1.asd.homes/'));

console.log('=== All ArabSeed Fixture Tests PASSED Successfully! ===');
