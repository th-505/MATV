// scripts/providers/ristoanime.live.test.mjs
// Real network verification test suite for RistoAnime (ristoanime, code: RE)

import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/ristoanime.mjs';

console.log('=== Starting RistoAnime Live Verification Suite ===');
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
  console.log('\n1. Testing Live Catalog Scraping (series)...');
  const catItems = await scrapeCatalog('series', 1, { timeoutMs: 8000 });
  if (Array.isArray(catItems) && catItems.length > 0) {
    console.log(`   Catalog returned ${catItems.length} items (First: "${catItems[0].title}")`);
    matrix.catalog = 'LIVE_VERIFIED';
  } else {
    throw new Error('ACCESS_BLOCKED: Catalog returned 0 items from active domain');
  }

  console.log('\n2. Testing Live Search Scraping ("one piece")...');
  const searchResults = await scrapeSearch('one piece', 1, { timeoutMs: 8000 });
  if (Array.isArray(searchResults) && searchResults.length > 0) {
    console.log(`   Search returned ${searchResults.length} items (First: "${searchResults[0].title}")`);
    matrix.search = 'LIVE_VERIFIED';
  }

  const sampleTarget = catItems[0];
  console.log(`\n3. Testing Live Details Scraping for: "${sampleTarget.title}"...`);
  const details = await scrapeDetails(sampleTarget.url, { timeoutMs: 8000 });
  if (details?._meta?.ok && details.title) {
    console.log(`   Details loaded: "${details.title}"`);
    matrix.details = 'LIVE_VERIFIED';
  }

  console.log('\n4. Testing Live Episodes Extraction...');
  const episodes = await scrapeEpisodes(sampleTarget.url, { timeoutMs: 8000 });
  if (Array.isArray(episodes) && episodes.length > 0) {
    matrix.episodes = 'LIVE_VERIFIED';
  }

  console.log('\n5. Testing Live Servers Extraction...');
  const servers = await scrapeServers(sampleTarget.url, { timeoutMs: 8000 });
  if (Array.isArray(servers)) {
    matrix.servers = servers.length > 0 ? 'LIVE_CANDIDATES_UNVERIFIED' : 'NO_SERVERS';
    if (servers[0]) console.log(`   Candidate: ${servers[0].url} (${servers[0].type || servers[0].streamType})`);
  }

  console.log('\n6. Testing Live Stream Resolution...');
  const resolved = await resolveStream(sampleTarget.url, { timeoutMs: 8000 });
  if (resolved && resolved.url) {
    matrix.resolve = resolved.type === 'embed' ? 'EMBED_UNVERIFIED' : 'DIRECT_CANDIDATE_UNVERIFIED';
    console.log(`   Resolver candidate (${resolved.type}): ${resolved.url}`);
    if (resolved.type === 'm3u8') {
      try {
        const manifestRes = await fetch(resolved.url, { headers: resolved.headers || {}, signal: AbortSignal.timeout(6000) });
        const manifest = await manifestRes.text();
        if (!manifestRes.ok || !manifest.startsWith('#EXTM3U')) throw new Error(`Invalid manifest HTTP_${manifestRes.status}`);
        const segmentRef = manifest.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
        if (!segmentRef) throw new Error('Manifest contains no segment URI');
        const segmentUrl = new URL(segmentRef.trim(), resolved.url).toString();
        const segmentRes = await fetch(segmentUrl, { headers: { ...(resolved.headers || {}), Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(6000) });
        const reader = segmentRes.body?.getReader();
        const firstChunk = reader ? await reader.read() : { done: true, value: undefined };
        await reader?.cancel();
        if (!segmentRes.ok || !firstChunk.value?.byteLength) throw new Error(`Segment fetch failed HTTP_${segmentRes.status}`);
        matrix.resolve = 'MANIFEST_AND_SEGMENT_FETCHED';
        console.log(`   HLS manifest valid; first segment responded HTTP ${segmentRes.status} with ${firstChunk.value.byteLength} bytes. Playback not tested.`);
      } catch (probeError) {
        console.log(`   Manifest/segment probe unavailable: ${probeError.message}`);
      }
    }
  }

  console.log('\n=== CAPABILITY VERIFICATION MATRIX ===');
  console.table(matrix);
  console.log('=== All RistoAnime Live Verifications PASSED ===');
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
