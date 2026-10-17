// scripts/providers/3isk.fixture.test.mjs
// Offline fixture validation test suite for 3isk provider (قصة عشق الأصلي, code: 3K)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_HTML,
  SERIES_DETAILS_HTML,
  EPISODE_WATCH_HTML,
  EMBED_HTML,
  MIRAVD_PLAYER_HTML,
  AJAX_PLAYER_RESPONSE
} from '../fixtures/providers/3isk.fixture.mjs';

import {
  PROVIDER_META,
  ISK_SITE_CONFIG,
  rewriteToActive3iskDomain,
  resolve3iskTargetUrl,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/3isk.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting 3isk Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, '3isk');
assert.equal(PROVIDER_META.code, '3K');
assert.equal(PROVIDER_META.name, 'قصة عشق الأصلي (3isk)');
assert.ok(PROVIDER_META.domains.includes('https://ww4.3ick.club'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/?s={query}');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');

// 2. DOMAIN REWRITING & TARGET RESOLUTION
console.log('2. Testing Domain Rewriting & Target Resolution...');
assert.equal(
  rewriteToActive3iskDomain('https://ww5.3ick.club/watch/episodes/test-1/'),
  'https://ww4.3ick.club/watch/episodes/test-1/'
);
assert.equal(
  rewriteToActive3iskDomain('https://3isk.onl/watch/tvshows/test-series/'),
  'https://ww4.3ick.club/watch/tvshows/test-series/'
);
assert.equal(
  rewriteToActive3iskDomain('/watch/movies/test/'),
  'https://ww4.3ick.club/watch/movies/test/'
);

const encodedRef = resolve3iskTargetUrl('3isk:L3dhdGNoL3R2c2hvd3Mvc2VyaWUtZGVtby8');
assert.equal(encodedRef, 'https://ww4.3ick.club/watch/tvshows/serie-demo/');

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('series_turkish', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 4, 'Catalog fixture contains 4 items');
assert.equal(catalogItems[0].source, '3isk');
assert.equal(catalogItems[0].serverPrefix, '3K');
assert.equal(catalogItems[0].is_series, true);
assert.equal(catalogItems[0].type, 'series');
assert.ok(catalogItems[0].ref.startsWith('3isk:'));
assert.ok(catalogItems[0].url.startsWith('https://ww4.3ick.club/watch/tvshows/'));
assert.ok(catalogItems[0].poster.startsWith('https://ww4.3ick.club/wp-content/'));
assert.equal(catalogItems[0].title, 'مسلسل تجارة منظمة مدبلج');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('عثمان', 1, {
  fixtureHtml: SEARCH_HTML
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 4);
assert.equal(searchResults[0].type, 'movie');
assert.equal(searchResults[0].is_series, false);
assert.equal(searchResults[0].year, '2018');
assert.equal(searchResults[1].type, 'series');
assert.equal(searchResults[1].is_series, true);
assert.equal(searchResults[1].title, 'مسلسل المؤسس عثمان مدبلج');
assert.ok(searchResults._meta?.ok);

// 4b. Empty search error handling
const emptySearch = await scrapeSearch('');
assert.equal(emptySearch.length, 0);
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. SERIES DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Fixture Scraping...');
const details = await scrapeDetails(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(details.title.includes('المؤسس عثمان'));
assert.ok(details.overview.includes('الغازي عثمان الأول'));
assert.equal(details.type, 'series');
assert.equal(details.source, '3isk');
assert.ok(Array.isArray(details.episodes));
assert.equal(details.episodes.length, 5);

// 6. EPISODES FIXTURE & ASCENDING ORDER AUDIT
console.log('6. Testing Episodes Ordering & Deduplication...');
const episodes = await scrapeEpisodes(FIXTURE_META.urls.seriesDetails, {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(episodes.length, 5);
const epNumbers = episodes.map((e) => e.number);
assert.deepEqual(epNumbers, [190, 191, 192, 193, 194], 'Episodes must be strictly sorted ascending');
for (const ep of episodes) {
  assert.equal(ep.season, 1);
  assert.ok(ep.ref.startsWith('3isk:'));
  assert.ok(ep.url.startsWith('https://ww4.3ick.club/watch/episodes/'));
  assert.equal(ep.watch_available, true);
}

// 7. SERVERS FIXTURE & CODE PREFIX AUDIT
console.log('7. Testing Servers Fixture & Code Prefix...');
const servers = await scrapeServers(FIXTURE_META.urls.episodeWatch, {
  fixtureHtml: EPISODE_WATCH_HTML,
  embedFixtureHtml: EMBED_HTML,
  ajaxFixtureResponse: AJAX_PLAYER_RESPONSE
});
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 2, 'Should extract servers from fixture');
for (let i = 0; i < servers.length; i++) {
  const s = servers[i];
  assert.equal(s.code, `3K-${i + 1}`, `Server code must follow format 3K-${i + 1}`);
  assert.equal(s.serverCode, `3K-${i + 1}`);
  assert.ok(s.url, 'Server must have a URL');
  assert.ok(['m3u8', 'mp4', 'embed'].includes(s.type), 'Server type must be valid');
  assert.ok(s.headers?.Referer, 'Server must include Referer header');
}

const directServer = servers.find((s) => s.type === 'm3u8');
assert.ok(directServer, 'Must have unwrapped a direct HLS server from packed miravd player');
assert.ok(directServer.url.includes('.m3u8'));

// 8. RESOLVE STREAM FIXTURE AUDIT
console.log('8. Testing Stream Resolution from Fixture...');
const stream = await resolveStream(FIXTURE_META.urls.embedPlayer1, {
  embedFixtureHtml: EMBED_HTML,
  ajaxFixtureResponse: AJAX_PLAYER_RESPONSE
});
assert.equal(stream.ok, true);
assert.equal(stream.providerId, '3isk');
assert.equal(stream.type, 'm3u8');
assert.ok(stream.url.includes('.m3u8'));
assert.ok(stream.headers?.Referer);

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
  () => resolveStream('https://user:secret@s25.grzcdn.com/hls/master.m3u8'),
  /UNSAFE_|ScraperError/
);

// 10. SYNTHETIC SPECIAL CASE: Arabic-Indic Digits in Episode Numbering
console.log('10. Testing Synthetic Special Case: Arabic-Indic Digits...');
const syntheticArabicDigitsHtml = `
<body class="rtl single single-tvshows">
<div class="episodes-list">
  <a class="ep-num" data-ep-num="١٩٤" href="https://ww4.3ick.club/watch/episodes/serie-test-season-1-episode-194/" title="الحلقة ١٩٤">
    <span class="cl_srt">الحلقة ١٩٤</span><b>١٩٤</b>
  </a>
  <a class="ep-num" data-ep-num="٥" href="https://ww4.3ick.club/watch/episodes/serie-test-season-1-episode-5/" title="الحلقة ٥">
    <span class="cl_srt">الحلقة ٥</span><b>٥</b>
  </a>
</div>
</body>`;

const syntheticEpisodes = await scrapeEpisodes('https://ww4.3ick.club/watch/tvshows/serie-synthetic/', {
  fixtureHtml: syntheticArabicDigitsHtml
});
assert.equal(syntheticEpisodes.length, 2);
assert.equal(syntheticEpisodes[0].number, 5, 'Arabic-Indic ٥ must parse to 5');
assert.equal(syntheticEpisodes[1].number, 194, 'Arabic-Indic ١٩٤ must parse to 194');
assert.deepEqual(
  syntheticEpisodes.map((e) => e.number),
  [5, 194],
  'Synthetic Arabic digit episodes must sort ascending'
);

console.log('\nAll 10 fixture tests passed successfully!');
