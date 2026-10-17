// scripts/providers/alooy.live.test.mjs
// End-to-end live verification test suite for Alooy TV (علوي تي في, code: AY)
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  ALOOY_CONFIG,
  ALOOY_UA,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/alooy.mjs';

console.log('=== Starting Alooy TV Live Verification Suite ===');
console.log(`Primary Domain: ${ALOOY_CONFIG.baseUrl}`);
console.log(`Landing Mirror: ${ALOOY_CONFIG.mirrorBaseUrl}`);

const matrix = {
  catalog: 'UNTESTED',
  search: 'UNTESTED',
  details: 'UNTESTED',
  episodes: 'UNTESTED',
  servers: 'UNTESTED',
  resolve: 'UNTESTED'
};

try {
  // 1. LIVE CATALOG: PAGE 1 & PAGE 2 PAGINATION
  console.log('\n1. Testing Live Catalog (all / series)...');
  const catPage1 = await scrapeCatalog('all', 1);
  assert.ok(Array.isArray(catPage1), 'Catalog page 1 must return an array');
  assert.ok(catPage1.length >= 10, `Expected at least 10 items on page 1, got ${catPage1.length}`);
  console.log(`   Page 1 returned ${catPage1.length} items`);

  const sample = catPage1[0];
  assert.ok(sample.title, 'Catalog item must have title');
  assert.ok(sample.url.startsWith('https://fa.alooytv16.xyz/watch/'), 'URL must resolve to active domain');
  assert.ok(sample.ref.startsWith('alooy:'), 'Ref must use alooy reference format');
  assert.equal(sample.source, 'alooy');
  assert.equal(sample.serverPrefix, 'AY');
  assert.equal(sample.type, 'series');
  assert.equal(sample.is_series, true);
  console.log(`   Sample item: "${sample.title}" (${sample.url})`);

  console.log('   Testing Catalog Pagination (Page 2)...');
  const catPage2 = await scrapeCatalog('all', 2);
  assert.ok(catPage2.length >= 10, `Expected at least 10 items on page 2, got ${catPage2.length}`);
  assert.notEqual(catPage1[0].url, catPage2[0].url, 'Page 1 and Page 2 must return different items');
  console.log(`   Page 2 returned ${catPage2.length} items (First: "${catPage2[0].title}")`);
  matrix.catalog = 'LIVE_VERIFIED';

  // 2. LIVE SEARCH: POSITIVE & EMPTY RESULTS
  console.log('\n2. Testing Live Search...');
  const searchResults = await scrapeSearch('شباب', 1);
  assert.ok(Array.isArray(searchResults));
  assert.ok(searchResults.length >= 1, `Expected search results for 'شباب', got ${searchResults.length}`);
  console.log(`   Search for 'شباب' returned ${searchResults.length} results (First: "${searchResults[0].title}")`);
  assert.ok(searchResults[0].title.includes('شباب'));
  assert.equal(searchResults[0].source, 'alooy');
  assert.equal(searchResults[0].serverPrefix, 'AY');

  console.log('   Testing Non-existent Query...');
  const emptyResults = await scrapeSearch('zzzyyyxxx_nonexistent_query_9999', 1);
  assert.equal(emptyResults.length, 0);
  assert.equal(emptyResults._meta?.errorCode, 'EMPTY_RESULT');
  console.log('   Empty query correctly returned 0 items with EMPTY_RESULT code');
  matrix.search = 'LIVE_VERIFIED';

  // 3. LIVE SERIES DETAILS & EPISODES
  console.log('\n3. Testing Live Series Details & Episodes...');
  const targetSeries = catPage1.find((item) => item.type === 'series') || catPage1[0];
  console.log(`   Fetching details for: "${targetSeries.title}" (${targetSeries.url})`);
  const details = await scrapeDetails(targetSeries.url);
  assert.ok(details.title);
  assert.ok(details.poster.startsWith('http'));
  assert.equal(details.type, 'series');
  assert.ok(Array.isArray(details.episodes), 'Details must include episodes');
  assert.ok(details.episodes.length >= 1, 'Series must have at least 1 episode');
  console.log(`   Series details loaded with ${details.episodes.length} episodes, Year: "${details.year}"`);
  matrix.details = 'LIVE_VERIFIED';

  console.log('   Testing Standalone Episode List Extraction...');
  const episodes = await scrapeEpisodes(targetSeries.url);
  assert.ok(episodes.length >= 1);
  for (let i = 1; i < episodes.length; i++) {
    assert.ok(
      episodes[i].number >= episodes[i - 1].number,
      `Episodes must be in ascending order: ep ${episodes[i - 1].number} before ${episodes[i].number}`
    );
  }
  console.log(`   Episodes strictly sorted ascending (${episodes[0].number} -> ${episodes[episodes.length - 1].number})`);
  matrix.episodes = 'LIVE_VERIFIED';

  // 4. LIVE SERVERS EXTRACTION
  console.log('\n4. Testing Live Server Extraction...');
  const targetEpisode = episodes[0];
  console.log(`   Extracting servers for episode: "${targetEpisode.title}" (${targetEpisode.url})`);
  const servers = await scrapeServers(targetEpisode.url);
  assert.ok(Array.isArray(servers));
  assert.ok(servers.length >= 1, `Expected at least 1 server, got ${servers.length}`);
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    assert.equal(s.code, `AY-${i + 1}`, `Server code must be AY-${i + 1}`);
    assert.ok(s.url.startsWith('http'));
    assert.ok(['mp4', 'm3u8', 'webm', 'embed'].includes(s.type));
  }
  console.log(`   Extracted ${servers.length} servers (Codes: ${servers.map((s) => s.code).join(', ')})`);
  matrix.servers = 'LIVE_VERIFIED';

  // 5. LIVE DIRECT PLAYBACK REALITY (Range request on MP4 or HLS manifest probe)
  console.log('\n5. Testing Live Playback Reality...');
  const resolved = await resolveStream(targetEpisode.url);
  assert.ok(resolved.ok, 'resolveStream must succeed');
  assert.equal(resolved.providerId, 'alooy');
  assert.ok(resolved.url.startsWith('http'));
  console.log(`   Resolved stream: [${resolved.type.toUpperCase()}] ${resolved.url}`);

  if (resolved.type === 'mp4' || resolved.type === 'webm') {
    console.log('   Probing direct MP4 byte-range request (bytes 0-1023)...');
    const mediaRes = await fetch(resolved.url, {
      method: 'GET',
      headers: {
        'User-Agent': ALOOY_UA,
        Referer: targetEpisode.url,
        Origin: ALOOY_CONFIG.baseUrl,
        Range: 'bytes=0-1023'
      },
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   HTTP Status: ${mediaRes.status}`);
    console.log(`   Content-Type: ${mediaRes.headers.get('content-type')}`);
    console.log(`   Content-Range: ${mediaRes.headers.get('content-range')}`);
    assert.ok(
      mediaRes.status === 206 || mediaRes.status === 200,
      `Expected HTTP 206/200 for media probe, got ${mediaRes.status}`
    );
    const reader = mediaRes.body.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    assert.ok(value && value.byteLength >= 8, 'Must receive media bytes');
    const hexHeader = Buffer.from(value.slice(0, 16)).toString('hex');
    console.log(`   Media first 16 bytes: ${hexHeader}`);
    assert.ok(
      hexHeader.includes('66747970') || hexHeader.includes('1a45dfa3'),
      'Must contain ftyp (MP4) or EBML (WebM) container header'
    );
    console.log('   Verified real video stream bytes & container header!');
  } else if (resolved.type === 'm3u8') {
    console.log('   Probing HLS master manifest...');
    const hlsRes = await fetch(resolved.url, {
      headers: {
        'User-Agent': ALOOY_UA,
        Referer: targetEpisode.url,
        Origin: ALOOY_CONFIG.baseUrl
      },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(hlsRes.status, 200);
    const m3u8Text = await hlsRes.text();
    assert.ok(m3u8Text.includes('#EXTM3U'), 'HLS playlist must include #EXTM3U');
    console.log(`   HLS manifest verified (${m3u8Text.length} bytes, starts with #EXTM3U)`);
  }
  matrix.resolve = 'LIVE_VERIFIED';

  console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
  console.table(matrix);
  console.log('=== All Alooy TV Live Verifications PASSED ===');
  process.exit(0);
} catch (err) {
  console.error('\nLive Verification Error:', err.message);
  if (err.cause) console.error('Cause:', err.cause);
  console.log('\n=== CAPABILITY VERIFICATION MATRIX (PARTIAL) ===');
  console.table(matrix);

  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ACCESS_BLOCKED|Cloudflare/i.test(err.message)) {
    console.log('Exiting with code 2 (Network / Access obstacle)');
    process.exit(2);
  }

  process.exit(1);
}
