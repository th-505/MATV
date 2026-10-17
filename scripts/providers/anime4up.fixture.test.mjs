// scripts/providers/anime4up.fixture.test.mjs
// Offline fixture test suite for Anime4Up (anime4up) — Code: AP
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  ANIME4UP_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  resolveTargetUrl,
  parseCatalogItems,
  parseEpisodesFromHtml,
  extractRawServersFromHtml,
  extractMirrorOriginFromGatewayHtml
} from '../../server/scrapers/sites/anime4up.mjs';
import * as fixtures from '../fixtures/providers/anime4up.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Anime4Up Offline Fixture Test Suite ===\n');

// 1. PROVIDER_META & Configuration Contract
console.log('[Test 1] Verifying PROVIDER_META and configuration contract...');
assert.equal(PROVIDER_META.id, 'anime4up', 'Provider ID must be anime4up');
assert.equal(PROVIDER_META.code, 'AP', 'Provider code must be AP');
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
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');
assert.equal(PROVIDER_META.searchSpec.encoding, 'utf-8');
assert.ok(PROVIDER_META.searchSpec.pathTemplate.includes('search_param=animes'));
assert.ok(PROVIDER_META.domains.length >= 4, 'Must list all known gateway and mirror domains');
assert.deepEqual(PROVIDER_META.notImplemented, {}, 'No missing capabilities declared');
console.log('  ✓ PROVIDER_META contract verified.');

// 2. Gateway Mirror Discovery
console.log('\n[Test 2] Verifying gateway mirror discovery from GATEWAY_BOND_HTML...');
assert.ok(fixtures.GATEWAY_BOND_HTML, 'GATEWAY_BOND_HTML fixture must be present');
const discoveredOrigin = extractMirrorOriginFromGatewayHtml(fixtures.GATEWAY_BOND_HTML);
assert.equal(discoveredOrigin, 'https://4g.7jcsvwa.shop', 'Must extract active mirror domain from gateway page');
console.log('  ✓ Gateway mirror discovery verified:', discoveredOrigin);

// 3. Catalog Scraper (Offline Fixture)
console.log('\n[Test 3] Verifying scrapeCatalog with CATALOG_HTML fixture...');
const catalogItems = await scrapeCatalog('anime_series', 1, {
  fixtureHtml: fixtures.CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog result must be an array');
assert.ok(catalogItems._meta?.ok, 'Catalog result metadata must indicate ok: true');
assert.ok(catalogItems.length >= 8, `Expected at least 8 catalog items, got ${catalogItems.length}`);
const sampleCatalog = catalogItems[0];
assert.ok(sampleCatalog.title, 'Catalog item must have a title');
assert.ok(sampleCatalog.url?.startsWith('https://'), 'Catalog item must have safe https URL');
assert.ok(sampleCatalog.poster?.startsWith('https://'), 'Catalog item must have poster URL');
assert.equal(sampleCatalog.category, 'anime');
assert.equal(sampleCatalog.type, 'series');
assert.equal(sampleCatalog.serverPrefix, 'AP');
assert.equal(sampleCatalog.is_series, true);
assert.ok(sampleCatalog.ref.startsWith('anime4up:'), 'ref must be prefixed with anime4up:');
console.log(`  ✓ Catalog parsing verified (${catalogItems.length} items parsed). Sample: "${sampleCatalog.title}"`);

// 4. Search Scraper (Offline Fixture)
console.log('\n[Test 4] Verifying scrapeSearch with SEARCH_HTML fixture...');
const searchItems = await scrapeSearch('one piece', 1, {
  fixtureHtml: fixtures.SEARCH_HTML
});
assert.ok(Array.isArray(searchItems), 'Search result must be an array');
assert.ok(searchItems._meta?.ok, 'Search result metadata must indicate ok: true');
assert.ok(searchItems.length >= 8, `Expected search results, got ${searchItems.length}`);
const matchedItem = searchItems.find((it) => it.title.toLowerCase().includes('one piece'));
assert.ok(matchedItem, 'Should find One Piece in search fixture');
assert.equal(matchedItem.type, 'series');
assert.ok(matchedItem.url.includes('/anime/one-piece'));
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
const details = await scrapeDetails('https://4g.7jcsvwa.shop/anime/one-piece-gfjgfh/', {
  fixtureHtml: fixtures.DETAILS_HTML
});
assert.ok(details._meta?.ok, 'Details metadata must indicate ok: true');
assert.equal(details.title, 'One Piece', 'Details title must match');
assert.equal(details.year, '1999', 'Details year must be extracted');
assert.ok(details.poster?.startsWith('https://'), 'Details poster must be resolved URL');
assert.ok(details.overview.length > 20, 'Details overview must be populated');
assert.ok(Array.isArray(details.genres) && details.genres.length > 0, 'Genres must be extracted');
assert.ok(Array.isArray(details.episodes) && details.episodes.length >= 8, 'Episodes must be extracted in details');
assert.ok(typeof details.episodes[0].number === 'number' && details.episodes[0].number > 0, 'First episode number must be positive number');
console.log(`  ✓ Details parsing verified: "${details.title}" (${details.year}), ${details.episodes.length} episodes.`);

// 7. Episodes Scraper (Offline Fixture)
console.log('\n[Test 7] Verifying scrapeEpisodes with EPISODE_HTML fixture...');
const episodeList = await scrapeEpisodes('https://4g.7jcsvwa.shop/episode/sample/', {
  fixtureHtml: fixtures.EPISODE_HTML
});
assert.ok(Array.isArray(episodeList), 'Episodes result must be an array');
assert.ok(episodeList._meta?.ok, 'Episodes metadata must indicate ok: true');
assert.ok(episodeList.length >= 10, `Expected at least 10 episodes, got ${episodeList.length}`);
const sampleEp = episodeList[0];
assert.equal(typeof sampleEp.number, 'number');
assert.equal(sampleEp.season, 1);
assert.ok(sampleEp.title);
assert.ok(sampleEp.url.startsWith('https://'));
assert.ok(sampleEp.episode_id.startsWith('anime4up:ep:'));
// Verify strictly sorted
for (let i = 1; i < episodeList.length; i++) {
  assert.ok(
    episodeList[i].number >= episodeList[i - 1].number,
    `Episodes must be sorted ascending (${episodeList[i - 1].number} -> ${episodeList[i].number})`
  );
}
console.log(`  ✓ Episodes parsing and ordering verified (${episodeList.length} episodes, sorted).`);

// 8. Servers Scraper (Offline Fixture)
console.log('\n[Test 8] Verifying scrapeServers with EPISODE_HTML fixture...');
const serversList = await scrapeServers('https://4g.7jcsvwa.shop/episode/sample/', {
  fixtureHtml: fixtures.EPISODE_HTML
});
assert.ok(Array.isArray(serversList), 'Servers result must be an array');
assert.ok(serversList._meta?.ok, 'Servers metadata must indicate ok: true');
assert.ok(serversList.length >= 20, `Expected at least 20 servers, got ${serversList.length}`);
serversList.forEach((srv, idx) => {
  assert.equal(srv.code, `AP-${idx + 1}`, `Server code must follow AP-<index> sequence`);
  assert.equal(srv.serverCode, `AP-${idx + 1}`);
  assert.ok(['embed', 'download', 'm3u8', 'mp4'].includes(srv.type), `Valid server type required: ${srv.type}`);
  assert.equal(srv.type, srv.streamType);
  assert.equal(typeof srv.verified, 'boolean', 'verified flag must be strictly boolean');
  assert.equal(srv.verified, false, 'Unprobed servers must have verified: false');
  assert.equal(srv.provider, 'anime4up');
  assert.equal(srv.source, 'anime4up');
  assert.ok(typeof srv.headers === 'object', 'headers must be an object');
});
const embedServers = serversList.filter((s) => s.type === 'embed');
const downloadServers = serversList.filter((s) => s.type === 'download');
assert.ok(embedServers.length > 0, 'Must have embed servers');
assert.ok(downloadServers.length > 0, 'Must have download servers classified from #Synchronize-download');
console.log(`  ✓ Servers extraction verified (${serversList.length} servers: ${embedServers.length} embeds, ${downloadServers.length} downloads, all verified=false).`);

// 9. Stream Resolver (Offline Fixture with VnxPlayer Shell)
console.log('\n[Test 9] Verifying resolveStream with VNX_PLAYER_S1_HTML fixture...');
const resolvedStream = await resolveStream('https://4g.7jcsvwa.shop/Anime4up-S1/mal/21/1180/sub/', {
  fixtureHtml: fixtures.VNX_PLAYER_S1_HTML,
  fixtureVerified: true
});
assert.ok(Array.isArray(resolvedStream), 'resolveStream result must be an array');
assert.ok(resolvedStream._meta?.ok, 'resolveStream metadata must indicate ok: true');
assert.ok(resolvedStream.length >= 1, 'Should resolve at least 1 direct stream');
const primaryStream = resolvedStream[0];
assert.equal(primaryStream.code, 'AP-1');
assert.equal(primaryStream.type, 'm3u8');
assert.equal(primaryStream.quality, 'AUTO-HLS');
assert.equal(primaryStream.verified, true, 'Verified stream must have verified: true');
assert.equal(primaryStream.expiresHint, 'tokenized_url', 'Tokenized stream must have expiresHint');
assert.ok(primaryStream.url.includes('workers.dev/?token='), 'Resolved URL must point to workers.dev HLS token stream');
assert.ok(primaryStream.headers.Referer, 'Must provide required Referer header');
console.log('  ✓ Stream resolver verified:', primaryStream.url.slice(0, 75) + '...');

// 10. Synthetic Legacy Edge Case (SPECIAL_CASE_FIXTURES)
console.log('\n[Test 10] Verifying synthetic legacy special case (input[name="wl"] & legacy DivEpisodesList)...');
assert.equal(fixtures.SPECIAL_CASE_FIXTURES.isSyntheticSpecialCase, true);
const syntheticHtml = fixtures.SPECIAL_CASE_FIXTURES.legacyWlEpisodePage.html;
const syntheticServers = await scrapeServers('https://4g.7jcsvwa.shop/episode/synthetic/', {
  fixtureHtml: syntheticHtml
});
assert.ok(syntheticServers.length >= 4, 'Must decode input[name="wl"] and watch/download links');
const wlStreamwish = syntheticServers.find((s) => s.name.toLowerCase().includes('streamwish') || s.url.includes('streamwish'));
const wlOkRu = syntheticServers.find((s) => s.url.includes('ok.ru'));
const downloadMega = syntheticServers.find((s) => s.url.includes('mega.nz'));
assert.ok(wlStreamwish, 'Must extract streamwish from input[name="wl"] base64 JSON');
assert.ok(wlOkRu, 'Must extract ok.ru from input[name="wl"] base64 JSON');
assert.ok(downloadMega, 'Must extract mega download link');
assert.equal(downloadMega.type, 'download', 'Mega download link must be marked as download type');
console.log('  ✓ Synthetic special case legacy theme selectors verified.');

// 11. SSRF Guard and URL Safety
console.log('\n[Test 11] Verifying SSRF protection guards...');
const unsafeUrls = [
  'http://127.0.0.1/admin',
  'http://169.254.169.254/latest/meta-data/',
  'http://localhost:8080/flag',
  'http://[::1]/secret',
  'javascript:alert(1)',
  'file:///etc/passwd'
];
for (const unsafe of unsafeUrls) {
  const catalogRes = await scrapeCatalog('anime_series', 1, {
    fixtureHtml: fixtures.CATALOG_HTML,
    targetUrl: unsafe
  }).catch((e) => e);
  const detailsRes = await scrapeDetails(unsafe).catch((e) => e);
  const serversRes = await scrapeServers(unsafe).catch((e) => e);
  const streamRes = await resolveStream(unsafe).catch((e) => e);

  assert.ok(
    detailsRes._meta?.errorCode === SCRAPER_ERROR_CODES.UNSAFE_URL || detailsRes.code === SCRAPER_ERROR_CODES.UNSAFE_URL,
    `scrapeDetails must reject unsafe URL ${unsafe}`
  );
  assert.ok(
    serversRes._meta?.errorCode === SCRAPER_ERROR_CODES.UNSAFE_URL || serversRes.code === SCRAPER_ERROR_CODES.UNSAFE_URL,
    `scrapeServers must reject unsafe URL ${unsafe}`
  );
  assert.ok(
    streamRes._meta?.errorCode === SCRAPER_ERROR_CODES.UNSAFE_URL || streamRes.code === SCRAPER_ERROR_CODES.UNSAFE_URL,
    `resolveStream must reject unsafe URL ${unsafe}`
  );
}
console.log('  ✓ SSRF guards blocked all loopback, cloud metadata, and protocol injection attempts.');

console.log('\n======================================================');
console.log('🎉 ALL ANIME4UP FIXTURE TESTS PASSED SUCCESSFULLY! 🎉');
console.log('======================================================\n');
process.exit(0);
