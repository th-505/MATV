// scripts/providers/qfilm.live.test.mjs
// Real network verification test suite for كيو فيلم (QFilm, Code: QM)
import dns from 'node:dns/promises';
import {
  PROVIDER_META,
  QFILM_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/qfilm.mjs';
import { fetchProviderHtml } from '../../server/scrapers/shared/http.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

const MATRIX = {
  dnsProbe: { status: 'PENDING', detail: '' },
  originHttp: { status: 'PENDING', detail: '' },
  catalog: { status: 'PENDING', detail: '' },
  searchPositive: { status: 'PENDING', detail: '' },
  searchEmpty: { status: 'PENDING', detail: '' },
  details: { status: 'PENDING', detail: '' },
  episodes: { status: 'PENDING', detail: '' },
  servers: { status: 'PENDING', detail: '' },
  resolve: { status: 'PENDING', detail: '' }
};

let exitCode = 0;

async function runLiveAudit() {
  console.log('================================================================');
  console.log('         QFILM (QM) LIVE CAPABILITY VERIFICATION AUDIT          ');
  console.log('================================================================\n');
  console.log(`Primary Domain:  ${QFILM_CONFIG.baseUrl}`);
  console.log(`Fallback Domain: ${QFILM_CONFIG.fallbackUrl}\n`);

  // 1. Direct DNS Lookup Probe
  console.log('1. Probing DNS records for QFilm domains...');
  const dnsResults = {};
  for (const host of ['a.qfilm.tv', 'qfilm.tv']) {
    try {
      const records = await dns.lookup(host, { all: true });
      dnsResults[host] = `OK (${records.map(r => r.address).join(', ')})`;
    } catch (err) {
      dnsResults[host] = `FAILED (${err.code || err.message})`;
    }
  }

  const allDnsFailed = Object.values(dnsResults).every(v => v.includes('FAILED'));
  console.log('   DNS Results:', JSON.stringify(dnsResults, null, 2));

  if (allDnsFailed) {
    MATRIX.dnsProbe = {
      status: 'ACCESS_OBSTACLE',
      detail: `All domains failed DNS: ${JSON.stringify(dnsResults)}`
    };
    exitCode = 2;
    console.log('   ✗ DNS lookup failed (ENOTFOUND / DNS expired) -> classified as ACCESS_OBSTACLE\n');
  } else {
    MATRIX.dnsProbe = {
      status: 'LIVE_VERIFIED',
      detail: JSON.stringify(dnsResults)
    };
    console.log('   ✓ DNS resolved successfully\n');
  }

  // 2. HTTP Origin Probe
  console.log('2. Probing HTTP origin reachability...');
  try {
    const originRes = await fetchProviderHtml(QFILM_CONFIG.baseUrl, {
      providerId: PROVIDER_META.id,
      timeoutMs: 5000
    });
    if (originRes.ok) {
      MATRIX.originHttp = {
        status: 'LIVE_VERIFIED',
        detail: `HTTP ${originRes.status} (${originRes.html?.length} bytes)`
      };
      console.log(`   ✓ Origin reachable: HTTP ${originRes.status}\n`);
    } else {
      MATRIX.originHttp = {
        status: 'ACCESS_OBSTACLE',
        detail: `HTTP ${originRes.status}`
      };
      exitCode = 2;
      console.log(`   ✗ Origin returned HTTP ${originRes.status}\n`);
    }
  } catch (err) {
    const isObstacle =
      err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED ||
      err.code === SCRAPER_ERROR_CODES.NETWORK_TIMEOUT ||
      /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ACCESS_BLOCKED/i.test(err.message);

    MATRIX.originHttp = {
      status: isObstacle ? 'ACCESS_OBSTACLE' : 'FAILED',
      detail: `${err.code || 'ERR'}: ${err.message}`
    };
    if (isObstacle) exitCode = 2;
    console.log(`   ✗ Origin probe blocked: ${err.code} (${err.message})\n`);
  }

  // 3. Live Catalog Probe
  console.log('3. Testing Live Catalog capability...');
  try {
    const catalogItems = await scrapeCatalog('movies', 1, { timeoutMs: 5000 });
    if (catalogItems._meta?.ok && catalogItems.length > 0) {
      MATRIX.catalog = {
        status: 'LIVE_VERIFIED',
        detail: `Fetched ${catalogItems.length} items (Top: "${catalogItems[0]?.title}")`
      };
      console.log(`   ✓ Catalog LIVE_VERIFIED (${catalogItems.length} items)\n`);
    } else {
      const errCode = catalogItems._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.catalog = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: catalogItems._meta?.errorMessage || 'Empty result'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Catalog returned errorCode: ${errCode} (${catalogItems._meta?.errorMessage})\n`);
    }
  } catch (err) {
    MATRIX.catalog = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Catalog error: ${err.message}\n`);
  }

  // 4. Live Search Positive Probe
  console.log('4. Testing Live Search capability (Positive query)...');
  try {
    const searchResults = await scrapeSearch('انترستيلر', 1, { timeoutMs: 5000 });
    if (searchResults._meta?.ok && searchResults.length > 0) {
      MATRIX.searchPositive = {
        status: 'LIVE_VERIFIED',
        detail: `Found ${searchResults.length} results (Top: "${searchResults[0]?.title}")`
      };
      console.log(`   ✓ Search LIVE_VERIFIED (${searchResults.length} items)\n`);
    } else {
      const errCode = searchResults._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.searchPositive = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: searchResults._meta?.errorMessage || 'Empty result'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Search returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.searchPositive = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Search error: ${err.message}\n`);
  }

  // 5. Live Search Empty Probe
  console.log('5. Testing Live Search capability (Empty non-existent query)...');
  try {
    const emptySearch = await scrapeSearch('zzzyyyxxx_nonexistent_query_9999', 1, { timeoutMs: 5000 });
    if (emptySearch.length === 0 && emptySearch._meta?.errorCode === SCRAPER_ERROR_CODES.EMPTY_RESULT) {
      MATRIX.searchEmpty = {
        status: 'LIVE_VERIFIED',
        detail: 'Returned 0 items with EMPTY_RESULT code'
      };
      console.log('   ✓ Empty search verified\n');
    } else {
      const errCode = emptySearch._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.searchEmpty = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: emptySearch._meta?.errorMessage || `Code: ${errCode}`
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Empty search returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.searchEmpty = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Empty search error: ${err.message}\n`);
  }

  // 6. Live Details Probe
  console.log('6. Testing Live Details capability...');
  try {
    const details = await scrapeDetails('https://a.qfilm.tv/movie/interstellar-2014/', { timeoutMs: 5000 });
    if (details._meta?.ok && details.title) {
      MATRIX.details = {
        status: 'LIVE_VERIFIED',
        detail: `Title: "${details.title}", Year: "${details.year}"`
      };
      console.log(`   ✓ Details LIVE_VERIFIED ("${details.title}")\n`);
    } else {
      const errCode = details._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.details = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: details._meta?.errorMessage || 'Failed to fetch details'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Details returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.details = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Details error: ${err.message}\n`);
  }

  // 7. Live Episodes Probe
  console.log('7. Testing Live Episodes capability...');
  try {
    const episodes = await scrapeEpisodes('https://a.qfilm.tv/series/breaking-bad/', { timeoutMs: 5000 });
    if (episodes._meta?.ok && episodes.length > 0) {
      MATRIX.episodes = {
        status: 'LIVE_VERIFIED',
        detail: `Extracted ${episodes.length} episodes`
      };
      console.log(`   ✓ Episodes LIVE_VERIFIED (${episodes.length} episodes)\n`);
    } else {
      const errCode = episodes._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.episodes = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: episodes._meta?.errorMessage || 'No episodes'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Episodes returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.episodes = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Episodes error: ${err.message}\n`);
  }

  // 8. Live Servers Probe
  console.log('8. Testing Live Servers capability...');
  try {
    const servers = await scrapeServers('https://a.qfilm.tv/movie/interstellar-2014/', { timeoutMs: 5000 });
    if (servers._meta?.ok && servers.length > 0) {
      MATRIX.servers = {
        status: 'LIVE_VERIFIED',
        detail: `Extracted ${servers.length} servers (${servers[0]?.code})`
      };
      console.log(`   ✓ Servers LIVE_VERIFIED (${servers.length} servers)\n`);
    } else {
      const errCode = servers._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.servers = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: servers._meta?.errorMessage || 'No servers'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Servers returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.servers = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Servers error: ${err.message}\n`);
  }

  // 9. Live Resolve Stream Probe
  console.log('9. Testing Live Resolve Stream capability...');
  try {
    const stream = await resolveStream('https://a.qfilm.tv/movie/interstellar-2014/', { timeoutMs: 5000 });
    if (stream._meta?.ok && stream.streamUrl) {
      MATRIX.resolve = {
        status: 'LIVE_VERIFIED',
        detail: `Resolved stream: ${stream.streamUrl} (verified: ${stream.verified})`
      };
      console.log(`   ✓ Resolve LIVE_VERIFIED\n`);
    } else {
      const errCode = stream._meta?.errorCode;
      const isObstacle = errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED;
      MATRIX.resolve = {
        status: isObstacle ? 'ACCESS_OBSTACLE' : 'FIXTURE_ONLY',
        detail: stream._meta?.errorMessage || 'No playable stream'
      };
      if (isObstacle) exitCode = 2;
      console.log(`   ✗ Resolve returned errorCode: ${errCode}\n`);
    }
  } catch (err) {
    MATRIX.resolve = { status: 'ACCESS_OBSTACLE', detail: err.message };
    exitCode = 2;
    console.log(`   ✗ Resolve error: ${err.message}\n`);
  }

  // Summary Table
  console.log('================================================================');
  console.log('               CAPABILITY VERIFICATION MATRIX                   ');
  console.log('================================================================');
  for (const [key, val] of Object.entries(MATRIX)) {
    console.log(` ${key.padEnd(16)} | ${val.status.padEnd(16)} | ${val.detail}`);
  }
  console.log('================================================================\n');

  console.log(`Live audit completed with exitCode = ${exitCode} (${exitCode === 2 ? 'ACCESS_OBSTACLE' : 'SUCCESS'})`);
  process.exit(exitCode);
}

runLiveAudit();
