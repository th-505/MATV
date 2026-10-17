// scripts/providers/mycima.fixture.test.mjs
// Offline fixture test suite for ماي سيما / وي سيما (MyCima / WeCima, code: MA)

import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractMyCimaStreamsAndEpisodes,
  searchMyCima,
  scrapeMyCimaCategory
} from '../../server/scrapers/sites/mycima.mjs';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  MOVIE_DETAILS_HTML,
  SERIES_DETAILS_HTML
} from '../fixtures/providers/mycima.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting MyCima Fixture Test Suite ===');

// 1. Metadata contract
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'mycima');
assert.equal(PROVIDER_META.code, 'MA');
assert.ok(Array.isArray(PROVIDER_META.domains));
assert.ok(PROVIDER_META.capabilities.catalog);
assert.ok(PROVIDER_META.capabilities.search);
assert.ok(PROVIDER_META.capabilities.details);
assert.ok(PROVIDER_META.capabilities.episodes);
assert.ok(PROVIDER_META.capabilities.servers);
assert.ok(PROVIDER_META.capabilities.resolve);

// 2. Fixture Metadata
console.log('2. Testing Fixture Metadata...');
assert.equal(FIXTURE_META.providerId, 'mycima');
assert.equal(FIXTURE_META.isRealLiveSample, true);

// 3. Catalog scraping with fixture
console.log('3. Testing Catalog Fixture Scraping...');
const catalog = await scrapeCatalog('movies_all', 1, { fixtureHtml: CATALOG_HTML });
assert.ok(Array.isArray(catalog));
assert.equal(catalog.length, 3);
assert.equal(catalog[0].title, 'فيلم The Batman');
assert.equal(catalog[0].code, 'MA');
assert.equal(catalog[0].type, 'movie');
assert.equal(catalog[2].type, 'series');

// 4. Search scraping with fixture
console.log('4. Testing Search Fixture Scraping...');
const searchRes = await scrapeSearch('batman', 1, { fixtureHtml: SEARCH_HTML });
assert.ok(Array.isArray(searchRes));
assert.equal(searchRes.length, 1);
assert.equal(searchRes[0].title, 'فيلم The Batman');

// 4b. Empty query
const emptyQuery = await scrapeSearch('', 1);
assert.equal(emptyQuery.length, 0);
assert.equal(emptyQuery._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. Details scraping (movie)
console.log('5. Testing Movie Details Fixture Scraping...');
const movieDetails = await scrapeDetails('https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(movieDetails);
assert.ok(movieDetails.title.includes('The Batman'));
assert.equal(movieDetails.is_series, false);
assert.ok(Array.isArray(movieDetails.servers));
assert.equal(movieDetails.servers.length, 4); // 2 direct download + 2 watch embeds
assert.equal(movieDetails.servers[0].code, 'MA-1');
assert.equal(movieDetails.servers[0].verified, true);
assert.equal(movieDetails.servers[2].code, 'MA-3');
assert.equal(movieDetails.servers[2].verified, false);

// 6. Details scraping (series) and episodes
console.log('6. Testing Series Details & Episodes Fixture Scraping...');
const seriesDetails = await scrapeDetails('https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-1/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(seriesDetails);
assert.equal(seriesDetails.is_series, true);
assert.ok(Array.isArray(seriesDetails.episodes));
assert.equal(seriesDetails.episodes.length, 3);

const episodes = await scrapeEpisodes('https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-1/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 3);
assert.equal(episodes[0].number, 1);
assert.equal(episodes[1].number, 2);
assert.equal(episodes[2].number, 3);

// 7. Server extraction
console.log('7. Testing Server Extraction...');
const servers = await scrapeServers('https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/', {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.ok(Array.isArray(servers));
assert.equal(servers.length, 4);
assert.equal(servers[0].code, 'MA-1');
assert.equal(servers[0].type, 'mp4');
assert.equal(servers[0].verified, true);
assert.equal(servers[2].code, 'MA-3');
assert.equal(servers[2].type, 'embed');
assert.equal(servers[2].verified, false);

// 8. Stream resolve
console.log('8. Testing Stream Resolution...');
const resolvedMp4 = await resolveStream('https://direct.mycima.stream/download/batman-1080p.mp4');
assert.ok(resolvedMp4);
assert.equal(resolvedMp4.type, 'mp4');
assert.equal(resolvedMp4.verified, true);

const resolvedEmbed = await resolveStream('https://ukrcdn.club/embed/batman');
assert.ok(resolvedEmbed);
assert.equal(resolvedEmbed.type, 'embed');
assert.equal(resolvedEmbed.verified, false);

// 9. Backward compatibility exports
console.log('9. Testing Backward-Compatible Exports...');
assert.equal(typeof extractMyCimaStreamsAndEpisodes, 'function');
assert.equal(typeof searchMyCima, 'function');
assert.equal(typeof scrapeMyCimaCategory, 'function');

console.log('=== All MyCima Fixture Tests Passed Successfully! ===');
