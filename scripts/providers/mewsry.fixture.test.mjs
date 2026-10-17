// scripts/providers/mewsry.fixture.test.mjs
// Offline fixture-based test suite for Syria Live / Mewsry scraper (MY)
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  MEWSRY_CONFIG,
  resolveTargetUrl,
  parseMatchesFromHtml,
  parsePostCardsFromHtml,
  scrapeCatalog,
  scrapeLive,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  extractMewsryStreams
} from '../../server/scrapers/sites/mewsry.mjs';
import {
  FIXTURE_META,
  REAL_MATCHES_TODAY_HTML,
  REAL_MATCHES_YESTERDAY_HTML,
  REAL_SEARCH_HTML,
  REAL_SEARCH_EMPTY_HTML,
  SPECIAL_CASE_FIXTURES
} from '../fixtures/providers/mewsry.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('--- Starting Syria Live / Mewsry (MY) Offline Fixture Test Suite ---');

// 1. Meta Contract Validation
console.log('1. Checking PROVIDER_META and MEWSRY_CONFIG...');
assert.equal(PROVIDER_META.id, 'mewsry');
assert.equal(PROVIDER_META.name, 'سوريا لايف (Mewsry / Syria Live)');
assert.equal(PROVIDER_META.code, 'MY');
assert.ok(PROVIDER_META.domains.includes('https://www.manasorya.site'));
assert.ok(PROVIDER_META.domains.includes('https://www.mewsry.live'));
assert.equal(PROVIDER_META.mirrorOf, null);
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, true);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, false);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, true);

assert.ok(PROVIDER_META.notImplemented.episodes);
assert.equal(PROVIDER_META.searchSpec.method, 'GET');
assert.equal(PROVIDER_META.searchSpec.queryParam, 's');

assert.equal(MEWSRY_CONFIG.id, 'mewsry');
assert.equal(MEWSRY_CONFIG.code, 'MY');
console.log('✓ PROVIDER_META conforms strictly to specification');

// 2. Fixture Metadata Isolation Check
console.log('2. Verifying fixture metadata isolation...');
assert.equal(FIXTURE_META.isRealLiveSample, true);
assert.equal(FIXTURE_META.providerId, 'mewsry');
assert.ok(FIXTURE_META.urls.today);
assert.ok(FIXTURE_META.urls.yesterday);
assert.ok(FIXTURE_META.urls.search);
assert.ok(FIXTURE_META.urls.searchEmpty);
assert.equal(SPECIAL_CASE_FIXTURES.isSyntheticSpecialCase, true);
assert.equal(SPECIAL_CASE_FIXTURES.legacyPhpMelodyHtml.isSyntheticSpecialCase, true);
assert.equal(SPECIAL_CASE_FIXTURES.liveStreamPlayerHtml.isSyntheticSpecialCase, true);
console.log('✓ Fixture isolation verified');

// 3. Target URL Resolution
console.log('3. Testing target URL resolution and reference decoders...');
const resolvedFromRef = resolveTargetUrl('mewsry:match:test-vs-team:12345');
assert.ok(resolvedFromRef.includes('https://www.manasorya.site'));

const resolvedB64 = resolveTargetUrl(`mewsry:${Buffer.from('https://www.manasorya.site/?match_day=today').toString('base64url')}`);
assert.equal(resolvedB64, 'https://www.manasorya.site/?match_day=today');

const resolvedDefault = resolveTargetUrl('');
assert.equal(resolvedDefault, 'https://www.manasorya.site/');
console.log('✓ Reference and URL resolution verified');

// 4. Catalog Scraper - Today's Live Real Capture
console.log('4. Testing scrapeCatalog with REAL_MATCHES_TODAY_HTML...');
const todayCatalog = await scrapeCatalog('today', 1, {
  fixtureHtml: REAL_MATCHES_TODAY_HTML
});
assert.equal(todayCatalog._meta.ok, true);
assert.equal(todayCatalog.length, 31);
assert.equal(todayCatalog[0].homeTeam.name, 'إيرزوروم سبور');
assert.equal(todayCatalog[0].awayTeam.name, 'أيوب سبور');
assert.equal(todayCatalog[0].competition, 'الدوري التركي');
assert.equal(todayCatalog[0].time, '13:30');
assert.equal(todayCatalog[0].serverPrefix, 'MY');
assert.equal(todayCatalog[0].source, 'mewsry');

// Match 2: Everton vs Chelsea
assert.equal(todayCatalog[2].homeTeam.name, 'إيفرتون');
assert.equal(todayCatalog[2].awayTeam.name, 'تشيلسي');
assert.equal(todayCatalog[2].competition, 'الدوري الإنجليزي الممتاز');
console.log(`✓ Catalog today parsed 31 matches successfully (Sample: "${todayCatalog[2].title}")`);

// 5. Catalog Scraper - Yesterday's Real Capture (Finished Matches with Scores)
console.log('5. Testing scrapeCatalog with REAL_MATCHES_YESTERDAY_HTML...');
const yesterdayCatalog = await scrapeCatalog('yesterday', 1, {
  fixtureHtml: REAL_MATCHES_YESTERDAY_HTML
});
assert.equal(yesterdayCatalog._meta.ok, true);
assert.equal(yesterdayCatalog.length, 7);
assert.equal(yesterdayCatalog[0].homeTeam.name, 'زد');
assert.equal(yesterdayCatalog[0].awayTeam.name, 'عزام يونايتد');
assert.equal(yesterdayCatalog[0].score, '1 - 1');
assert.equal(yesterdayCatalog[0].status, 'finished');
console.log(`✓ Catalog yesterday parsed 7 finished matches with scores (Sample: "${yesterdayCatalog[0].title}" ${yesterdayCatalog[0].score})`);

// 6. Live Scraper Capability
console.log('6. Testing scrapeLive capability...');
const liveMatches = await scrapeLive({
  fixtureHtml: REAL_MATCHES_TODAY_HTML
});
assert.equal(liveMatches._meta.ok, true);
assert.equal(liveMatches.length, 31);
assert.ok(liveMatches[0].isLive !== undefined);
console.log(`✓ Live capability returned ${liveMatches.length} matches with live status tags`);

// 7. Search Scraper - Query with Articles (Real Capture)
console.log('7. Testing scrapeSearch with REAL_SEARCH_HTML...');
const searchResults = await scrapeSearch('مباراة', 1, {
  fixtureHtml: REAL_SEARCH_HTML
});
assert.equal(searchResults._meta.ok, true);
assert.equal(searchResults.length, 1);
assert.ok(searchResults[0].title.includes('بوروسيا دورتموند ضد بايرن ميونخ'));
assert.equal(searchResults[0].serverPrefix, 'MY');
console.log(`✓ Search parsed 1 article for "مباراة": "${searchResults[0].title}"`);

// 8. Search Scraper - Empty Results (Real Capture)
console.log('8. Testing scrapeSearch with REAL_SEARCH_EMPTY_HTML...');
const searchEmptyResults = await scrapeSearch('asdfghjklnonexistent', 1, {
  fixtureHtml: REAL_SEARCH_EMPTY_HTML
});
assert.equal(searchEmptyResults._meta.ok, true);
assert.equal(searchEmptyResults.length, 0);
assert.equal(searchEmptyResults._meta.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('✓ Search returned empty result correctly with EMPTY_RESULT code');

// 9. Search Scraper - Empty Query Input Validation
console.log('9. Testing scrapeSearch with empty query string...');
const searchBlank = await scrapeSearch('', 1);
assert.equal(searchBlank._meta.ok, true);
assert.equal(searchBlank.length, 0);
assert.equal(searchBlank._meta.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
console.log('✓ Empty query gracefully handled');

// 10. Details Scraper - Match Details
console.log('10. Testing scrapeDetails with today match schedule...');
const matchDetails = await scrapeDetails('https://www.manasorya.site/?match_day=today#%D8%A5%D9%8A%D9%81%D8%B1%D8%AA%D9%88%D9%86-vs-%D8%AA%D8%B4%D9%8A%D9%84%D8%B3%D9%8A', {
  fixtureHtml: REAL_MATCHES_TODAY_HTML
});
assert.equal(matchDetails._meta.ok, true);
assert.ok(matchDetails.title.includes('إيفرتون ضد تشيلسي'));
assert.equal(matchDetails.homeTeam.name, 'إيفرتون');
assert.equal(matchDetails.awayTeam.name, 'تشيلسي');
assert.equal(matchDetails.competition, 'الدوري الإنجليزي الممتاز');
assert.equal(matchDetails.type, 'live');
console.log(`✓ Match details parsed successfully: "${matchDetails.title}"`);

// 11. Episodes Capability - Contract Validation
console.log('11. Testing scrapeEpisodes on sports match (unsupported capability)...');
const matchEpisodes = await scrapeEpisodes('https://www.manasorya.site/?match_day=today', {
  fixtureHtml: REAL_MATCHES_TODAY_HTML
});
assert.equal(matchEpisodes._meta.ok, false);
assert.equal(matchEpisodes._meta.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);
assert.equal(matchEpisodes.length, 0);
console.log('✓ Sports match returns UNSUPPORTED_CAPABILITY for episodes');

// 12. Episodes Capability - Legacy PHP Melody Support
console.log('12. Testing scrapeEpisodes on legacy PHP Melody video fixture...');
const phpMelodyEpisodes = await scrapeEpisodes('https://www.mewsry.live/watch.php?vid=abc1', {
  fixtureHtml: SPECIAL_CASE_FIXTURES.legacyPhpMelodyHtml.html
});
assert.equal(phpMelodyEpisodes._meta.ok, true);
assert.equal(phpMelodyEpisodes.length, 2);
assert.equal(phpMelodyEpisodes[0].number, 1);
assert.equal(phpMelodyEpisodes[1].number, 2);
console.log(`✓ Legacy PHP Melody parsed ${phpMelodyEpisodes.length} video parts`);

// 13. Servers Capability - Unwrapping Synthetic Video Players
console.log('13. Testing scrapeServers on synthetic PHP Melody player...');
const phpServers = await scrapeServers('https://www.mewsry.live/watch.php?vid=abc1', {
  fixtureHtml: SPECIAL_CASE_FIXTURES.legacyPhpMelodyHtml.html
});
assert.equal(phpServers._meta.ok, true);
assert.ok(phpServers.length >= 2);
assert.equal(phpServers[0].code, 'MY-1');
assert.equal(phpServers[0].provider, 'mewsry');
assert.equal(phpServers[1].code, 'MY-2');
console.log(`✓ PHP Melody player unwrapped ${phpServers.length} servers (Codes: ${phpServers.map(s => s.code).join(', ')})`);

console.log('14. Testing scrapeServers on synthetic direct video embed player...');
const directServers = await scrapeServers('https://www.manasorya.site/live-stream', {
  fixtureHtml: SPECIAL_CASE_FIXTURES.liveStreamPlayerHtml.html
});
assert.equal(directServers._meta.ok, true);
assert.ok(directServers.length >= 1);
assert.equal(directServers[0].type, 'm3u8');
assert.ok(directServers[0].headers.Referer);
console.log(`✓ Direct stream player extracted: ${directServers[0].url} (${directServers[0].type})`);

// 15. Resolve Stream
console.log('15. Testing resolveStream for direct media...');
const resolvedHls = await resolveStream('https://stream.example.org/live/playlist.m3u8', {
  skipProbe: true
});
assert.equal(resolvedHls.type, 'm3u8');
assert.ok(resolvedHls.headers.Referer);

const resolvedMp4 = await resolveStream('https://stream.example.org/vod/video.mp4', {
  skipProbe: true
});
assert.equal(resolvedMp4.type, 'mp4');
console.log('✓ resolveStream correctly resolves direct HLS and MP4 streams');

// 16. Backward-Compatible extractMewsryStreams
console.log('16. Testing backward-compatible extractMewsryStreams...');
const legacyRes = await extractMewsryStreams('https://www.mewsry.live/watch.php?vid=abc1');
assert.ok(Array.isArray(legacyRes.episodes));
assert.ok(Array.isArray(legacyRes.servers));
console.log('✓ extractMewsryStreams backward compatibility verified');

console.log('\n================================================================');
console.log('   ALL SYRIA LIVE / MEWSRY OFFLINE FIXTURE TESTS PASSED!        ');
console.log('================================================================');
