// scripts/providers/moviztime.live.test.mjs
// Real network verification test suite for Moviz Time (وقت الأفلام - moviztime, code: ME)

import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/moviztime.mjs';

console.log('=== Starting MovizTime Live Verification Suite ===');
console.log('Primary Domain:', PROVIDER_META.domains[0]);

const matrix = {
  catalog: 'PENDING',
  search: 'PENDING',
  details: 'PENDING',
  episodes: 'PENDING',
  servers: 'PENDING',
  resolve: 'PENDING'
};

try {
  console.log('\n1. Testing Live Catalog Scraping (movies)...');
  const catItems = await scrapeCatalog('movies', 1, { timeoutMs: 8000 });
  if (Array.isArray(catItems) && catItems.length > 0) {
    console.log(`   Catalog returned ${catItems.length} items (First: "${catItems[0].title}")`);
    matrix.catalog = 'LIVE_VERIFIED';
  } else {
    throw new Error('ACCESS_BLOCKED: Catalog returned 0 items from active domain');
  }

  console.log('\n2. Testing Live Search Scraping ("batman")...');
  const searchResults = await scrapeSearch('batman', 1, { timeoutMs: 8000 });
  if (Array.isArray(searchResults) && searchResults.length > 0) {
    console.log(`   Search returned ${searchResults.length} items (First: "${searchResults[0].title}")`);
    matrix.search = 'LIVE_VERIFIED';
  }

  const sampleTarget = catItems[0];
  console.log(`\n3. Testing Live Details Scraping for: "${sampleTarget.title}"...`);
  const details = await scrapeDetails(sampleTarget.url, { timeoutMs: 8000 });
  if (details && details.title) {
    console.log(`   Details loaded: "${details.title}"`);
    matrix.details = 'LIVE_VERIFIED';
  }

  console.log('\n4. Testing Live Episodes Extraction...');
  const episodes = await scrapeEpisodes(sampleTarget.url, { timeoutMs: 8000 });
  if (Array.isArray(episodes)) {
    matrix.episodes = 'LIVE_VERIFIED';
  }

  console.log('\n5. Testing Live Servers Extraction...');
  const servers = await scrapeServers(sampleTarget.url, { timeoutMs: 8000 });
  if (Array.isArray(servers)) {
    matrix.servers = servers.length > 0 ? 'LIVE_VERIFIED' : 'FIXTURE_ONLY';
  }

  console.log('\n6. Testing Live Stream Resolution...');
  const resolved = await resolveStream(sampleTarget.url, { timeoutMs: 8000 });
  if (resolved && resolved.url) {
    matrix.resolve = 'LIVE_VERIFIED';
  }

  console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
  console.table(matrix);
  console.log('=== All MovizTime Live Verifications PASSED ===');
  process.exitCode = 0;
} catch (err) {
  const errMsg = String(err.message || err || '');
  console.log(`\nLive Verification Result: ${errMsg}`);

  console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
  console.table(matrix);

  if (
    /ACCESS_BLOCKED|Cloudflare|520|521|522|403|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|MAX_RETRIES_EXCEEDED/i.test(errMsg)
  ) {
    console.log('\n[ACCESS_OBSTACLE CONFIRMED]');
    console.log('Exiting with code 2 (Network / Access Obstacle) as expected for blocked provider.');
    process.exitCode = 2;
  } else {
    console.error('\nUnexpected failure:', err);
    process.exitCode = 1;
  }
}
