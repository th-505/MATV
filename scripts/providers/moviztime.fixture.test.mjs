// scripts/providers/moviztime.fixture.test.mjs
// Offline fixture test suite for Moviz Time (وقت الأفلام - moviztime, code: ME)

import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/moviztime.mjs';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  MOVIE_DETAILS_HTML,
  SERIES_DETAILS_HTML,
  EPISODE_WATCH_HTML,
  AJAX_PLAYER_RESPONSE
} from '../fixtures/providers/moviztime.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting MovizTime Fixture Test Suite ===');

// 1. Metadata contract
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'moviztime');
assert.equal(PROVIDER_META.code, 'ME');
assert.ok(PROVIDER_META.capabilities.catalog);
assert.ok(PROVIDER_META.capabilities.search);
assert.ok(PROVIDER_META.capabilities.details);
assert.ok(PROVIDER_META.capabilities.episodes);
assert.ok(PROVIDER_META.capabilities.servers);
assert.ok(PROVIDER_META.capabilities.resolve);

// 2. Fixture metadata
console.log('2. Testing Fixture Metadata...');
assert.equal(FIXTURE_META.providerId, 'moviztime');
assert.equal(FIXTURE_META.isRealLiveSample, true);

// 3. Catalog scraping with fixture
console.log('3. Testing Catalog Fixture Scraping...');
const catalog = await scrapeCatalog('movies', 1, { fixtureHtml: CATALOG_HTML });
assert.ok(Array.isArray(catalog));
assert.ok(catalog.length > 0);
assert.ok(catalog[0].title);
assert.ok(catalog[0].url);
assert.equal(catalog[0].type, 'movie', 'Movie names containing “ona” (e.g. MacDonald) must not be inferred as anime');

// 4. Search scraping with fixture
console.log('4. Testing Search Fixture Scraping...');
const searchRes = await scrapeSearch('batman', 1, { fixtureHtml: SEARCH_HTML });
assert.ok(Array.isArray(searchRes));
assert.ok(searchRes.length > 0);
assert.ok(searchRes[0].title.toLowerCase().includes('batman'));

// 4b. Empty query
const emptyQuery = await scrapeSearch('', 1);
assert.equal(emptyQuery.length, 0);
assert.equal(emptyQuery._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. Details scraping (movie)
console.log('5. Testing Movie Details Fixture Scraping...');
const movieDetails = await scrapeDetails(FIXTURE_META.urls.movieDetails, {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(movieDetails);
assert.ok(movieDetails.title);
assert.equal(movieDetails.is_series, false);

// 6. Details scraping (series) and episodes
console.log('6. Testing Series Details & Episodes Fixture Scraping...');
const seriesDetails = await scrapeDetails(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(seriesDetails);
assert.equal(seriesDetails.is_series, true);
assert.ok(Array.isArray(seriesDetails.episodes));
assert.ok(seriesDetails.episodes.length > 0);

const episodes = await scrapeEpisodes(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.ok(episodes.length > 0);

// 7. Server extraction
console.log('7. Testing Server Extraction...');
const servers = await scrapeServers(FIXTURE_META.urls.episodeWatch, {
  fixtureHtml: EPISODE_WATCH_HTML
});
assert.ok(Array.isArray(servers));

// 8. Stream resolution
console.log('8. Testing Stream Resolution...');
const resolved = await resolveStream('https://cdn.example.com/video.m3u8');
assert.ok(resolved);
assert.equal(resolved.type, 'm3u8');

const htmlPlayer = await resolveStream('https://vidhls.com/player/index.php?data=fixture', {
  ajaxFixtureResponse: AJAX_PLAYER_RESPONSE,
  resourceProbeFixture: { status: 200, contentType: 'text/html; charset=UTF-8' }
});
assert.equal(htmlPlayer.type, 'embed', 'HTML player responses must not be returned as direct media');
assert.equal(htmlPlayer.verified, false);
assert.equal(htmlPlayer.url, 'https://vidhls.com/player/index.php?data=fixture');

console.log('=== All MovizTime Fixture Tests Passed Successfully! ===');
