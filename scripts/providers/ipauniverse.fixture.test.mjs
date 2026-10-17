// scripts/providers/ipauniverse.fixture.test.mjs
// Offline fixture-based unit test suite for IPA Universe scraper (IE)
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  IPAUNIVERSE_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractIpaUniverseStreams
} from '../../server/scrapers/sites/ipauniverse.mjs';
import {
  FIXTURE_META,
  HOME_HTML,
  DETAIL_PAGE_HTML,
  REAL_TMDB_CATALOG_JSON,
  REAL_TMDB_SEARCH_JSON,
  REAL_TMDB_DETAIL_550_JSON,
  SPECIAL_CASE_FIXTURES,
  SYNTHETIC_VIDEO_EMBED_HTML,
  SYNTHETIC_RENDERED_CATALOG_HTML
} from '../fixtures/providers/ipauniverse.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('--- Starting IPA Universe (IE) Offline Fixture Test Suite ---');

// 1. Meta Contract Validation
console.log('1. Checking PROVIDER_META and IPAUNIVERSE_CONFIG...');
assert.equal(PROVIDER_META.id, 'ipauniverse');
assert.equal(PROVIDER_META.name, 'IPA Universe');
assert.equal(PROVIDER_META.code, 'IE');
assert.deepEqual(PROVIDER_META.domains, ['https://watch.ipauniverse.com']);
assert.equal(PROVIDER_META.mirrorOf, null);
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, Boolean(process.env.TMDB_API_KEY || process.env.TMDB_V4_TOKEN));
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, false);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);

assert.ok(PROVIDER_META.notImplemented.catalog);
assert.ok(PROVIDER_META.notImplemented.search);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.ok(PROVIDER_META.searchSpec.pathTemplate.includes('themoviedb.org'));
assert.equal(PROVIDER_META.searchSpec.queryParam, 'query');

assert.equal(IPAUNIVERSE_CONFIG.id, 'ipauniverse');
assert.equal(IPAUNIVERSE_CONFIG.code, 'IE');
console.log('✓ PROVIDER_META conforms strictly to specification');

// 2. Fixture Metadata Isolation Check
console.log('2. Verifying fixture isolation between live captures and synthetic cases...');
assert.equal(FIXTURE_META.isRealLiveSample, true);
assert.equal(REAL_TMDB_CATALOG_JSON.isRealLiveSample, true);
assert.equal(REAL_TMDB_SEARCH_JSON.isRealLiveSample, true);
assert.equal(REAL_TMDB_DETAIL_550_JSON.isRealLiveSample, true);
assert.equal(SPECIAL_CASE_FIXTURES.isSyntheticSpecialCase, true);
assert.equal(SPECIAL_CASE_FIXTURES.videoEmbedPage.isSyntheticSpecialCase, true);
assert.equal(SPECIAL_CASE_FIXTURES.renderedCatalogPage.isSyntheticSpecialCase, true);
console.log('✓ Fixture metadata isolation verified');

// 3. Catalog Scraper - Synthetic DOM Cards
console.log('3. Testing scrapeCatalog with synthetic pre-rendered HTML...');
const renderedCatalogResult = await scrapeCatalog('popular', 1, {
  fixtureHtml: SYNTHETIC_RENDERED_CATALOG_HTML
});
assert.equal(renderedCatalogResult._meta.ok, true);
assert.equal(renderedCatalogResult.length, 1);
assert.equal(renderedCatalogResult[0].title, 'Fight Club');
assert.equal(renderedCatalogResult[0].year, '1999');
assert.equal(renderedCatalogResult[0].rating, '8.4');
assert.equal(renderedCatalogResult[0].url, 'https://watch.ipauniverse.com/detail.html?id=550');
assert.equal(renderedCatalogResult[0].serverPrefix, 'IE');
console.log('✓ Catalog parsed correctly from pre-rendered synthetic HTML cards');

// 4. Catalog Scraper - TMDb JSON Fixture
console.log('4. Testing scrapeCatalog with TMDb JSON fixture...');
const tmdbCatalogResult = await scrapeCatalog('popular', 1, {
  fixtureTmdbJson: REAL_TMDB_CATALOG_JSON
});
assert.equal(tmdbCatalogResult._meta.ok, true);
assert.equal(tmdbCatalogResult.length, 3);
assert.equal(tmdbCatalogResult[0].title, 'Spider-Man: Brand New Day');
assert.equal(tmdbCatalogResult[0].year, '2026');
assert.equal(tmdbCatalogResult[0].url, 'https://watch.ipauniverse.com/detail.html?id=969681');
console.log('✓ Catalog parsed correctly from TMDb JSON fixture');

// 5. Catalog Scraper - NOT_IMPLEMENTED when TMDb unconfigured
console.log('5. Testing scrapeCatalog returns NOT_IMPLEMENTED when TMDb key is unconfigured...');
const unconfiguredCatalogResult = await scrapeCatalog('popular', 1, {
  fixtureHtml: HOME_HTML,
  disableDefaultTmdbKey: true,
  tmdbApiKey: ''
});
assert.equal(unconfiguredCatalogResult._meta.ok, false);
assert.equal(unconfiguredCatalogResult._meta.errorCode, SCRAPER_ERROR_CODES.NOT_IMPLEMENTED);
assert.match(unconfiguredCatalogResult._meta.errorMessage, /TMDb API key is not configured/i);
console.log('✓ scrapeCatalog returns NOT_IMPLEMENTED as required when unconfigured');

// 6. Search Scraper - Empty Query
console.log('6. Testing scrapeSearch with empty query...');
const emptySearchResult = await scrapeSearch('   ', 1);
assert.equal(emptySearchResult.length, 0);
assert.equal(emptySearchResult._meta.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('✓ Empty search returns EMPTY_RESULT correctly');

// 7. Search Scraper - Synthetic HTML
console.log('7. Testing scrapeSearch with synthetic pre-rendered HTML...');
const syntheticSearchResult = await scrapeSearch('Fight Club', 1, {
  fixtureHtml: SYNTHETIC_RENDERED_CATALOG_HTML
});
assert.equal(syntheticSearchResult._meta.ok, true);
assert.equal(syntheticSearchResult.length, 1);
assert.equal(syntheticSearchResult[0].title, 'Fight Club');
console.log('✓ Search filtered correctly from synthetic HTML');

// 8. Search Scraper - TMDb JSON Fixture
console.log('8. Testing scrapeSearch with TMDb JSON fixture...');
const tmdbSearchResult = await scrapeSearch('Fight Club', 1, {
  fixtureTmdbJson: REAL_TMDB_SEARCH_JSON
});
assert.equal(tmdbSearchResult._meta.ok, true);
assert.equal(tmdbSearchResult.length, 2);
assert.equal(tmdbSearchResult[0].id, '550');
assert.equal(tmdbSearchResult[0].title, 'Fight Club');
assert.equal(tmdbSearchResult[0].url, 'https://watch.ipauniverse.com/detail.html?id=550');
console.log('✓ Search parsed correctly from TMDb search JSON fixture');

// 9. Search Scraper - NOT_IMPLEMENTED when TMDb unconfigured
console.log('9. Testing scrapeSearch returns NOT_IMPLEMENTED when TMDb key is unconfigured...');
const unconfiguredSearchResult = await scrapeSearch('Fight Club', 1, {
  fixtureHtml: HOME_HTML,
  disableDefaultTmdbKey: true,
  tmdbApiKey: ''
});
assert.equal(unconfiguredSearchResult._meta.ok, false);
assert.equal(unconfiguredSearchResult._meta.errorCode, SCRAPER_ERROR_CODES.NOT_IMPLEMENTED);
assert.match(unconfiguredSearchResult._meta.errorMessage, /TMDb API key is not configured/i);
console.log('✓ scrapeSearch returns NOT_IMPLEMENTED as required when unconfigured');

// 10. Details Scraper - Synthetic Pre-rendered DOM
console.log('10. Testing scrapeDetails with synthetic pre-rendered HTML...');
const syntheticDetailResult = await scrapeDetails('https://watch.ipauniverse.com/detail.html?id=550', {
  fixtureHtml: SYNTHETIC_VIDEO_EMBED_HTML
});
assert.equal(syntheticDetailResult._meta.ok, true);
assert.equal(syntheticDetailResult.title, 'Fight Club');
assert.equal(syntheticDetailResult.year, '1999');
assert.deepEqual(syntheticDetailResult.genres, ['Drama', 'Thriller']);
assert.ok(syntheticDetailResult.servers.length >= 1);
console.log('✓ Details parsed correctly from synthetic pre-rendered HTML');

// 11. Details Scraper - TMDb JSON Fixture & Contract Contract Check
console.log('11. Testing scrapeDetails with TMDb JSON fixture (Movie ID 550)...');
const tmdbDetailResult = await scrapeDetails('detail.html?id=550', {
  fixtureDetailsJson: REAL_TMDB_DETAIL_550_JSON
});
assert.equal(tmdbDetailResult._meta.ok, true);
assert.equal(tmdbDetailResult.title, 'Fight Club');
assert.equal(tmdbDetailResult.year, '1999');
assert.equal(tmdbDetailResult.runtime, '139m');
assert.equal(tmdbDetailResult.rating, '8.4');
assert.equal(tmdbDetailResult.imdb_id, 'tt0137523');
assert.equal(tmdbDetailResult.tmdb_id, '550');
assert.ok(tmdbDetailResult.cast.includes('Edward Norton'));
assert.ok(tmdbDetailResult.directors.includes('David Fincher'));

// 12. Verification Distinction: Embed Server must be type: 'embed' and verified: false
console.log('12. Verifying embed server typing and verified: false distinction...');
assert.ok(tmdbDetailResult.servers.length >= 1);
const embedServer = tmdbDetailResult.servers[0];
assert.equal(embedServer.type, 'embed');
assert.equal(embedServer.streamType, 'embed');
assert.equal(embedServer.verified, false, 'Embed URL must NEVER be marked verified: true');
assert.equal(embedServer.url, 'https://vidsrc.to/embed/movie/550');
assert.equal(embedServer.code, 'IE-1');
console.log('✓ Embed server typing and verified: false strictly verified');

// 13. Episodes Scraper - Unsupported Capability
console.log('13. Testing scrapeEpisodes returns UNSUPPORTED_CAPABILITY...');
const episodesResult = await scrapeEpisodes('detail.html?id=550', {
  fixtureHtml: DETAIL_PAGE_HTML
});
assert.equal(episodesResult._meta.ok, false);
assert.equal(episodesResult._meta.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);
assert.match(episodesResult._meta.errorMessage, /movies-only portal/i);
console.log('✓ scrapeEpisodes accurately reports UNSUPPORTED_CAPABILITY');

// 14. Servers & Stream Resolution
console.log('14. Testing scrapeServers and resolveStream...');
const serversResult = await scrapeServers('ipauniverse:550', {
  fixtureHtml: DETAIL_PAGE_HTML
});
assert.equal(serversResult._meta.ok, true);
assert.ok(serversResult.length >= 1);
assert.equal(serversResult[0].type, 'embed');
assert.equal(serversResult[0].verified, false);

const resolveResult = await resolveStream('550', {
  fixtureHtml: DETAIL_PAGE_HTML
});
assert.equal(resolveResult._meta.ok, true);
assert.equal(resolveResult.type, 'embed');
assert.equal(resolveResult.streamType, 'embed');
assert.equal(resolveResult.verified, false);
assert.equal(resolveResult.streamUrl, 'https://vidsrc.to/embed/movie/550');
console.log('✓ resolveStream correctly resolves embed with verified: false');

// 15. SSRF Guard
console.log('15. Testing SSRF protection in resolveTargetUrl...');
const unsafeDetails = await scrapeDetails('http://127.0.0.1:8080/exploit');
assert.equal(unsafeDetails._meta.ok, false);
assert.equal(unsafeDetails._meta.errorCode, SCRAPER_ERROR_CODES.UNSAFE_URL);
console.log('✓ SSRF guard successfully blocks private IP');

// 16. Backward compatibility with extractIpaUniverseStreams
console.log('16. Testing extractIpaUniverseStreams backward compatibility...');
const legacyResult = await extractIpaUniverseStreams('detail.html?id=550', {
  fixtureDetailsJson: REAL_TMDB_DETAIL_550_JSON
});
assert.equal(legacyResult._meta.ok, true);
assert.equal(legacyResult.title, 'Fight Club');
assert.equal(legacyResult.source, 'ipauniverse');
assert.ok(legacyResult.servers.length >= 1);
console.log('✓ extractIpaUniverseStreams backward compatibility confirmed');

console.log('\n======================================================');
console.log(' ALL 16 IPA UNIVERSE FIXTURE TESTS PASSED WITH SUCCESS ');
console.log('======================================================\n');
