// scripts/providers/3cktv.fixture.test.mjs
// Offline fixture validation test suite for 3ckTV provider (3cktv, code: 3V)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  SEARCH_EMPTY_HTML,
  SERIES_DETAILS_HTML,
  EPISODE_WATCH_HTML,
  EMBED_PLAYER_HTML,
  DIRECT_STREAM_SAMPLE,
  SYNTHETIC_SPECIAL_CASE
} from '../fixtures/providers/3cktv.fixture.mjs';

import {
  PROVIDER_META,
  THREE_CKTV_CONFIG,
  encode3cktvRef,
  decode3cktvRef,
  resolve3cktvTargetUrl,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrape3cktvCategory,
  extract3cktvStreamsAndEpisodes
} from '../../server/scrapers/sites/3cktv.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting 3ckTV Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, '3cktv');
assert.equal(PROVIDER_META.code, '3V');
assert.equal(PROVIDER_META.name, '3ckTV');
assert.ok(PROVIDER_META.domains.includes('https://e.3cktv.com'));
assert.ok(PROVIDER_META.domains.includes('https://3cktv.com'));
assert.ok(PROVIDER_META.domains.includes('https://ei.3cktv.com'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/?s={query}');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');
console.log('   Metadata contract validated.');

// 2. REFERENCE ENCODING & TARGET RESOLUTION
console.log('2. Testing Reference Encoding & Decoding...');
const testUrl = 'https://e.3cktv.com/watch/kurulus-osman-ep-194/';
const encodedRef = encode3cktvRef(testUrl);
assert.ok(encodedRef.startsWith('3cktv:'), 'Ref must begin with 3cktv: prefix');
assert.equal(decode3cktvRef(encodedRef), testUrl, 'Decoded ref must match original URL');
assert.equal(resolve3cktvTargetUrl(encodedRef), testUrl);

// Relative path resolution
const relPath = '/series/serie-yalicapkini/';
assert.equal(resolve3cktvTargetUrl(relPath), `https://e.3cktv.com${relPath}`);
console.log('   Reference encoding & target resolution validated.');

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('turkish_subbed', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 4, 'Catalog fixture contains 4 items');
assert.equal(catalogItems[0].source, '3cktv');
assert.equal(catalogItems[0].serverPrefix, '3V');
assert.equal(catalogItems[0].type, 'series');
assert.equal(catalogItems[0].is_series, true);
assert.ok(catalogItems[0].ref.startsWith('3cktv:'));
assert.ok(catalogItems[0].url.startsWith('https://e.3cktv.com/series/'));
assert.ok(catalogItems[0].poster.startsWith('https://e.3cktv.com/wp-content/'));
assert.equal(catalogItems[0].title, 'مسلسل المؤسس عثمان مترجم');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// Movie detection in catalog
const movieItem = catalogItems.find((i) => i.title.includes('فيلم دمي'));
assert.ok(movieItem, 'Movie item must be present');
assert.equal(movieItem.type, 'movie');
assert.equal(movieItem.is_series, false);
console.log(`   Catalog parsed ${catalogItems.length} items correctly with movie detection.`);

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('عثمان', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 3, 'Search fixture contains 3 results');
assert.ok(searchResults[0].title.includes('عثمان'));
assert.equal(searchResults[0].source, '3cktv');
assert.ok(searchResults._meta?.ok);

// 4b. Empty query handling
const emptySearch = await scrapeSearch('');
assert.equal(emptySearch.length, 0);
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 4c. No results search HTML fixture
const noResultsSearch = await scrapeSearch('xyznonexistent', 1, {
  fixtureHtml: SEARCH_EMPTY_HTML
});
assert.equal(noResultsSearch.length, 0);
assert.equal(noResultsSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('   Search positive, empty query, and no-results validated.');

// 5. SERIES DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Fixture Scraping...');
const details = await scrapeDetails('https://e.3cktv.com/series/serie-kurulus-osman/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(details.title.includes('المؤسس عثمان'));
assert.ok(details.poster.startsWith('https://e.3cktv.com/'));
assert.ok(details.overview.length > 20);
assert.ok(details.genres.includes('تاريخي'));
assert.ok(details.genres.includes('دراما'));
assert.equal(details.type, 'series');
assert.ok(Array.isArray(details.episodes));
assert.equal(details.episodes.length, 4);
assert.equal(details.episodes[0].number, 1);
assert.equal(details.episodes[3].number, 194);
assert.ok(details._meta?.ok);
console.log(`   Series details parsed with ${details.episodes.length} episodes and genres.`);

// 6. EPISODES FIXTURE SCRAPING & STRICT ORDERING
console.log('6. Testing Episodes List Fixture Scraping...');
const episodes = await scrapeEpisodes('https://e.3cktv.com/series/serie-kurulus-osman/', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 4);
for (let i = 1; i < episodes.length; i++) {
  assert.ok(
    episodes[i].number > episodes[i - 1].number,
    `Episodes must be in ascending order: ep ${episodes[i - 1].number} before ${episodes[i].number}`
  );
}
assert.ok(episodes[0].ref.startsWith('3cktv:'));
console.log('   Episodes parsed and confirmed strictly ascending.');

// 7. SERVERS FIXTURE EXTRACTION & CODE PREFIXING (3V-1, 3V-2...)
console.log('7. Testing Server Extraction Fixture Scraping...');
const servers = await scrapeServers('https://e.3cktv.com/watch/kurulus-osman-ep-194/?do=views', {
  fixtureHtml: EPISODE_WATCH_HTML
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 3, `Expected at least 3 servers, got ${servers.length}`);
for (let i = 0; i < servers.length; i++) {
  assert.equal(servers[i].code, `3V-${i + 1}`);
  assert.equal(servers[i].provider, '3cktv');
  assert.ok(servers[i].url.startsWith('http'));
}

// Check base64 bridge unwrapping
const srv1 = servers.find((s) => s.name.includes('سيرفر سريع 1') || s.code === '3V-1');
assert.ok(srv1, 'Server 1 must be present');
assert.ok(srv1.url.includes('faststream.example/embed-3ck-abc.html'), 'Base64 bridge must be unwrapped');
assert.equal(srv1.verified, false, 'Embed servers must have verified: false');
console.log(`   Extracted ${servers.length} servers with codes ${servers.map((s) => s.code).join(', ')}.`);

// 8. STREAM RESOLUTION FIXTURE
console.log('8. Testing Stream Resolution Fixtures...');
const directRes = await resolveStream(DIRECT_STREAM_SAMPLE.url, { verified: true });
assert.equal(directRes.ok, true);
assert.equal(directRes.type, 'm3u8');
assert.equal(directRes.streamType, 'm3u8');
assert.equal(directRes.verified, true);
assert.equal(directRes.providerId, '3cktv');

// Packed JS embed resolution
const packedRes = await resolveStream('https://faststream.example/embed-3ck-abc.html', {
  fixtureHtml: EMBED_PLAYER_HTML
});
assert.equal(packedRes.ok, true);
assert.equal(packedRes.type, 'm3u8');
assert.ok(packedRes.url.includes('.m3u8'));
assert.equal(packedRes.verified, true);
console.log('   Stream resolution for direct media and packed players validated.');

// 9. BACKWARD-COMPATIBLE NAMED EXPORTS
console.log('9. Testing Backward-Compatible Exports...');
assert.equal(THREE_CKTV_CONFIG.key, '3cktv');
assert.equal(THREE_CKTV_CONFIG.code, '3V');

const legacyCatalog = await scrape3cktvCategory('turkish_subbed', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.equal(legacyCatalog.length, 4);

const legacyCombined = await extract3cktvStreamsAndEpisodes('https://e.3cktv.com/watch/kurulus-osman-ep-194/', {
  fixtureHtml: EPISODE_WATCH_HTML
});
assert.ok(Array.isArray(legacyCombined.episodes));
assert.ok(Array.isArray(legacyCombined.servers));
assert.ok(legacyCombined.servers.length >= 3);
console.log('   Backward compatibility verified.');

// 10. SSRF PROTECTION GUARD
console.log('10. Testing SSRF Guard on Malicious Targets...');
let ssrfBlocked = false;
try {
  await scrapeDetails('http://169.254.169.254/latest/meta-data/');
} catch (err) {
  ssrfBlocked = err.code === SCRAPER_ERROR_CODES.UNSAFE_URL;
}
assert.ok(ssrfBlocked, 'SSRF request to cloud metadata must be blocked with UNSAFE_URL');

let loopbackBlocked = false;
try {
  await scrapeDetails('http://127.0.0.1:8080/admin');
} catch (err) {
  loopbackBlocked = err.code === SCRAPER_ERROR_CODES.UNSAFE_URL;
}
assert.ok(loopbackBlocked, 'SSRF request to loopback must be blocked with UNSAFE_URL');
console.log('   SSRF security guard successfully blocked malicious targets.');

// 11. SYNTHETIC SPECIAL CASE FIXTURE
console.log('11. Testing Synthetic Special Case Fixture...');
const syntheticItems = await scrapeCatalog('all', 1, {
  fixtureHtml: SYNTHETIC_SPECIAL_CASE.html
});
assert.equal(syntheticItems.length, 1);
assert.ok(syntheticItems[0].title.includes('194') || syntheticItems[0].title.includes('١٩٤'));
assert.ok(syntheticItems[0].url.startsWith('https://e.3cktv.com/watch/'));
console.log('   Synthetic special case successfully parsed.');

console.log('\n=== ALL 3ckTV FIXTURE TESTS PASSED SUCCESSFULLY! ===');
