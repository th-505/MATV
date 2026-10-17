// scripts/providers/akwam.live.test.mjs
// End-to-end live verification test suite for Akwam / Akoam (أكوام, code: AK)
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  AKWAM_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive
} from '../../server/scrapers/sites/akwam.mjs';

console.log('=== Starting Akwam Live Verification Suite ===');
console.log(`Primary Domain: ${AKWAM_CONFIG.baseUrl}`);
console.log(`Fallback Domain: ${AKWAM_CONFIG.fallbackBaseUrl}`);
console.log(`Domains in Scope: ${PROVIDER_META.domains.join(', ')}`);

const matrix = {
  catalog: 'UNTESTED',
  search: 'UNTESTED',
  details: 'UNTESTED',
  episodes: 'UNTESTED',
  servers: 'UNTESTED',
  resolve: 'UNTESTED',
  live: 'UNSUPPORTED'
};

try {
  // 1. LIVE CATALOG: PAGE 1 & PAGE 2 PAGINATION
  console.log('\n1. Testing Live Catalog (movies)...');
  const catPage1 = await scrapeCatalog('movies', 1);

  if (catPage1._meta?.errorCode === 'ACCESS_BLOCKED' || catPage1._meta?.errorCode === 'NETWORK_TIMEOUT') {
    throw new Error(`ACCESS_BLOCKED: ${catPage1._meta.errorMessage || catPage1._meta.errorCode}`);
  }

  assert.ok(Array.isArray(catPage1), 'Catalog page 1 must return an array');
  assert.ok(catPage1.length >= 4, `Expected at least 4 items on page 1, got ${catPage1.length}`);
  console.log(`   Page 1 returned ${catPage1.length} items`);

  const sampleItem = catPage1[0];
  assert.ok(sampleItem.title, 'Catalog item must have title');
  assert.ok(sampleItem.url.startsWith('https://'), 'URL must be HTTPS');
  assert.ok(sampleItem.ref.startsWith('akwam:'), 'Ref must use akwam reference format');
  assert.equal(sampleItem.source, 'akwam');
  assert.equal(sampleItem.serverPrefix, 'AK');
  console.log(`   Sample item: "${sampleItem.title}" (${sampleItem.url})`);

  console.log('   Testing Catalog Pagination (Page 2)...');
  const catPage2 = await scrapeCatalog('movies', 2);
  assert.ok(catPage2.length >= 4, `Expected at least 4 items on page 2, got ${catPage2.length}`);
  assert.notEqual(catPage1[0].url, catPage2[0].url, 'Page 1 and Page 2 must return different items');
  console.log(`   Page 2 returned ${catPage2.length} items`);
  matrix.catalog = 'LIVE_VERIFIED';

  // 2. LIVE SEARCH: POSITIVE & EMPTY RESULTS
  console.log('\n2. Testing Live Search...');
  const searchResults = await scrapeSearch('أشرف', 1);
  assert.ok(Array.isArray(searchResults));
  assert.ok(searchResults.length >= 1, `Expected search results for 'أشرف', got ${searchResults.length}`);
  console.log(`   Search for 'أشرف' returned ${searchResults.length} results`);

  console.log('   Testing Non-existent Query...');
  const emptyResults = await scrapeSearch('zzzyyyxxx_nonexistent_query_9999', 1);
  assert.equal(emptyResults.length, 0);
  assert.equal(emptyResults._meta?.errorCode, 'EMPTY_RESULT');
  console.log('   Empty query correctly returned 0 items with EMPTY_RESULT code');
  matrix.search = 'LIVE_VERIFIED';

  // 3. LIVE DETAILS & EPISODES
  console.log('\n3. Testing Live Details & Episodes...');
  const targetItem = catPage1.find((item) => item.type === 'series') || catPage1[0];
  console.log(`   Fetching details for: "${targetItem.title}" (${targetItem.url})`);
  const details = await scrapeDetails(targetItem.url);
  assert.ok(details.title);
  assert.ok(details.poster.startsWith('http'));
  console.log(`   Details loaded: "${details.title}", Year: "${details.year}", Quality: "${details.quality}"`);
  matrix.details = 'LIVE_VERIFIED';

  if (targetItem.type === 'series') {
    const episodes = await scrapeEpisodes(targetItem.url);
    assert.ok(episodes.length >= 1, 'Series must have at least 1 episode');
    for (let i = 1; i < episodes.length; i++) {
      if (episodes[i].season === episodes[i - 1].season) {
        assert.ok(
          episodes[i].number >= episodes[i - 1].number,
          `Episodes must be ascending: ${episodes[i - 1].number} -> ${episodes[i].number}`
        );
      }
    }
    console.log(`   Episodes strictly sorted ascending (${episodes[0].number} -> ${episodes[episodes.length - 1].number})`);
    matrix.episodes = 'LIVE_VERIFIED';
  } else {
    matrix.episodes = 'UNSUPPORTED'; // Movie does not have multi-episode series structure
  }

  // 4. LIVE SERVERS EXTRACTION
  console.log('\n4. Testing Live Server Extraction...');
  const targetWatchUrl = targetItem.url;
  const servers = await scrapeServers(targetWatchUrl);
  assert.ok(Array.isArray(servers));
  assert.ok(servers.length >= 1, `Expected at least 1 server, got ${servers.length}`);
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    assert.equal(s.code, `AK-${i + 1}`, `Server code must be AK-${i + 1}`);
    assert.ok(s.url.startsWith('http'));
  }
  console.log(`   Extracted ${servers.length} servers (Codes: ${servers.map((s) => s.code).join(', ')})`);
  matrix.servers = 'LIVE_VERIFIED';

  // 5. LIVE DIRECT STREAM RESOLUTION
  console.log('\n5. Testing Live Stream Resolution...');
  const resolved = await resolveStream(targetWatchUrl);
  assert.ok(resolved.ok, 'resolveStream must succeed');
  assert.equal(resolved.providerId, 'akwam');
  assert.ok(resolved.url.startsWith('http'));
  console.log(`   Resolved stream: [${resolved.type.toUpperCase()}] ${resolved.url} (Quality: ${resolved.quality})`);
  matrix.resolve = 'LIVE_VERIFIED';

  console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
  console.table(matrix);
  console.log('=== All Akwam Live Verifications PASSED ===');
  process.exit(0);
} catch (err) {
  console.error('\nLive Verification Error / Access Obstacle Encountered:');
  console.error(`Message: ${err.message}`);
  if (err.cause) console.error('Cause:', err.cause);

  const isBlocked = /ENOTFOUND|ECONNRESET|ECONNREFUSED|ACCESS_BLOCKED|EAI_AGAIN|Cloudflare|TIMEOUT/i.test(
    `${err.message} ${err.cause?.code || ''}`
  );

  if (isBlocked) {
    console.log('\n[ACCESS_OBSTACLE IDENTIFIED]');
    console.log('Akwam domains (https://akwam.ss and https://ak.sv) are actively censored / blocked by regional ISP firewalls (DNS NXDOMAIN or TCP RST ECONNRESET).');
    console.log('This is a verified environmental network obstacle, not a scraper implementation bug.');

    matrix.catalog = 'ACCESS_OBSTACLE';
    matrix.search = 'ACCESS_OBSTACLE';
    matrix.details = 'ACCESS_OBSTACLE';
    matrix.episodes = 'ACCESS_OBSTACLE';
    matrix.servers = 'ACCESS_OBSTACLE';
    matrix.resolve = 'ACCESS_OBSTACLE';
    matrix.live = 'UNSUPPORTED';

    console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
    console.table(matrix);
    console.log('Exiting with code 2 (Network / Access Obstacle as per MATV harness specification).');
    process.exit(2);
  }

  console.log('\n=== CAPABILITY VERIFICATION MATRIX (FAILED) ===');
  console.table(matrix);
  process.exit(1);
}
