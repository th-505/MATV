// scripts/providers/cimanow.fixture.test.mjs
// Offline fixture validation test suite for CimaNow provider (سيما ناو, code: CW)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  EMPTY_SEARCH_HTML,
  MOVIE_DETAILS_HTML,
  SERIES_EPISODES_DETAILS_HTML,
  WATCH_PAGE_HTML,
  DOWNLOAD_PAGE_HTML,
  RESOLVE_API_JSON,
  DIRECT_STREAM_SAMPLE,
  LEGACY_CIMANOW_CATALOG_HTML,
  LEGACY_CIMANOW_WATCHING_HTML,
  SYNTHETIC_ARABIC_DIGITS_HTML
} from '../fixtures/providers/cimanow.fixture.mjs';

import {
  PROVIDER_META,
  CIMANOW_CONFIG,
  rewriteToActiveCimaNowDomain,
  resolveCimaNowTargetUrl,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeCimaNowCategory,
  extractCimaNowStreamsAndEpisodes
} from '../../server/scrapers/sites/cimanow.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting CimaNow Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'cimanow');
assert.equal(PROVIDER_META.code, 'CW');
assert.equal(PROVIDER_META.name, 'سيما ناو (CimaNow)');
assert.ok(PROVIDER_META.domains.includes('https://cimanow.me'));
assert.ok(PROVIDER_META.domains.includes('https://vip.cimanowinc.com'));
assert.ok(PROVIDER_META.domains.includes('https://cimanow.net'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/search?s={query}');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');

// 2. DOMAIN REWRITING & TARGET RESOLUTION
console.log('2. Testing Domain Rewriting & Target Resolution...');
assert.equal(
  rewriteToActiveCimaNowDomain('https://vip.cimanowinc.com/film/test-movie/'),
  'https://cimanow.me/film/test-movie/'
);
assert.equal(
  rewriteToActiveCimaNowDomain('https://cimanow.cc/watch/test-episode/'),
  'https://cimanow.me/watch/test-episode/'
);
assert.equal(
  rewriteToActiveCimaNowDomain('https://cimanow.net/category/movies/'),
  'https://cimanow.me/category/movies/'
);
assert.equal(
  rewriteToActiveCimaNowDomain('/watch/movie-1/'),
  'https://cimanow.me/watch/movie-1/'
);

const encodedRef = resolveCimaNowTargetUrl(`cimanow:${Buffer.from('https://cimanow.me/film/demo/').toString('base64url')}`);
assert.equal(encodedRef, 'https://cimanow.me/film/demo/');

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('movies_foreign', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 4, 'Catalog fixture contains 4 items');
assert.equal(catalogItems[0].source, 'cimanow');
assert.equal(catalogItems[0].serverPrefix, 'CW');
assert.equal(catalogItems[0].type, 'movie');
assert.equal(catalogItems[0].is_series, false);
assert.ok(catalogItems[0].ref.startsWith('cimanow:'));
assert.ok(catalogItems[0].url.startsWith('https://cimanow.me/film/'));
assert.ok(catalogItems[0].poster.startsWith('https://cimanow.me/photos/'));
assert.equal(catalogItems[0].title, 'فيلم Masterplan 2026 مدبلج');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('عثمان', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 4);
assert.equal(searchResults[0].type, 'series');
assert.equal(searchResults[0].is_series, true);
assert.ok(searchResults[0].title.includes('عثمان'));
assert.equal(searchResults[3].type, 'movie');
assert.equal(searchResults[3].is_series, false);
assert.equal(searchResults[3].year, '2018');
assert.ok(searchResults._meta?.ok);

// 4b. Empty and no-result search handling
const emptySearch = await scrapeSearch('');
assert.equal(emptySearch.length, 0);
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

const noResultsSearch = await scrapeSearch('nonexistentxyz999', 1, {
  fixtureHtml: EMPTY_SEARCH_HTML
});
assert.equal(noResultsSearch.length, 0);
assert.equal(noResultsSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. DETAILS FIXTURE SCRAPING (MOVIE & SERIES)
console.log('5. Testing Movie & Series Details Fixture Scraping...');
const movieDetails = await scrapeDetails(FIXTURE_META.urls.movieDetails, {
  fixtureHtml: MOVIE_DETAILS_HTML
});
assert.equal(movieDetails.type, 'movie');
assert.ok(movieDetails.title.includes('Legend of the White Dragon'));
assert.equal(movieDetails.year, '2026');
assert.equal(movieDetails.rating, '5.6');
assert.ok(movieDetails.overview.includes('البطل المقنع'));
assert.ok(movieDetails.genres.includes('اكشن'));
assert.ok(movieDetails.genres.includes('فانتازيا'));
assert.equal(movieDetails.source, 'cimanow');
assert.ok(movieDetails._meta?.ok);

const seriesDetails = await scrapeDetails(FIXTURE_META.urls.episodeDetails, {
  fixtureHtml: SERIES_EPISODES_DETAILS_HTML
});
assert.equal(seriesDetails.type, 'series');
assert.ok(seriesDetails.title.includes('محمد الفاتح'));
assert.ok(Array.isArray(seriesDetails.episodes));
assert.equal(seriesDetails.episodes.length, 5);

// 6. EPISODES FIXTURE & ASCENDING ORDER AUDIT
console.log('6. Testing Episodes Ordering & Deduplication...');
const episodes = await scrapeEpisodes(FIXTURE_META.urls.episodeDetails, {
  fixtureHtml: SERIES_EPISODES_DETAILS_HTML
});
assert.equal(episodes.length, 5);
const epNumbers = episodes.map((e) => e.number);
assert.deepEqual(epNumbers, [1, 2, 3, 4, 5], 'Episodes must be strictly sorted ascending: 1 -> 5');
for (const ep of episodes) {
  assert.equal(ep.season, 1);
  assert.ok(ep.ref.startsWith('cimanow:'));
  assert.ok(ep.url.startsWith('https://cimanow.me/episode/'));
  assert.equal(ep.watch_available, true);
}

// 7. SERVERS FIXTURE & CODE PREFIX AUDIT
console.log('7. Testing Servers Fixture & Code Prefix...');
const servers = await scrapeServers(FIXTURE_META.urls.episodeWatch, {
  fixtureHtml: WATCH_PAGE_HTML,
  downloadFixtureHtml: DOWNLOAD_PAGE_HTML,
  resolveFixtureJson: RESOLVE_API_JSON
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 3, 'Should extract servers from fixture (iframe, resolve API, download links)');
for (let i = 0; i < servers.length; i++) {
  const s = servers[i];
  assert.equal(s.code, `CW-${i + 1}`, `Server code must follow format CW-${i + 1}`);
  assert.equal(s.serverCode, `CW-${i + 1}`);
  assert.ok(s.url, 'Server must have a URL');
  assert.ok(['m3u8', 'mp4', 'embed'].includes(s.type), 'Server type must be valid');
  assert.ok(s.headers?.Referer, 'Server must include Referer header');
}

// 8. RESOLVE STREAM FIXTURE AUDIT
console.log('8. Testing Stream Resolution...');
const directMp4Stream = await resolveStream(DIRECT_STREAM_SAMPLE.mp4, { verified: true });
assert.equal(directMp4Stream.ok, true);
assert.equal(directMp4Stream.providerId, 'cimanow');
assert.equal(directMp4Stream.type, 'mp4');
assert.equal(directMp4Stream.verified, true);
assert.ok(directMp4Stream.url.includes('.mp4'));

const resolvedApiStream = await resolveStream('https://cimanow.me/watch/resolve#test', {
  resolveFixtureJson: RESOLVE_API_JSON
});
assert.equal(resolvedApiStream.ok, true);
assert.equal(resolvedApiStream.url, 'https://earnvids.com/embed-hks8721k.html');
assert.equal(resolvedApiStream.type, 'embed');
assert.equal(resolvedApiStream.verified, false);

// 9. SSRF AND SECURITY BOUNDARIES
console.log('9. Testing SSRF and Unsafe URL rejection...');
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
  () => resolveStream('https://user:secret@malicious.com/stream.mp4'),
  /UNSAFE_|ScraperError/
);

// 10. SYNTHETIC SPECIAL CASE: Arabic-Indic Digits in Episode Numbering
console.log('10. Testing Synthetic Special Case: Arabic-Indic Digits...');
const syntheticEpisodes = await scrapeEpisodes('https://cimanow.me/series/test/', {
  fixtureHtml: SYNTHETIC_ARABIC_DIGITS_HTML
});
assert.equal(syntheticEpisodes.length, 3);
assert.equal(syntheticEpisodes[0].number, 1, 'Arabic-Indic ١ must parse to 1');
assert.equal(syntheticEpisodes[1].number, 3, 'Arabic-Indic ٣ must parse to 3');
assert.equal(syntheticEpisodes[2].number, 12, 'Arabic-Indic ١٢ must parse to 12');
assert.deepEqual(
  syntheticEpisodes.map((e) => e.number),
  [1, 3, 12],
  'Synthetic Arabic digit episodes must sort ascending'
);

// 11. BACKWARD COMPATIBILITY WITH LEGACY EXPORTS & FORMATS
console.log('11. Testing Backward Compatibility with Legacy Exports...');
assert.equal(typeof scrapeCimaNowCategory, 'function');
assert.equal(typeof extractCimaNowStreamsAndEpisodes, 'function');
assert.equal(CIMANOW_CONFIG.key, 'cimanow');
assert.equal(CIMANOW_CONFIG.code, 'CW');

const legacyCatalogItems = await scrapeCatalog('movies_foreign', 1, {
  fixtureHtml: LEGACY_CIMANOW_CATALOG_HTML
});
assert.equal(legacyCatalogItems.length, 1);
assert.equal(legacyCatalogItems[0].title, 'فيلم التجربة القديمة 2025');
assert.equal(legacyCatalogItems[0].serverPrefix, 'CW');

const legacyWatchServers = await scrapeServers('https://vip.cimanowinc.com/movie/test/watching/', {
  fixtureHtml: LEGACY_CIMANOW_WATCHING_HTML
});
assert.ok(legacyWatchServers.length >= 2);
assert.equal(legacyWatchServers[0].code, 'CW-1');
assert.equal(legacyWatchServers[1].code, 'CW-2');

console.log('\nAll 11 fixture tests passed successfully!');
