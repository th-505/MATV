// scripts/providers/witanime.fixture.test.mjs
// Offline fixture test suite for WitAnime (witanime) — Code: WE
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  WITANIME_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive,
  scrapeWitAnimeCategory,
  extractWitAnimeStreamsAndEpisodes,
  resolveTargetUrl,
  parseCatalogItems,
  parseEpisodesFromHtml,
  extractMirrorOriginFromGatewayHtml
} from '../../server/scrapers/sites/witanime.mjs';
import * as fixtures from '../fixtures/providers/witanime.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== WitAnime Offline Fixture Test Suite ===\n');

// 1. PROVIDER_META & Configuration Contract
console.log('[Test 1] Verifying PROVIDER_META and configuration contract...');
assert.equal(PROVIDER_META.id, 'witanime', 'Provider ID must be witanime');
assert.equal(PROVIDER_META.code, 'WE', 'Provider code must be WE');
assert.equal(PROVIDER_META.mirrorOf, null, 'mirrorOf must be null for primary provider');
assert.deepEqual(PROVIDER_META.capabilities, {
  catalog: true,
  search: true,
  details: true,
  episodes: true,
  servers: true,
  resolve: true,
  live: false
}, 'Capabilities matrix must match contract');
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.queryParam, 'q');
assert.equal(PROVIDER_META.searchSpec.encoding, 'utf-8');
assert.ok(PROVIDER_META.searchSpec.pathTemplate.includes('/search?q={query}'));
assert.ok(PROVIDER_META.domains.length >= 3, 'Must list legacy, gateway, and active site domains');
assert.ok(PROVIDER_META.notImplemented.live, 'Missing live capability must state reason');
console.log('  ✓ PROVIDER_META contract verified.');

// 2. Gateway Mirror Discovery
console.log('\n[Test 2] Verifying gateway mirror discovery from GATEWAY_HTML...');
assert.ok(fixtures.GATEWAY_HTML, 'GATEWAY_HTML fixture must be present');
const discoveredOrigin = extractMirrorOriginFromGatewayHtml(fixtures.GATEWAY_HTML);
assert.equal(discoveredOrigin, 'https://witanime.site', 'Must extract active platform origin from gateway page');
console.log('  ✓ Gateway mirror discovery verified:', discoveredOrigin);

// 3. Catalog Scraper (Offline Fixture)
console.log('\n[Test 3] Verifying scrapeCatalog with CATALOG_HTML fixture...');
const catalogItems = await scrapeCatalog('anime_series', 1, {
  fixtureHtml: fixtures.CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog result must be an array');
assert.ok(catalogItems._meta?.ok, 'Catalog result metadata must indicate ok: true');
assert.ok(catalogItems.length >= 4, `Expected at least 4 catalog items, got ${catalogItems.length}`);
const sampleCatalog = catalogItems[0];
assert.ok(sampleCatalog.title, 'Catalog item must have a title');
assert.ok(sampleCatalog.url?.startsWith('https://'), 'Catalog item must have safe https URL');
assert.ok(sampleCatalog.poster?.startsWith('https://'), 'Catalog item must have poster URL');
assert.equal(sampleCatalog.category, 'anime');
assert.equal(sampleCatalog.serverPrefix, 'WE');
assert.ok(sampleCatalog.ref.startsWith('witanime:'), 'ref must be prefixed with witanime:');
console.log(`  ✓ Catalog parsing verified (${catalogItems.length} items parsed). Sample: "${sampleCatalog.title}"`);

// 4. Search Scraper (Offline Fixture)
console.log('\n[Test 4] Verifying scrapeSearch with SEARCH_HTML fixture...');
const searchItems = await scrapeSearch('one piece', 1, {
  fixtureHtml: fixtures.SEARCH_HTML
});
assert.ok(Array.isArray(searchItems), 'Search result must be an array');
assert.ok(searchItems._meta?.ok, 'Search result metadata must indicate ok: true');
assert.ok(searchItems.length >= 3, `Expected search results, got ${searchItems.length}`);
const matchedItem = searchItems.find((it) => it.title.toLowerCase().includes('one piece'));
assert.ok(matchedItem, 'Should find One Piece in search fixture');
assert.ok(matchedItem.url.includes('/anime/one-piece') || matchedItem.url.includes('/movie/one-piece'));
console.log(`  ✓ Search parsing verified (${searchItems.length} items parsed). Found: "${matchedItem.title}"`);

// 5. Empty Search Handling
console.log('\n[Test 5] Verifying empty search query behavior...');
const emptySearch = await scrapeSearch('', 1);
assert.ok(Array.isArray(emptySearch), 'Empty search must return an array');
assert.equal(emptySearch.length, 0, 'Empty search must return 0 items');
assert.equal(emptySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('  ✓ Empty search returns empty array with EMPTY_RESULT metadata.');

// 6. Details Scraper (Offline Fixture)
console.log('\n[Test 6] Verifying scrapeDetails with DETAILS_HTML fixture...');
const details = await scrapeDetails('https://witanime.site/anime/black-clover-2nd-season', {
  fixtureHtml: fixtures.DETAILS_HTML
});
assert.ok(details._meta?.ok, 'Details metadata must indicate ok: true');
assert.equal(details.title, 'Black Clover 2nd Season', 'Details title must match');
assert.ok(details.poster?.startsWith('https://'), 'Poster URL must be present and valid');
assert.ok(details.overview.includes('أستا'), 'Overview must contain story excerpt');
assert.ok(Array.isArray(details.episodes), 'Episodes must be an array');
assert.equal(details.episodes.length, 2, `Expected 2 episodes, got ${details.episodes.length}`);
assert.equal(details.episodes[0].number, 1);
assert.equal(details.episodes[1].number, 2);
console.log(`  ✓ Details parsing verified. Title: "${details.title}", Episodes: ${details.episodes.length}`);

// 7. Episodes Scraper (Offline Fixture)
console.log('\n[Test 7] Verifying scrapeEpisodes with DETAILS_HTML fixture...');
const episodes = await scrapeEpisodes('https://witanime.site/anime/black-clover-2nd-season', {
  fixtureHtml: fixtures.DETAILS_HTML
});
assert.ok(Array.isArray(episodes), 'Episodes result must be an array');
assert.equal(episodes.length, 2, 'Must return 2 episodes');
assert.ok(episodes._meta?.ok, 'Episodes metadata must indicate ok: true');
console.log(`  ✓ scrapeEpisodes verified (${episodes.length} episodes).`);

// 8. Servers Scraper (Offline Fixture with Sources JSON)
console.log('\n[Test 8] Verifying scrapeServers with WATCH_HTML and WATCH_SOURCES_JSON...');
const servers = await scrapeServers('https://witanime.site/watch/black-clover-2nd-season/2', {
  fixtureHtml: fixtures.WATCH_HTML,
  sourcesJson: fixtures.WATCH_SOURCES_JSON
});
assert.ok(Array.isArray(servers), 'Servers must be an array');
assert.ok(servers._meta?.ok, 'Servers metadata must indicate ok: true');
assert.ok(servers.length >= 6, `Expected at least 6 servers, got ${servers.length}`);
assert.ok(servers[0].code.startsWith('WE-'), 'Server code must start with WE-');
assert.ok(servers[0].url.includes('/watch/stream-gate/'), 'Server URL must point to stream-gate token');
assert.equal(servers[0].type, 'embed', 'Server type must be embed');
console.log(`  ✓ scrapeServers verified (${servers.length} servers extracted). Top server: "${servers[0].name}"`);

// 9. Stream Resolving (Direct vs Embed)
console.log('\n[Test 9] Verifying resolveStream with direct MP4 and embed URLs...');
// 9a. Direct MP4 (verified)
const directMp4Server = fixtures.REAL_RESOLVED_SERVERS.find(s => s.streamType === 'mp4');
assert.ok(directMp4Server, 'Must have direct mp4 server sample');
const resolvedDirect = await resolveStream(directMp4Server, { skipVerification: true });
assert.equal(resolvedDirect.type, 'mp4');
assert.ok(resolvedDirect.streamUrl.endsWith('.mp4'));
console.log('  ✓ Direct MP4 stream resolution verified:', resolvedDirect.streamUrl);

// 9b. Stream Gate Token Embed (unverified embed)
const gateServer = servers[0];
const resolvedGate = await resolveStream(gateServer);
assert.equal(resolvedGate.type, 'embed');
assert.equal(resolvedGate.verified, false);
assert.equal(resolvedGate.obstacle, 'STREAM_GATE_DEVTOOLS_GUARD');
console.log('  ✓ Embed stream resolution verified (accurately flagged verified: false).');

// 10. Unsupported Live Capability
console.log('\n[Test 10] Verifying scrapeLive throws UNSUPPORTED_CAPABILITY...');
await assert.rejects(
  async () => scrapeLive(),
  (err) => err.code === SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
  'scrapeLive must throw UNSUPPORTED_CAPABILITY'
);
console.log('  ✓ scrapeLive correctly rejects with UNSUPPORTED_CAPABILITY.');

// 11. Backward Compatibility Exports
console.log('\n[Test 11] Verifying backward-compatible exports for server/scrapers/index.mjs...');
const compatCategory = await scrapeWitAnimeCategory('anime_series', 1, {
  fixtureHtml: fixtures.CATALOG_HTML
});
assert.ok(Array.isArray(compatCategory), 'scrapeWitAnimeCategory must return an array');
assert.ok(compatCategory.length >= 4);
assert.equal(compatCategory[0].serverPrefix, 'WE');

const compatDetailsAndServers = await extractWitAnimeStreamsAndEpisodes(
  'https://witanime.site/anime/black-clover-2nd-season',
  {
    fixtureHtml: fixtures.DETAILS_HTML,
    sourcesJson: fixtures.WATCH_SOURCES_JSON
  }
);
assert.ok(compatDetailsAndServers.title, 'Must contain title');
assert.ok(Array.isArray(compatDetailsAndServers.episodes), 'Must contain episodes');
assert.equal(compatDetailsAndServers.episodes.length, 2);
console.log('  ✓ Backward-compatible exports verified.');

console.log('\nAll 11 WitAnime offline fixture tests PASSED cleanly! 🎯');
