// scripts/providers/shahid4u.fixture.test.mjs
// Offline fixture test suite for شاهد فور يو (Shahid4U, code: SU)

import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractShahid4uStreamsAndEpisodes,
  searchShahid4u,
  scrapeShahid4uCategory
} from '../../server/scrapers/sites/shahid4u.mjs';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  MOVIE_DETAILS_HTML,
  SERIES_DETAILS_HTML
} from '../fixtures/providers/shahid4u.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting Shahid4U Fixture Test Suite ===');

// 1. Metadata contract
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'shahid4u');
assert.equal(PROVIDER_META.code, 'SU');
assert.ok(Array.isArray(PROVIDER_META.domains));
assert.ok(PROVIDER_META.capabilities.catalog);
assert.ok(PROVIDER_META.capabilities.search);
assert.ok(PROVIDER_META.capabilities.details);
assert.ok(PROVIDER_META.capabilities.episodes);
assert.ok(PROVIDER_META.capabilities.servers);
assert.ok(PROVIDER_META.capabilities.resolve);

// 2. Fixture Metadata
console.log('2. Testing Fixture Metadata...');
assert.equal(FIXTURE_META.providerId, 'shahid4u');
assert.equal(FIXTURE_META.isRealLiveSample, true);

// 3. Catalog scraping with fixture
console.log('3. Testing Catalog Fixture Scraping...');
const catalog = await scrapeCatalog('movies_foreign', 1, { fixtureHtml: CATALOG_HTML });
assert.ok(Array.isArray(catalog));
assert.equal(catalog.length, 3);
assert.equal(catalog[0].title, 'فيلم The Batman 2022 مترجم');
assert.equal(catalog[0].code, 'SU');
assert.equal(catalog[0].type, 'movie');
assert.equal(catalog[2].type, 'series');

// 4. Search scraping with fixture
console.log('4. Testing Search Fixture Scraping...');
const searchRes = await scrapeSearch('batman', 1, { fixtureHtml: SEARCH_HTML });
assert.ok(Array.isArray(searchRes));
assert.equal(searchRes.length, 1);
assert.equal(searchRes[0].title, 'فيلم The Batman 2022 مترجم');

// 4b. Empty query
const emptyQuery = await scrapeSearch('', 1);
assert.equal(emptyQuery.length, 0);
assert.equal(emptyQuery._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. Details scraping (movie)
console.log('5. Testing Movie Details Fixture Scraping...');
const movieDetails = await scrapeDetails('https://shahidfu.cam/film/the-batman-2022', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(movieDetails);
assert.ok(movieDetails.title.includes('The Batman'));
assert.equal(movieDetails.is_series, false);
assert.ok(Array.isArray(movieDetails.servers));
assert.equal(movieDetails.servers.length, 2);
assert.equal(movieDetails.servers[0].code, 'SU-1');
assert.equal(movieDetails.servers[1].code, 'SU-2');

// 6. Details scraping (series) and episodes
console.log('6. Testing Series Details & Episodes Fixture Scraping...');
const seriesDetails = await scrapeDetails('https://shahidfu.cam/series/the-penguin-season-1', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(seriesDetails);
assert.equal(seriesDetails.is_series, true);
assert.ok(Array.isArray(seriesDetails.episodes));
assert.equal(seriesDetails.episodes.length, 2);

const episodes = await scrapeEpisodes('https://shahidfu.cam/series/the-penguin-season-1', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 2);
assert.equal(episodes[0].number, 1);
assert.equal(episodes[1].number, 2);

// 7. Server extraction
console.log('7. Testing Server Extraction...');
const servers = await scrapeServers('https://shahidfu.cam/watch/the-batman-2022', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(Array.isArray(servers));
assert.equal(servers.length, 2);
assert.equal(servers[0].code, 'SU-1');
assert.equal(servers[0].type, 'embed');
assert.equal(servers[0].verified, false);

// 8. Stream resolve
console.log('8. Testing Stream Resolution...');
const resolvedEmbed = await resolveStream('https://ukrcdn.club/embed/batman');
assert.ok(resolvedEmbed);
assert.equal(resolvedEmbed.type, 'embed');
assert.equal(resolvedEmbed.verified, false);

// 9. Backward compatibility exports
console.log('9. Testing Backward-Compatible Exports...');
assert.equal(typeof extractShahid4uStreamsAndEpisodes, 'function');
assert.equal(typeof searchShahid4u, 'function');
assert.equal(typeof scrapeShahid4uCategory, 'function');

console.log('=== All Shahid4U Fixture Tests Passed Successfully! ===');
