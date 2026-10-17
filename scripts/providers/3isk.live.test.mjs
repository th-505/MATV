// scripts/providers/3isk.live.test.mjs
// End-to-end live verification test suite for 3isk provider (قصة عشق الأصلي, code: 3K)
import assert from 'node:assert/strict';
import {
  PROVIDER_META,
  ISK_SITE_CONFIG,
  ISK_UA,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/3isk.mjs';

console.log('=== Starting 3isk Live Verification Suite ===');
console.log(`Primary Domain: ${ISK_SITE_CONFIG.baseUrl}`);
console.log(`Fallback Domain: ${ISK_SITE_CONFIG.fallbackBaseUrl}`);

// 1. LIVE CATALOG: PAGE 1 & PAGE 2 PAGINATION
console.log('\n1. Testing Live Catalog (series_turkish)...');
const catPage1 = await scrapeCatalog('series_turkish', 1);
assert.ok(Array.isArray(catPage1), 'Catalog page 1 must return an array');
assert.ok(catPage1.length >= 10, `Expected at least 10 items on page 1, got ${catPage1.length}`);
console.log(`   Page 1 returned ${catPage1.length} items`);

const sampleItem = catPage1[0];
assert.ok(sampleItem.title, 'Catalog item must have title');
assert.ok(sampleItem.url.startsWith('https://ww4.3ick.club/'), 'URL must resolve to active domain');
assert.ok(sampleItem.ref.startsWith('3isk:'), 'Ref must use 3isk reference format');
assert.equal(sampleItem.source, '3isk');
assert.equal(sampleItem.serverPrefix, '3K');
assert.equal(sampleItem.type, 'series');
assert.equal(sampleItem.is_series, true);
console.log(`   Sample item: "${sampleItem.title}" (${sampleItem.url})`);

console.log('   Testing Catalog Pagination (Page 2)...');
const catPage2 = await scrapeCatalog('series_turkish', 2);
assert.ok(catPage2.length >= 10, `Expected at least 10 items on page 2, got ${catPage2.length}`);
assert.notEqual(catPage1[0].url, catPage2[0].url, 'Page 1 and Page 2 must return different items');
console.log(`   Page 2 returned ${catPage2.length} items`);

// 2. LIVE SEARCH: POSITIVE & EMPTY RESULTS
console.log('\n2. Testing Live Search...');
const searchResults = await scrapeSearch('عثمان', 1);
assert.ok(Array.isArray(searchResults));
assert.ok(searchResults.length >= 1, `Expected search results for 'عثمان', got ${searchResults.length}`);
console.log(`   Search for 'عثمان' returned ${searchResults.length} results`);
assert.ok(searchResults[0].title.includes('عثمان'));

console.log('   Testing Non-existent Query...');
const emptyResults = await scrapeSearch('zzzyyyxxx_nonexistent_query_9999', 1);
assert.equal(emptyResults.length, 0);
assert.equal(emptyResults._meta?.errorCode, 'EMPTY_RESULT');
console.log('   Empty query correctly returned 0 items with EMPTY_RESULT code');

// 3. LIVE SERIES DETAILS & EPISODES
console.log('\n3. Testing Live Series Details & Episodes...');
const seriesTarget = catPage1.find((item) => item.type === 'series') || catPage1[0];
console.log(`   Fetching details for: "${seriesTarget.title}"`);
const details = await scrapeDetails(seriesTarget.url);
assert.ok(details.title);
assert.ok(details.poster.startsWith('http'));
assert.equal(details.type, 'series');
assert.ok(Array.isArray(details.episodes), 'Details must include episodes');
assert.ok(details.episodes.length >= 1, 'Series must have at least 1 episode');
console.log(`   Series details loaded with ${details.episodes.length} episodes, genres: [${details.genres.slice(0, 3).join(', ')}]`);

const episodes = await scrapeEpisodes(seriesTarget.url);
assert.ok(episodes.length >= 1);
// Verify ascending order
for (let i = 1; i < episodes.length; i++) {
  if (episodes[i].season === episodes[i - 1].season) {
    assert.ok(
      episodes[i].number >= episodes[i - 1].number,
      `Episodes must be in ascending order: ep ${episodes[i - 1].number} before ${episodes[i].number}`
    );
  } else {
    assert.ok(episodes[i].season >= episodes[i - 1].season, 'Seasons must be ascending');
  }
}
console.log(`   Episodes strictly sorted ascending (${episodes[0].number} -> ${episodes[episodes.length - 1].number})`);

// 4. LIVE SERVERS EXTRACTION
console.log('\n4. Testing Live Server Extraction...');
const targetEpisode = episodes[0];
console.log(`   Extracting servers for episode: "${targetEpisode.title}" (${targetEpisode.url})`);
const servers = await scrapeServers(targetEpisode.url);
assert.ok(Array.isArray(servers));
assert.ok(servers.length >= 1, `Expected at least 1 server, got ${servers.length}`);
for (let i = 0; i < servers.length; i++) {
  const s = servers[i];
  assert.equal(s.code, `3K-${i + 1}`, `Server code must be 3K-${i + 1}`);
  assert.ok(s.url.startsWith('http'));
  assert.ok(['m3u8', 'mp4', 'embed'].includes(s.type));
}
console.log(`   Extracted ${servers.length} servers (Codes: ${servers.map((s) => s.code).join(', ')})`);

// 5. LIVE DIRECT PLAYBACK REALITY (HLS Manifest & Video TS Segment Fetch)
console.log('\n5. Testing Live Playback Reality (Full HLS Pipeline)...');
const stream = await resolveStream(targetEpisode.url);
assert.equal(stream.ok, true);
assert.equal(stream.providerId, '3isk');
assert.ok(stream.url.startsWith('https://'), 'Stream URL must be HTTPS');
console.log(`   Resolved stream: ${stream.url} (Type: ${stream.type})`);

if (stream.type === 'm3u8') {
  console.log('   Fetching HLS Master Playlist...');
  const masterRes = await fetch(stream.url, {
    headers: stream.headers || { 'User-Agent': ISK_UA }
  });
  assert.equal(masterRes.status, 200, `HLS Master playlist returned HTTP ${masterRes.status}`);
  const masterText = await masterRes.text();
  assert.ok(masterText.includes('#EXTM3U'), 'Master playlist must start with #EXTM3U');
  console.log('   Master playlist verified (#EXTM3U received)');

  // Extract sub-playlist or segment
  const lines = masterText.split('\n').map((l) => l.trim()).filter(Boolean);
  const subPlaylistPath = lines.find((l) => !l.startsWith('#') && (l.includes('.m3u8') || l.includes('http')));

  let segmentUrl = '';
  let subHeaders = stream.headers;

  if (subPlaylistPath) {
    const subUrl = new URL(subPlaylistPath, stream.url).toString();
    console.log(`   Fetching Sub-playlist: ${subUrl}`);
    const subRes = await fetch(subUrl, { headers: subHeaders });
    assert.equal(subRes.status, 200, `Sub-playlist returned HTTP ${subRes.status}`);
    const subText = await subRes.text();
    assert.ok(subText.includes('#EXTM3U'));
    const subLines = subText.split('\n').map((l) => l.trim()).filter(Boolean);
    const segLine = subLines.find((l) => !l.startsWith('#') && (l.includes('.ts') || l.includes('http') || l.includes('.mp4')));
    if (segLine) {
      segmentUrl = new URL(segLine, subUrl).toString();
    }
  } else {
    const segLine = lines.find((l) => !l.startsWith('#') && (l.includes('.ts') || l.includes('http') || l.includes('.mp4')));
    if (segLine) {
      segmentUrl = new URL(segLine, stream.url).toString();
    }
  }

  assert.ok(segmentUrl, 'Failed to locate a media segment in HLS playlist');
  console.log(`   Fetching First Video Segment: ${segmentUrl}`);
  const segRes = await fetch(segmentUrl, { headers: subHeaders });
  assert.equal(segRes.status, 200, `Segment returned HTTP ${segRes.status}`);
  const segBuffer = await segRes.arrayBuffer();
  assert.ok(segBuffer.byteLength > 10_000, `Segment size (${segBuffer.byteLength} bytes) is too small to be real video`);
  console.log(`   Video segment verified (HTTP 200, Size: ${segBuffer.byteLength} bytes, Type: ${segRes.headers.get('content-type') || 'video/MP2T'})`);
}

// 6. LIVE MOVIE CATALOG, DETAILS & STREAM
console.log('\n6. Testing Live Movies (movies_turkish)...');
const movieCatalog = await scrapeCatalog('movies_turkish', 1);
assert.ok(movieCatalog.length >= 5, 'Expected movie catalog to return items');
const movieItem = movieCatalog.find((m) => m.type === 'movie') || movieCatalog[0];
console.log(`   Movie item: "${movieItem.title}" (${movieItem.url})`);
assert.equal(movieItem.type, 'movie');

const movieDetails = await scrapeDetails(movieItem.url);
assert.equal(movieDetails.type, 'movie');
assert.ok(movieDetails.title);
console.log(`   Movie details: "${movieDetails.title}", Year: ${movieDetails.year}`);

const movieServers = await scrapeServers(movieItem.url);
assert.ok(movieServers.length >= 1, 'Movie must have at least 1 server');
console.log(`   Movie extracted ${movieServers.length} servers`);

console.log('\n=== All 6 Live Verification Suites Passed Successfully! ===');
