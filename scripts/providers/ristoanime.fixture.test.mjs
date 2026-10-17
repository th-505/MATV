// scripts/providers/ristoanime.fixture.test.mjs
// Offline fixture test suite for RistoAnime (ristoanime, code: RE)

import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/ristoanime.mjs';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  DETAILS_HTML,
  EPISODE_DETAILS_HTML,
  WATCH_HTML
} from '../fixtures/providers/ristoanime.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting RistoAnime Fixture Test Suite ===');

// 1. Metadata contract
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'ristoanime');
assert.equal(PROVIDER_META.code, 'RE');
assert.ok(PROVIDER_META.capabilities.catalog);
assert.ok(PROVIDER_META.capabilities.search);
assert.ok(PROVIDER_META.capabilities.details);
assert.ok(PROVIDER_META.capabilities.episodes);
assert.ok(PROVIDER_META.capabilities.servers);
assert.ok(PROVIDER_META.capabilities.resolve);

// 2. Fixture metadata
console.log('2. Testing Fixture Metadata...');
assert.equal(FIXTURE_META.providerId, 'ristoanime');
assert.equal(FIXTURE_META.isRealLiveSample, true);

// 3. Catalog scraping with fixture
console.log('3. Testing Catalog Fixture Scraping...');
const catalog = await scrapeCatalog('series', 1, { fixtureHtml: CATALOG_HTML });
assert.ok(Array.isArray(catalog));
assert.ok(catalog.length > 0);
assert.ok(catalog[0].title);
assert.ok(catalog[0].url);

// 4. Search scraping with fixture
console.log('4. Testing Search Fixture Scraping...');
const searchRes = await scrapeSearch('one piece', 1, { fixtureHtml: SEARCH_HTML });
assert.ok(Array.isArray(searchRes));
assert.ok(searchRes.length > 0);
assert.ok(searchRes[0].title.toLowerCase().includes('one piece'));

// 4b. Empty query
const emptyQuery = await scrapeSearch('', 1);
assert.equal(emptyQuery.length, 0);
assert.equal(emptyQuery._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. Details scraping (series)
console.log('5. Testing Series Details Fixture Scraping...');
const seriesDetails = await scrapeDetails(FIXTURE_META.urls.details, {
  fixtureHtml: DETAILS_HTML
});
assert.ok(seriesDetails);
assert.ok(seriesDetails.title);
assert.equal(seriesDetails.is_series, true);

// 6. Episodes extraction
console.log('6. Testing Episodes Extraction...');
const episodes = await scrapeEpisodes(FIXTURE_META.urls.details, {
  fixtureHtml: DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.ok(episodes.length > 0);

// 7. Server extraction
console.log('7. Testing Server Extraction from Watch HTML...');
const servers = await scrapeServers(FIXTURE_META.urls.watch, {
  fixtureHtml: WATCH_HTML
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length > 0);

// 8. Stream resolution
console.log('8. Testing Stream Resolution...');
const resolved = await resolveStream('https://vidmoly.org/embed-bq9rmr4qfeoy.html');
assert.ok(resolved);
assert.ok(resolved.type === 'm3u8' || resolved.type === 'embed');
if (resolved.type === 'm3u8') {
  assert.equal(resolved.verified, true);
}

console.log('=== All RistoAnime Fixture Tests Passed Successfully! ===');
