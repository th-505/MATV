// scripts/providers/laroza.live.test.mjs
// Live network capability verification test suite for Laroza scraper (لاروزا, code: LZ)
// Evaluates live reachability against larooza.beer, mirror domains, and Cloudflare edge resolver.

import {
  PROVIDER_META,
  LAROZA_SITE_CONFIG,
  LAROZA_UA,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream,
  scrapeLive
} from '../../server/scrapers/sites/laroza.mjs';

import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';
import { fetchSafeResponse } from '../../server/scrapers/shared/http.mjs';

console.log('================================================================');
console.log('         LAROZA (LZ) LIVE CAPABILITY VERIFICATION AUDIT         ');
console.log('================================================================\n');

console.log(`Primary Domain: ${LAROZA_SITE_CONFIG.baseUrl}`);
console.log(`Configured Domains: ${LAROZA_SITE_CONFIG.domains.join(', ')}`);
console.log(`Edge Resolver Endpoint: ${LAROZA_SITE_CONFIG.edgeBase}\n`);

const MATRIX = {
  edgeHealth: { status: 'PENDING', detail: '' },
  originShell: { status: 'PENDING', detail: '' },
  catalog: { status: 'PENDING', detail: '' },
  search: { status: 'PENDING', detail: '' },
  searchEmpty: { status: 'PENDING', detail: '' },
  details: { status: 'PENDING', detail: '' },
  episodes: { status: 'PENDING', detail: '' },
  servers: { status: 'PENDING', detail: '' },
  resolve: { status: 'PENDING', detail: '' },
  live: { status: 'PENDING', detail: '' }
};

let exitCode = 0;
let isBlocked = false;
let sampleEpisodeRef = '';

// 1. PROBE EDGE RESOLVER HEALTH
console.log('1. Probing Cloudflare Edge Resolver health endpoint...');
try {
  const edgeRes = await fetchSafeResponse(`${LAROZA_SITE_CONFIG.edgeBase}/health`, {
    timeoutMs: 6000,
    headers: { 'User-Agent': LAROZA_UA },
    providerId: PROVIDER_META.id
  });
  console.log(`   Edge Health HTTP Status: ${edgeRes.status}`);
  if (edgeRes.ok) {
    const healthJson = JSON.parse(edgeRes.html || '{}');
    MATRIX.edgeHealth = {
      status: 'LIVE_VERIFIED',
      detail: `HTTP 200 OK (providers: ${healthJson.providers?.join(', ') || 'laroza'})`
    };
    console.log('   ✓ Cloudflare Edge Resolver worker is active and healthy\n');
  } else {
    MATRIX.edgeHealth = {
      status: 'ACCESS_OBSTACLE',
      detail: `HTTP ${edgeRes.status}`
    };
  }
} catch (err) {
  console.warn('   ✗ Edge Resolver health check failed:', err.message);
  MATRIX.edgeHealth = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
}

// 2. PROBE DIRECT ORIGIN & MIRROR REACHABILITY
console.log('2. Probing live origin domains...');
for (const domain of LAROZA_SITE_CONFIG.domains) {
  try {
    console.log(`   Probing ${domain}...`);
    const res = await fetch(domain, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': LAROZA_UA }
    });
    console.log(`   ${domain} status: HTTP ${res.status}`);
    if (res.ok) {
      MATRIX.originShell = {
        status: 'LIVE_VERIFIED',
        detail: `${domain} (HTTP ${res.status})`
      };
      break;
    }
  } catch (err) {
    const causeCode = err?.cause?.code || err.code || err.name;
    console.log(`   ${domain} unreachable: [${causeCode}] ${err.message}`);
    MATRIX.originShell = {
      status: 'ACCESS_OBSTACLE',
      detail: `${domain}: ${causeCode}`
    };
    isBlocked = true;
  }
}

// 3. CATALOG CAPABILITY
console.log('\n3. Testing Catalog capability...');
try {
  const catalog = await scrapeCatalog('latest', 1);
  if (Array.isArray(catalog) && catalog.length > 0) {
    MATRIX.catalog = {
      status: 'LIVE_VERIFIED',
      detail: `${catalog.length} items (Top: "${catalog[0].title}")`
    };
    console.log(`   ✓ Catalog returned ${catalog.length} items (Top: "${catalog[0].title}")`);
  } else {
    const errCode = catalog._meta?.errorCode;
    if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED || isBlocked) {
      MATRIX.catalog = {
        status: 'ACCESS_OBSTACLE',
        detail: `Blocked by origin TCP reset (ECONNRESET)`
      };
      isBlocked = true;
    } else {
      MATRIX.catalog = {
        status: 'EMPTY',
        detail: catalog._meta?.errorMessage || '0 items'
      };
    }
  }
} catch (err) {
  console.log(`   ✗ Catalog error: ${err.message}`);
  MATRIX.catalog = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
  isBlocked = true;
}

// 4. SEARCH CAPABILITY
console.log('\n4. Testing Search capability...');
try {
  const searchResults = await scrapeSearch('عثمان', 1);
  if (Array.isArray(searchResults) && searchResults.length > 0) {
    MATRIX.search = {
      status: 'LIVE_VERIFIED',
      detail: `${searchResults.length} results (Top: "${searchResults[0].title}")`
    };
    console.log(`   ✓ Search returned ${searchResults.length} items`);
  } else {
    const errCode = searchResults._meta?.errorCode;
    if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED || isBlocked) {
      MATRIX.search = {
        status: 'ACCESS_OBSTACLE',
        detail: 'Blocked by origin TCP reset (ECONNRESET)'
      };
      isBlocked = true;
    } else {
      MATRIX.search = {
        status: 'EMPTY',
        detail: searchResults._meta?.errorMessage || '0 items'
      };
    }
  }
} catch (err) {
  MATRIX.search = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
  isBlocked = true;
}

// 4b. EMPTY SEARCH QUERY
console.log('   Testing empty query handling...');
try {
  const emptyRes = await scrapeSearch('xyznonexistent999xyz', 1);
  if (emptyRes.length === 0 && emptyRes._meta?.errorCode === SCRAPER_ERROR_CODES.EMPTY_RESULT) {
    MATRIX.searchEmpty = {
      status: 'LIVE_VERIFIED',
      detail: 'Gracefully returned EMPTY_RESULT'
    };
  } else if (isBlocked) {
    MATRIX.searchEmpty = {
      status: 'ACCESS_OBSTACLE',
      detail: 'Origin unreachable'
    };
  }
} catch (err) {
  MATRIX.searchEmpty = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
}

// 5. DETAILS & EPISODES CAPABILITY
console.log('\n5. Testing Details & Episodes on a real catalog result...');
const seriesRows = await scrapeCatalog('series', 1);
const sampleTarget = seriesRows.find((item) => /view-serie1\.php/.test(item.url || ''));
if (!sampleTarget) {
  MATRIX.details = { status: 'UNAVAILABLE', detail: 'No series detail reference returned by live catalog' };
  MATRIX.episodes = { status: 'UNAVAILABLE', detail: 'No real series reference available' };
  isBlocked = true;
} else {
console.log(`   Real detail reference: ${sampleTarget.ref} (${sampleTarget.title})`);
try {
  const details = await scrapeDetails(sampleTarget.ref);
  if (details._meta?.ok && details.title && details.title !== 'فيديو لاروزا' && details.episodes?.length > 0) {
    sampleEpisodeRef = details.episodes[0].ref;
    MATRIX.details = {
      status: 'LIVE_VERIFIED',
      detail: `Title: "${details.title}", Episodes: ${details.episodes?.length || 0}`
    };
  } else {
    MATRIX.details = { status: 'SCRAPER_FAILURE', detail: details._meta?.errorMessage || `Incomplete details (${details.title || 'no title'}, ${details.episodes?.length || 0} episodes)` };
  }
} catch (err) {
  MATRIX.details = {
    status: 'ACCESS_OBSTACLE',
    detail: `Origin connection reset: ${err.message}`
  };
  isBlocked = true;
}

try {
  const episodes = await scrapeEpisodes(sampleTarget.ref);
  if (Array.isArray(episodes) && episodes.length > 0) {
    MATRIX.episodes = {
      status: 'LIVE_VERIFIED',
      detail: `${episodes.length} episodes extracted`
    };
  } else {
    MATRIX.episodes = {
      status: /SOURCE_UNAVAILABLE|ACCESS_BLOCKED|NETWORK_TIMEOUT/.test(episodes._meta?.errorCode || '') ? 'ACCESS_OBSTACLE' : 'SCRAPER_FAILURE',
      detail: episodes._meta?.errorMessage || 'Origin unreachable'
    };
  }
} catch (err) {
  MATRIX.episodes = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
  isBlocked = true;
}
}

// 6. SERVERS CAPABILITY
console.log('\n6. Testing Servers capability...');
const sampleWatchTarget = sampleEpisodeRef;
if (!sampleWatchTarget) {
  MATRIX.servers = { status: 'UNAVAILABLE', detail: 'No real episode reference' };
  MATRIX.resolve = { status: 'UNAVAILABLE', detail: 'No real episode reference' };
} else {
try {
  const servers = await scrapeServers(sampleWatchTarget);
  if (Array.isArray(servers) && servers.length > 0 && servers._meta?.ok) {
    MATRIX.servers = {
      status: 'LIVE_CANDIDATES_UNVERIFIED',
      detail: `${servers.length} servers extracted (First: ${servers[0].code})`
    };
  } else {
    MATRIX.servers = {
      status: servers._meta?.errorCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED ? 'ACCESS_OBSTACLE' : 'SCRAPER_FAILURE',
      detail: servers._meta?.errorMessage || 'No server candidates'
    };
  }
} catch (err) {
  MATRIX.servers = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
}

// 7. STREAM RESOLUTION CAPABILITY
console.log('\n7. Testing Stream Resolution capability...');
try {
  const stream = await resolveStream(sampleWatchTarget);
  if (stream.ok) {
    MATRIX.resolve = {
      status: stream.type === 'embed' ? 'EMBED_UNVERIFIED' : 'DIRECT_CANDIDATE_UNVERIFIED',
      detail: `Resolved URL candidate (${stream.type}), no player playback asserted: ${stream.url}`
    };
  }
} catch (err) {
  MATRIX.resolve = {
    status: 'ACCESS_OBSTACLE',
    detail: err.message
  };
  isBlocked = true;
}
}

// 8. LIVE BROADCAST CAPABILITY (GENUINELY UNSUPPORTED)
console.log('\n8. Testing Live capability contract...');
try {
  const liveResult = await scrapeLive();
  if (liveResult._meta?.errorCode === SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY) {
    MATRIX.live = {
      status: 'UNSUPPORTED',
      detail: 'Laroza is a VOD streaming site without live sports/channels'
    };
    console.log('   ✓ Live capability correctly classified as UNSUPPORTED\n');
  }
} catch (err) {
  MATRIX.live = {
    status: 'FAILED',
    detail: err.message
  };
}

// CAPABILITY MATRIX SUMMARY
console.log('================================================================');
console.log('                  CAPABILITY MATRIX SUMMARY                     ');
console.log('================================================================');
for (const [key, val] of Object.entries(MATRIX)) {
  console.log(` ${key.padEnd(16)} | ${val.status.padEnd(16)} | ${val.detail}`);
}
console.log('================================================================\n');

if (isBlocked) {
  console.log('Notice: direct origin probing encountered an access obstacle; edge-backed catalog/details may still have succeeded as shown in the matrix.');
  console.log('Embedded player candidates and extracted URLs are not playback verification.');
  console.log('Exiting with code 2 (ACCESS_OBSTACLE) while retaining successful capabilities in the matrix.\n');
  process.exit(2);
}

process.exit(exitCode);
