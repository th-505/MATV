// scripts/providers/alooy.fixture.test.mjs
// Offline fixture test suite for Alooy TV (علوي تي في, code: AY)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_HTML,
  SEARCH_JSON,
  SERIES_DETAILS_HTML,
  EPISODE_WATCH_VIDEO_HTML,
  EPISODE_WATCH_IFRAME_HTML,
  M3U8_PLAYER_HTML
} from '../fixtures/providers/alooy.fixture.mjs';

import {
  PROVIDER_META,
  ALOOY_CONFIG,
  rewriteToActiveAlooyDomain,
  resolveAlooyTargetUrl,
  safeAlooyMedia,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  resolveAlooyStream,
  scrapeLive,
  encodeAlooyRef,
  decodeAlooyRef,
  createAlooyProvider
} from '../../server/scrapers/sites/alooy.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting Alooy TV Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'alooy');
assert.equal(PROVIDER_META.code, 'AY');
assert.equal(PROVIDER_META.name, 'علوي تي في (Alooy TV)');
assert.ok(PROVIDER_META.domains.includes('https://fa.alooytv16.xyz'));
assert.ok(PROVIDER_META.domains.includes('https://alooytv5.xyz'));
assert.equal(PROVIDER_META.mirrorOf, null);
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, true);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, false);
assert.ok(PROVIDER_META.notImplemented?.live, 'Must declare notImplemented reason for live');
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.pathTemplate, '/home/autocompleteajax?term={query}');
assert.equal(PROVIDER_META.searchSpec.queryParam, 'term');
assert.equal(PROVIDER_META.searchSpec.encoding, 'utf-8');
assert.equal(PROVIDER_META.searchSpec.pagination, false);

// 2. DOMAIN REWRITING & TARGET RESOLUTION
console.log('2. Testing Domain Rewriting & Target Resolution...');
assert.equal(
  rewriteToActiveAlooyDomain('https://alooytv5.xyz/watch/demo.html'),
  'https://fa.alooytv16.xyz/watch/demo.html'
);
assert.equal(
  rewriteToActiveAlooyDomain('/watch/demo.html'),
  'https://fa.alooytv16.xyz/watch/demo.html'
);
assert.equal(
  resolveAlooyTargetUrl('https://alooytv5.xyz/watch/demo.html?key=123'),
  'https://fa.alooytv16.xyz/watch/demo.html?key=123'
);
const testRef = encodeAlooyRef('https://fa.alooytv16.xyz/watch/test-series.html');
assert.ok(testRef.startsWith('alooy:'));
assert.equal(
  resolveAlooyTargetUrl(testRef),
  'https://fa.alooytv16.xyz/watch/test-series.html'
);

// 3. CATALOG FIXTURE SCRAPING
console.log('3. Testing Catalog Fixture Scraping...');
const catalogItems = await scrapeCatalog('all', 1, {
  fixtureHtml: CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog must return an array');
assert.equal(catalogItems.length, 6, 'Catalog fixture contains 6 items');
assert.equal(catalogItems[0].source, 'alooy');
assert.equal(catalogItems[0].serverPrefix, 'AY');
assert.equal(catalogItems[0].is_series, true);
assert.equal(catalogItems[0].type, 'series');
assert.ok(catalogItems[0].ref.startsWith('alooy:'));
assert.ok(catalogItems[0].url.startsWith('https://fa.alooytv16.xyz/watch/'));
assert.ok(catalogItems[0].poster.startsWith('https://fa.alooytv16.xyz/uploads/'));
assert.equal(catalogItems[0].title, 'قسمة و نصيب : العروس و الحماة');
assert.ok(catalogItems._meta?.ok, 'Catalog _meta.ok must be true');

// 4. SEARCH FIXTURE SCRAPING
console.log('4. Testing Search Fixture Scraping...');
const searchResults = await scrapeSearch('شباب', 1, {
  fixtureJson: SEARCH_JSON
});
assert.ok(Array.isArray(searchResults));
assert.equal(searchResults.length, 5);
assert.equal(searchResults[0].source, 'alooy');
assert.equal(searchResults[0].serverPrefix, 'AY');
assert.equal(searchResults[0].type, 'series');
assert.equal(searchResults[0].is_series, true);
assert.equal(searchResults[0].title, 'ست شباب');
assert.ok(searchResults[0].ref.startsWith('alooy:'));
assert.ok(searchResults[0].poster.startsWith('https://fa.alooytv16.xyz/uploads/'));
assert.ok(searchResults._meta?.ok);

// 4b. Empty & short search queries
const emptySearch = await scrapeSearch('');
assert.equal(emptySearch.length, 0);
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

const shortSearch = await scrapeSearch('a');
assert.equal(shortSearch.length, 0);
assert.equal(shortSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 4c. Non-existent search query returning null
const nullSearch = await scrapeSearch('xyznonexistent', 1, {
  fixtureJson: 'null'
});
assert.equal(nullSearch.length, 0);
assert.equal(nullSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

// 5. DETAILS FIXTURE SCRAPING
console.log('5. Testing Series Details Fixture Scraping...');
const details = await scrapeDetails('https://fa.alooytv16.xyz/watch/talae-nazil.html', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.equal(details.title, 'طالع نازل');
assert.ok(details.poster.startsWith('https://fa.alooytv16.xyz/uploads/'));
assert.equal(details.year, '2026');
assert.equal(details.type, 'series');
assert.ok(Array.isArray(details.episodes));
assert.equal(details.episodes.length, 4);
assert.equal(details.episodes[0].number, 1);
assert.equal(details.episodes[3].number, 4);
assert.ok(details._meta?.ok);

// 6. EPISODES FIXTURE SCRAPING
console.log('6. Testing Episodes Fixture Scraping...');
const episodes = await scrapeEpisodes('https://fa.alooytv16.xyz/watch/talae-nazil.html', {
  fixtureHtml: SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(episodes));
assert.equal(episodes.length, 4);
for (let i = 0; i < episodes.length; i++) {
  assert.equal(episodes[i].number, i + 1);
  assert.ok(episodes[i].url.includes('?key='));
  assert.ok(episodes[i].ref.startsWith('alooy:'));
  assert.equal(episodes[i].source, 'alooy');
}
assert.ok(episodes._meta?.ok);

// 7. SERVERS FIXTURE SCRAPING (Direct MP4 video tag)
console.log('7a. Testing Servers Fixture (Direct Video Tag)...');
const serversVideo = await scrapeServers('https://fa.alooytv16.xyz/watch/talae-nazil.html?key=iwi3xwchrbdw', {
  fixtureHtml: EPISODE_WATCH_VIDEO_HTML
});
assert.ok(Array.isArray(serversVideo));
assert.ok(serversVideo.length >= 1);
assert.equal(serversVideo[0].code, 'AY-1');
assert.equal(serversVideo[0].serverCode, 'AY-1');
assert.equal(serversVideo[0].type, 'mp4');
assert.equal(serversVideo[0].verified, true);
assert.ok(serversVideo[0].url.includes('ujeklsj.site'));
assert.ok(serversVideo[0].headers?.Referer);
assert.ok(serversVideo[0].headers?.Origin);
assert.ok(serversVideo[0].headers?.['User-Agent']);
assert.ok(serversVideo._meta?.ok);

// 7b. SERVERS FIXTURE SCRAPING (Iframe with hash and /m3u8/ player)
console.log('7b. Testing Servers Fixture (Iframe /m3u8/ & Hash)...');
const serversIframe = await scrapeServers('https://fa.alooytv16.xyz/watch/qesma-w-naseeb-al-aroos-w-al-hamat.html?key=f8ojqtoiq1og', {
  fixtureHtml: EPISODE_WATCH_IFRAME_HTML,
  m3u8FixtureHtml: M3U8_PLAYER_HTML
});
assert.ok(Array.isArray(serversIframe));
assert.ok(serversIframe.length >= 2);
for (let i = 0; i < serversIframe.length; i++) {
  assert.equal(serversIframe[i].code, `AY-${i + 1}`);
  assert.equal(serversIframe[i].serverCode, `AY-${i + 1}`);
}
const mp4Server = serversIframe.find((s) => s.type === 'mp4');
assert.ok(mp4Server, 'Must extract MP4 server from hash');
assert.ok(mp4Server.url.includes('vid1.ujeklsj.site'));
assert.equal(mp4Server.verified, true);

const hlsServer = serversIframe.find((s) => s.type === 'm3u8');
assert.ok(hlsServer, 'Must extract HLS server from /m3u8/ player');
assert.ok(hlsServer.url.includes('.m3u8'));
assert.equal(hlsServer.quality, 'AUTO-HLS');
assert.equal(hlsServer.verified, true);

// 8. RESOLVE STREAM FIXTURE
console.log('8. Testing Stream Resolution...');
const resolvedFromDirect = await resolveStream('https://vid1.ujeklsj.site/Talae-Nazil/01.mp4');
assert.ok(resolvedFromDirect.ok);
assert.equal(resolvedFromDirect.providerId, 'alooy');
assert.equal(resolvedFromDirect.type, 'mp4');
assert.equal(resolvedFromDirect.verified, true);
assert.ok(resolvedFromDirect.headers?.Referer);
assert.ok(resolvedFromDirect.headers?.Origin);
assert.ok(resolvedFromDirect.headers?.['User-Agent']);

const resolvedFromPage = await resolveStream('https://fa.alooytv16.xyz/watch/talae-nazil.html?key=iwi3xwchrbdw', {
  fixtureHtml: EPISODE_WATCH_VIDEO_HTML
});
assert.ok(resolvedFromPage.ok);
assert.equal(resolvedFromPage.providerId, 'alooy');
assert.equal(resolvedFromPage.type, 'mp4');
assert.ok(resolvedFromPage.url.includes('ujeklsj.site'));

// 9. BACKWARD COMPATIBILITY INTEGRATION
console.log('9. Testing Backward Compatibility Integration...');
assert.equal(typeof resolveAlooyStream, 'function');
const providerInstance = createAlooyProvider();
assert.ok(providerInstance, 'createAlooyProvider must instantiate successfully');
assert.equal(typeof providerInstance.category, 'function');
assert.equal(typeof providerInstance.details, 'function');
assert.equal(typeof providerInstance.search, 'function');
assert.equal(typeof providerInstance.metadata, 'function');
assert.equal(typeof providerInstance.status, 'function');
const status = providerInstance.status();
assert.equal(status.provider, 'alooy');

// 10. LIVE SCRAPING UNSUPPORTED CAPABILITY
console.log('10. Testing Live Scraper Contract (Unsupported)...');
const liveResult = await scrapeLive();
assert.ok(Array.isArray(liveResult));
assert.equal(liveResult.length, 0);
assert.equal(liveResult._meta?.ok, false);
assert.equal(liveResult._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

// 11. MULTI-CDN DIRECT MEDIA VALIDATION
console.log('11. Testing Multi-CDN Media Validation...');
const cdn1 = safeAlooyMedia('https://vid4.d-s-finsh847.xyz/Ant-Min-Ahib/01.mp4');
assert.ok(cdn1);
assert.equal(cdn1.hostname, 'vid4.d-s-finsh847.xyz');
const cdn2 = safeAlooyMedia('https://vid1.ujeklsj.site/Talae-Nazil/01.mp4');
assert.ok(cdn2);
assert.equal(cdn2.hostname, 'vid1.ujeklsj.site');
const invalidCdn = safeAlooyMedia('https://evil.com/video.mp4');
assert.equal(invalidCdn, null);

console.log('=== All Alooy TV Fixture Tests PASSED ===');

