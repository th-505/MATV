// scripts/providers/yallashoot.fixture.test.mjs
// Offline fixture test suite for YallaShoot provider (يلا شوت - Yalla Shoot, code: YS)
import assert from 'node:assert/strict';
import {
  FIXTURE_META,
  CATALOG_TODAY_HTML,
  CATALOG_YESTERDAY_HTML,
  MATCH_DETAILS_HTML,
  SYNTHETIC_LIVE_MATCH_WITH_SERVERS_HTML,
  SYNTHETIC_EMBED_WITH_DIRECT_M3U8_HTML
} from '../fixtures/providers/yallashoot.fixture.mjs';

import {
  PROVIDER_META,
  YALLASHOOT_SITE_CONFIG,
  rewriteToActiveYallaShootDomain,
  resolveYallaShootTargetUrl,
  scrapeCatalog,
  scrapeLive,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeYallaShootMatches
} from '../../server/scrapers/sites/yallashoot.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== Starting YallaShoot Fixture Test Suite ===');

// 1. PROVIDER METADATA CONTRACT
console.log('1. Testing Provider Metadata Contract...');
assert.equal(PROVIDER_META.id, 'yallashoot');
assert.equal(PROVIDER_META.code, 'YS');
assert.equal(PROVIDER_META.name, 'يلا شوت (Yalla Shoot)');
assert.ok(PROVIDER_META.domains.includes('https://yalla-shootz.cc'));
assert.ok(PROVIDER_META.domains.includes('https://yalla-shoot.tv'));
assert.equal(PROVIDER_META.capabilities.catalog, true);
assert.equal(PROVIDER_META.capabilities.search, false);
assert.equal(PROVIDER_META.capabilities.details, true);
assert.equal(PROVIDER_META.capabilities.episodes, false);
assert.equal(PROVIDER_META.capabilities.servers, true);
assert.equal(PROVIDER_META.capabilities.resolve, true);
assert.equal(PROVIDER_META.capabilities.live, true);
assert.equal(PROVIDER_META.searchSpec, null);
assert.deepEqual(PROVIDER_META.notImplemented, {});

// 2. DOMAIN REWRITING & TARGET RESOLUTION
console.log('2. Testing Domain Rewriting & Target Resolution...');
assert.equal(
  rewriteToActiveYallaShootDomain('https://yalla-shoot.tv/matches/test/'),
  'https://yalla-shootz.cc/matches/test/'
);
assert.equal(
  rewriteToActiveYallaShootDomain('/matches-today'),
  'https://yalla-shootz.cc/matches-today'
);

const encodedRef = resolveYallaShootTargetUrl('yallashoot:aHR0cHM6Ly95YWxsYS1zaG9vdHouY2MvbWF0Y2hlcy9ldmVydG9uLXZzLWNoZWxzZWEv');
assert.equal(encodedRef, 'https://yalla-shootz.cc/matches/everton-vs-chelsea/');

// 3. TODAY'S CATALOG FIXTURE SCRAPING
console.log("3. Testing Today's Catalog Fixture Scraping...");
const todayMatches = await scrapeCatalog('today', 1, {
  fixtureHtml: CATALOG_TODAY_HTML
});

assert.ok(Array.isArray(todayMatches), 'Catalog must return an array');
assert.equal(todayMatches.length, 4, 'Catalog fixture contains 4 matches');

const m1 = todayMatches[0];
assert.equal(m1.source, 'yallashoot');
assert.equal(m1.serverPrefix, 'YS');
assert.equal(m1.type, 'live');
assert.equal(m1.category, 'match');
assert.equal(m1.is_series, false);
assert.ok(m1.ref.startsWith('yallashoot:'));
assert.equal(m1.url, 'https://yalla-shootz.cc/matches/everton-vs-chelsea/');
assert.equal(m1.team1.name, 'إيفرتون');
assert.equal(m1.team2.name, 'تشيلسي');
assert.equal(m1.time, '2:30 PM');
assert.equal(m1.score, '0-0');
assert.equal(m1.status, 'upcoming');
assert.equal(m1.channel, 'beIN Sports 1');
assert.equal(m1.commentator, 'خليل البلوشي');
assert.equal(m1.tournament, 'الدوري الإنجليزي');
assert.ok(m1.poster.includes('Everton2018'));
assert.ok(todayMatches._meta?.ok, 'Catalog _meta.ok must be true');

// 4. YESTERDAY'S CATALOG FIXTURE SCRAPING
console.log("4. Testing Yesterday's Catalog Fixture Scraping...");
const yesterdayMatches = await scrapeCatalog('yesterday', 1, {
  fixtureHtml: CATALOG_YESTERDAY_HTML
});

assert.ok(Array.isArray(yesterdayMatches));
assert.equal(yesterdayMatches.length, 2);

const ym1 = yesterdayMatches[0];
assert.equal(ym1.team1.name, 'المريخ بانتيو');
assert.equal(ym1.team2.name, 'بيراميدز');
assert.equal(ym1.score, '1-0');
assert.equal(ym1.status, 'finished');
assert.equal(ym1.channel, 'ON Sport MAX');
assert.equal(ym1.tournament, 'دوري أبطال أفريقيا');
assert.ok(yesterdayMatches._meta?.ok);

// 5. PAGINATION HANDLING
console.log('5. Testing Pagination Behavior (page > 1)...');
const p2Matches = await scrapeCatalog('today', 2, {
  fixtureHtml: CATALOG_TODAY_HTML
});
assert.equal(p2Matches.length, 0);
assert.equal(p2Matches._meta?.errorCode, SCRAPER_ERROR_CODES.EMPTY_RESULT);
assert.equal(p2Matches._meta?.errorMessage, 'NO_MORE_PAGES');

// 6. SEARCH CAPABILITY (UNSUPPORTED)
console.log('6. Testing Search Capability (Must report UNSUPPORTED_CAPABILITY)...');
const searchRes = await scrapeSearch('ريال مدريد', 1);
assert.equal(searchRes.length, 0);
assert.equal(searchRes._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

// 7. EPISODES CAPABILITY (UNSUPPORTED)
console.log('7. Testing Episodes Capability (Must report UNSUPPORTED_CAPABILITY)...');
const episodesRes = await scrapeEpisodes('https://yalla-shootz.cc/matches/everton-vs-chelsea/');
assert.equal(episodesRes.length, 0);
assert.equal(episodesRes._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

// 8. MATCH DETAILS FIXTURE SCRAPING
console.log('8. Testing Match Details Fixture Scraping...');
const matchDetails = await scrapeDetails('https://yalla-shootz.cc/matches/everton-vs-chelsea/', {
  fixtureHtml: MATCH_DETAILS_HTML
});

assert.ok(matchDetails);
assert.equal(matchDetails.tournament, 'الدوري الإنجليزي');
assert.equal(matchDetails.date, '17-10-2026');
assert.equal(matchDetails.time, '14:30 Time');
assert.equal(matchDetails.channel, 'beIN Sports 1');
assert.equal(matchDetails.commentator, 'خليل البلوشي');
assert.equal(matchDetails.stadium, 'جوديسون بارك');
assert.equal(matchDetails.team1.name, 'إيفرتون');
assert.equal(matchDetails.team2.name, 'تشيلسي');
assert.equal(matchDetails.type, 'live');
assert.equal(matchDetails.category, 'match');
assert.equal(matchDetails.is_series, false);
assert.equal(matchDetails.source, 'yallashoot');
assert.ok(matchDetails._meta?.ok);

// 9. SERVERS FIXTURE SCRAPING (SYNTHETIC ACTIVE BROADCAST)
console.log('9. Testing Servers Fixture Scraping...');
const servers = await scrapeServers('https://yalla-shootz.cc/matches/liverpool-vs-manchester-united/', {
  fixtureHtml: SYNTHETIC_LIVE_MATCH_WITH_SERVERS_HTML
});

assert.ok(Array.isArray(servers));
assert.equal(servers.length, 2, 'Should extract 2 servers');
assert.equal(servers[0].code, 'YS-1');
assert.equal(servers[0].serverCode, 'YS-1');
assert.equal(servers[0].name, 'سيرفر 1 - متعدد الجودات');
assert.equal(servers[0].url, 'https://embed.streamprovider.net/live/ch1.html');
assert.equal(servers[0].type, 'embed');
assert.equal(servers[0].source, 'yallashoot');

assert.equal(servers[1].code, 'YS-2');
assert.equal(servers[1].serverCode, 'YS-2');
assert.equal(servers[1].name, 'سيرفر 2 - جودة متوسطة');
assert.equal(servers[1].url, 'https://embed.streamprovider.net/live/ch2.html');
assert.ok(servers._meta?.ok);

// 9b. INLINE SCRIPT STREAM EXTRACTION (SYNTHETIC FIXTURE)
console.log('9b. Testing Inline Script Stream Extraction (SYNTHETIC_EMBED_WITH_DIRECT_M3U8_HTML)...');
const inlineServers = await scrapeServers('https://yalla-shootz.cc/matches/test/', {
  fixtureHtml: SYNTHETIC_EMBED_WITH_DIRECT_M3U8_HTML
});
assert.ok(Array.isArray(inlineServers));
assert.ok(inlineServers.length >= 1, 'Should extract inline m3u8 stream');
assert.equal(inlineServers[0].type, 'm3u8');
assert.equal(inlineServers[0].url, 'https://edge-live.cdnstream.net/hls/live/channel1/index.m3u8');
assert.equal(inlineServers[0].code, 'YS-1');

// 10. STREAM RESOLUTION
console.log('10. Testing Stream Resolution...');
const directHls = await resolveStream('https://edge-live.cdnstream.net/hls/live/channel1/index.m3u8');
assert.equal(directHls.type, 'm3u8');
assert.equal(directHls.url, 'https://edge-live.cdnstream.net/hls/live/channel1/index.m3u8');
assert.ok(directHls._meta?.ok);

const embedRes = await resolveStream('https://embed.streamprovider.net/live/ch1.html');
assert.equal(embedRes.type, 'embed');
assert.equal(embedRes.url, 'https://embed.streamprovider.net/live/ch1.html');
assert.ok(embedRes._meta?.ok);

// 11. SUPERVISOR 6 BACKWARD COMPATIBILITY BRIDGE
console.log('11. Testing Supervisor 6 Backward Compatibility Bridge...');
const bridgeMatches = await scrapeYallaShootMatches({
  fixtureHtml: CATALOG_TODAY_HTML
});
assert.ok(Array.isArray(bridgeMatches));
assert.equal(bridgeMatches.length, 4);
assert.equal(bridgeMatches[0].team1.name, 'إيفرتون');
assert.equal(bridgeMatches[0].team2.name, 'تشيلسي');
assert.equal(bridgeMatches[0].status, 'upcoming');
assert.equal(bridgeMatches[0].link, 'https://yalla-shootz.cc/matches/everton-vs-chelsea/');
assert.equal(bridgeMatches[0].channel, 'beIN Sports 1');

console.log('\nAll YallaShoot Fixture Tests Passed Successfully! [11/11]');
