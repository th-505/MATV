// scripts/providers/egydead.fixture.test.mjs
// Offline deterministic fixture test suite for EgyDead (egydead / egydead_live) — Code: ED / EL
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  EGYDEAD_CONFIG,
  PROVIDER_ID,
  PROVIDER_CODE,
  LIVE_PROVIDER_ID,
  LIVE_PROVIDER_CODE,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive,
  scrapeEgyDeadCategory,
  extractEgyDeadStreamsAndEpisodes,
  scrapeEgyDeadCatalog,
  scrapeEgyDeadDetails,
  scrapeEgyDeadLiveChannels,
  searchEgyDead,
  resolveTargetUrl,
  parseCatalogItems,
  parseEpisodesFromHtml,
  parseServersFromHtml,
  parseLiveChannelsFromHtml
} from '../../server/scrapers/sites/egydead.mjs';
import * as fixtures from '../fixtures/providers/egydead.fixture.mjs';
import { SCRAPER_ERROR_CODES, ScraperError } from '../../server/scrapers/shared/errors.mjs';

console.log('=== EgyDead Offline Fixture Test Suite ===\n');

// 1. PROVIDER_META & Configuration Contract
console.log('[Test 1] Verifying PROVIDER_META and configuration contract...');
assert.equal(PROVIDER_META.id, 'egydead', 'Provider ID must be egydead');
assert.equal(PROVIDER_META.code, 'ED', 'Provider code must be ED');
assert.equal(PROVIDER_META.name, 'إيجي ديد (EgyDead)');
assert.equal(PROVIDER_META.mirrorOf, null, 'mirrorOf must be null for primary provider');
assert.deepEqual(
  PROVIDER_META.capabilities,
  {
    catalog: true,
    search: true,
    details: true,
    episodes: true,
    servers: true,
    resolve: true,
    live: true
  },
  'Capabilities matrix must match contract (including live: true)'
);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');
assert.equal(PROVIDER_META.searchSpec.encoding, 'utf-8');
assert.ok(PROVIDER_META.searchSpec.pathTemplate.includes('/?s={query}'));
assert.ok(PROVIDER_META.domains.includes('https://w1.egydead.top'));
assert.ok(PROVIDER_META.domains.includes('https://egydead.live'));
assert.ok(PROVIDER_META.domains.includes('https://tv10.egydead.live'));
console.log('  ✓ PROVIDER_META contract verified.');

// 2. URL Resolving & Ref Decoding
console.log('\n[Test 2] Verifying resolveTargetUrl...');
const resolvedPlain = resolveTargetUrl('https://w1.egydead.top/movie/test');
assert.equal(resolvedPlain, 'https://w1.egydead.top/movie/test');

const base64Ref = `egydead:${Buffer.from('https://w1.egydead.top/movie/test-base64').toString('base64url')}`;
const resolvedRef = resolveTargetUrl(base64Ref);
assert.equal(resolvedRef, 'https://w1.egydead.top/movie/test-base64');

const liveChannelRef = `egydead_tv:${Buffer.from('https://tv10.egydead.live/channel/bein-1').toString('base64url')}`;
const resolvedLiveRef = resolveTargetUrl(liveChannelRef);
assert.equal(resolvedLiveRef, 'https://tv10.egydead.live/channel/bein-1');
console.log('  ✓ resolveTargetUrl handles plain URLs and base64url refs.');

// 3. Catalog Scraper (Offline Fixture)
console.log('\n[Test 3] Verifying scrapeCatalog with CATALOG_HTML fixture...');
const catalogItems = await scrapeCatalog('movies_foreign', 1, {
  fixtureHtml: fixtures.CATALOG_HTML
});
assert.ok(Array.isArray(catalogItems), 'Catalog result must be an array');
assert.ok(catalogItems._meta?.ok, 'Catalog result metadata must indicate ok: true');
assert.ok(catalogItems.length >= 4, `Expected at least 4 items, got ${catalogItems.length}`);

const sampleMovie = catalogItems.find((it) => it.title.includes('The Dark Knight'));
assert.ok(sampleMovie, 'Should parse The Dark Knight from catalog');
assert.ok(sampleMovie.url.startsWith('https://'), 'URL must be safe https');
assert.ok(sampleMovie.poster.startsWith('https://'), 'Poster URL must be safe https');
assert.equal(sampleMovie.serverPrefix, 'ED', 'Server prefix must be ED');
assert.ok(sampleMovie.ref.startsWith('egydead:'), 'Ref must start with egydead:');
assert.equal(sampleMovie.year, '2008', 'Year should be 2008');
console.log(`  ✓ Catalog parsing verified (${catalogItems.length} items parsed). Sample: "${sampleMovie.title}"`);

// 4. Search Scraper (Offline Fixture)
console.log('\n[Test 4] Verifying scrapeSearch with SEARCH_HTML fixture...');
const searchItems = await scrapeSearch('batman', 1, {
  fixtureHtml: fixtures.SEARCH_HTML
});
assert.ok(Array.isArray(searchItems), 'Search result must be an array');
assert.ok(searchItems._meta?.ok, 'Search result metadata must indicate ok: true');
assert.ok(searchItems.length >= 3, `Expected at least 3 search results, got ${searchItems.length}`);
const sampleSearch = searchItems[0];
assert.ok(sampleSearch.title.toLowerCase().includes('batman'));
assert.equal(sampleSearch.serverPrefix, 'ED');
console.log(`  ✓ Search parsing verified (${searchItems.length} items parsed). Top: "${sampleSearch.title}"`);

// 5. Empty Search Handling
console.log('\n[Test 5] Verifying empty search query behavior...');
const emptyQuerySearch = await scrapeSearch('', 1);
assert.ok(Array.isArray(emptyQuerySearch));
assert.equal(emptyQuerySearch.length, 0);
assert.equal(emptyQuerySearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);

const emptyFixtureSearch = await scrapeSearch('nonexistentxyz', 1, {
  fixtureHtml: fixtures.SEARCH_EMPTY_HTML
});
assert.ok(Array.isArray(emptyFixtureSearch));
assert.equal(emptyFixtureSearch.length, 0);
assert.equal(emptyFixtureSearch._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('  ✓ Empty search queries and no-result fixtures return empty array with EMPTY_RESULT metadata.');

// 6. Movie Details Scraper (Offline Fixture)
console.log('\n[Test 6] Verifying scrapeDetails for a movie...');
const movieDetails = await scrapeDetails('https://w1.egydead.top/movie/batman-the-dark-knight-2008/', {
  fixtureHtml: fixtures.MOVIE_DETAILS_HTML
});
assert.ok(movieDetails._meta?.ok, 'Details metadata must indicate ok: true');
assert.ok(movieDetails.title.includes('The Dark Knight'));
assert.equal(movieDetails.year, '2008');
assert.equal(movieDetails.rating, '9.0');
assert.ok(movieDetails.poster.startsWith('https://'));
assert.ok(movieDetails.overview.length > 20);
assert.equal(movieDetails.type, 'movie');
assert.ok(movieDetails.servers.length >= 2, 'Movie should have parsed servers');
const firstMovieServer = movieDetails.servers[0];
assert.ok(firstMovieServer.code.startsWith('ED-'), `Server code must start with ED-, got ${firstMovieServer.code}`);
console.log(`  ✓ Movie details verified: "${movieDetails.title}" (${movieDetails.servers.length} servers)`);

// 7. Series Details and Episodes (Offline Fixture)
console.log('\n[Test 7] Verifying scrapeDetails and scrapeEpisodes for a series...');
const seriesDetails = await scrapeDetails('https://w1.egydead.top/series/house-of-the-dragon-season-2/', {
  fixtureHtml: fixtures.SERIES_DETAILS_HTML
});
assert.ok(seriesDetails._meta?.ok);
assert.ok(seriesDetails.title.includes('House of the Dragon'));
assert.equal(seriesDetails.type, 'series');
assert.ok(seriesDetails.episodes.length >= 5, `Expected 5 episodes, got ${seriesDetails.episodes.length}`);
assert.equal(seriesDetails.episodes[0].number, 1);
assert.equal(seriesDetails.episodes[0].season, 2);

const separateEpisodes = await scrapeEpisodes('https://w1.egydead.top/series/house-of-the-dragon-season-2/', {
  fixtureHtml: fixtures.SERIES_DETAILS_HTML
});
assert.ok(Array.isArray(separateEpisodes));
assert.equal(separateEpisodes.length, 5);
assert.equal(separateEpisodes[4].number, 5);
console.log(`  ✓ Series details and episode list verified (${separateEpisodes.length} episodes).`);

// 8. Watch Servers (Offline Fixture)
console.log('\n[Test 8] Verifying scrapeServers on watch page...');
const servers = await scrapeServers('https://w1.egydead.top/watch/house-of-the-dragon-s2-e1/', {
  fixtureHtml: fixtures.WATCH_HTML
});
assert.ok(Array.isArray(servers));
assert.ok(servers._meta?.ok);
assert.ok(servers.length >= 3, `Expected at least 3 servers, got ${servers.length}`);
assert.equal(servers[0].code, 'ED-1');
assert.ok(servers.some((s) => s.type === 'mp4' || s.type === 'm3u8'), 'Should detect direct mp4/m3u8 stream');
assert.ok(servers.some((s) => s.type === 'embed'), 'Should detect embed server');
console.log(`  ✓ Watch servers verified (${servers.length} servers found, codes ED-1..ED-${servers.length}).`);

// 9. Live IPTV Channels Scraper (Offline Fixture)
console.log('\n[Test 9] Verifying scrapeLive and live channel servers...');
const liveChannels = await scrapeLive({
  fixtureHtml: fixtures.LIVE_CHANNELS_HTML
});
assert.ok(Array.isArray(liveChannels));
assert.ok(liveChannels._meta?.ok);
assert.ok(liveChannels.length >= 4, `Expected at least 4 live channels, got ${liveChannels.length}`);
const vodOnlyLiveProbe = await scrapeLive({ fixtureHtml: fixtures.CATALOG_HTML });
assert.equal(vodOnlyLiveProbe.length, 0);
assert.equal(vodOnlyLiveProbe._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);
assert.match(vodOnlyLiveProbe._meta?.errorMessage || '', /LIVE_CHANNEL_SOURCE_UNAVAILABLE/);

const bein1 = liveChannels.find((ch) => ch.name.includes('beIN Sports 1'));
assert.ok(bein1, 'Must find beIN Sports 1 HD');
assert.equal(bein1.source, 'egydead_live');
assert.equal(bein1.serverPrefix, 'EL');
assert.ok(bein1.streams[0].code.startsWith('EL-'), `Live stream code must start with EL-, got ${bein1.streams[0].code}`);

const liveServers = await scrapeServers('https://tv10.egydead.live/channel/bein-sports-1-hd/', {
  fixtureHtml: fixtures.LIVE_CHANNELS_HTML
});
assert.ok(Array.isArray(liveServers));
assert.ok(liveServers[0].code.startsWith('EL-'), `Live server code must start with EL-, got ${liveServers[0].code}`);
console.log(`  ✓ Live IPTV channels verified (${liveChannels.length} channels, prefix EL).`);

// 10. resolveStream Behavior
console.log('\n[Test 10] Verifying resolveStream...');
// Direct media resolution
const directMp4Server = {
  code: 'ED-1',
  url: 'https://dl.egydead.top/storage/hotd-s2-e1-1080p.mp4',
  type: 'mp4'
};
const resolvedDirect = await resolveStream(directMp4Server, { skipVerification: true });
assert.equal(resolvedDirect.type, 'mp4');
assert.equal(resolvedDirect.code, 'ED-1');
assert.equal(resolvedDirect.url, directMp4Server.url);

// Live stream resolution
const liveServer = {
  code: 'EL-1',
  url: 'https://tv10.egydead.live/channel/bein-sports-1-hd/',
  type: 'embed'
};
const resolvedLive = await resolveStream(liveServer, { skipVerification: true });
assert.equal(resolvedLive.provider, 'egydead_live');
assert.equal(resolvedLive.code, 'EL-1');
assert.equal(resolvedLive.type, 'embed');
console.log('  ✓ resolveStream verified for direct media and live embeds.');

// 11. Cloudflare 403 Challenge Classification
console.log('\n[Test 11] Verifying Cloudflare challenge classification as ACCESS_BLOCKED...');
let blockedCaught = false;
try {
  await scrapeCatalog('movies', 1, {
    fixtureHtml: fixtures.CLOUDFLARE_CHALLENGE_HTML,
    fixtureStatus: 403,
    strict: true
  });
} catch (err) {
  blockedCaught = true;
  assert.equal(err.code, SCRAPER_ERROR_CODES.ACCESS_BLOCKED, `Expected ACCESS_BLOCKED, got ${err.code}`);
  console.log(`  ✓ Cloudflare challenge correctly thrown as ScraperError(ACCESS_BLOCKED): ${err.message}`);
}
assert.ok(blockedCaught, 'Must catch ACCESS_BLOCKED error on Cloudflare challenge fixture');

// 12. Backward-Compatible Named Exports
console.log('\n[Test 12] Verifying backward-compatible exports...');
const legacyCategory = await scrapeEgyDeadCategory('movies_foreign', 1, false, {
  fixtureHtml: fixtures.CATALOG_HTML
});
assert.ok(Array.isArray(legacyCategory));
assert.ok(legacyCategory.length >= 4);
assert.ok(legacyCategory[0].id.startsWith('egydead:'));
assert.equal(legacyCategory[0].serverPrefix, 'ED');

const legacyStreamsAndEpisodes = await extractEgyDeadStreamsAndEpisodes('https://w1.egydead.top/series/house-of-the-dragon-season-2/', {
  fixtureHtml: fixtures.SERIES_DETAILS_HTML
});
assert.ok(legacyStreamsAndEpisodes);
assert.ok(legacyStreamsAndEpisodes.episodes.length >= 5);

const legacyLiveChannels = await scrapeEgyDeadLiveChannels({
  fixtureHtml: fixtures.LIVE_CHANNELS_HTML
});
assert.ok(Array.isArray(legacyLiveChannels));
assert.ok(legacyLiveChannels.length >= 4);
console.log('  ✓ Backward-compatible named exports verified.');

console.log('\n==============================================');
console.log('🎉 ALL 12 OFFLINE FIXTURE TESTS PASSED CLEANLY');
console.log('==============================================');
