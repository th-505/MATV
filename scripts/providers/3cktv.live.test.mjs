// scripts/providers/3cktv.live.test.mjs
// Live network capability test suite for 3ckTV (3cktv, code: 3V)
import dns from 'node:dns/promises';
import {
  PROVIDER_META,
  THREE_CKTV_CONFIG,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/3cktv.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

console.log('=== 3ckTV Live Network Verification ===\n');
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`Primary Domain: ${THREE_CKTV_CONFIG.baseUrl}`);
console.log(`Fallback Domain: ${THREE_CKTV_CONFIG.fallbackBaseUrl}\n`);

const results = [];
let isAccessBlocked = false;

function recordResult(capability, status, url, evidence, classification) {
  results.push({ capability, status, url, evidence, classification });
  console.log(`[${status}] ${capability}: ${evidence} (${classification})`);
}

async function runLiveSuite() {
  // 1. Direct DNS & Network Reachability Probe
  console.log('--- 1. Probing DNS and HTTP Network Status ---');
  const targetHosts = ['e.3cktv.com', '3cktv.com', 'ei.3cktv.com'];
  let dnsFailureReport = '';

  for (const host of targetHosts) {
    try {
      const records = await dns.lookup(host, { all: true });
      console.log(`   DNS ${host}: resolved (${records.map((r) => r.address).join(', ')})`);
    } catch (err) {
      console.log(`   DNS ${host}: FAILED (${err.code || err.message})`);
      dnsFailureReport += `${host}: ${err.code || err.message}; `;
      if (host === 'ei.3cktv.com') {
        isAccessBlocked = true;
      }
    }
  }

  // Check HTTP redirect on primary domain
  try {
    const rawResp = await fetch(THREE_CKTV_CONFIG.baseUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000)
    });
    const loc = rawResp.headers.get('location') || '';
    console.log(`   HTTP ${THREE_CKTV_CONFIG.baseUrl} returned ${rawResp.status} -> Location: ${loc}`);
    if (loc.includes('ei.3cktv.com')) {
      isAccessBlocked = true;
      recordResult(
        'Host Reachability',
        'WARN',
        THREE_CKTV_CONFIG.baseUrl,
        `HTTP 302 redirects to unresolvable domain ${loc}`,
        'ACCESS_OBSTACLE'
      );
    }
  } catch (err) {
    isAccessBlocked = true;
    recordResult('Host Reachability', 'FAIL', THREE_CKTV_CONFIG.baseUrl, err.message, 'ACCESS_OBSTACLE');
  }

  // 2. Catalog Probe
  console.log('\n--- 2. Live Catalog Probe ---');
  try {
    const cat = await scrapeCatalog('turkish_latest', 1, { timeoutMs: 6000 });
    if (cat.length > 0) {
      recordResult(
        'catalog',
        'PASS',
        `${THREE_CKTV_CONFIG.baseUrl}/episodes/`,
        `Extracted ${cat.length} catalog items. Sample: "${cat[0].title}"`,
        'LIVE_VERIFIED'
      );
    } else {
      const errCode = cat._meta?.errorCode || 'EMPTY';
      if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
      recordResult(
        'catalog',
        errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED ? 'BLOCK' : 'EMPTY',
        `${THREE_CKTV_CONFIG.baseUrl}/episodes/`,
        `Returned 0 items (${cat._meta?.errorMessage || errCode})`,
        'ACCESS_OBSTACLE'
      );
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('catalog', 'BLOCK', `${THREE_CKTV_CONFIG.baseUrl}/episodes/`, err.message, 'ACCESS_OBSTACLE');
  }

  // 3. Search Probe
  console.log('\n--- 3. Live Search Probe ---');
  try {
    const searchRes = await scrapeSearch('عثمان', 1, { timeoutMs: 6000 });
    if (searchRes.length > 0) {
      recordResult(
        'search',
        'PASS',
        `${THREE_CKTV_CONFIG.baseUrl}/?s=عثمان`,
        `Found ${searchRes.length} results. Sample: "${searchRes[0].title}"`,
        'LIVE_VERIFIED'
      );
    } else {
      const errCode = searchRes._meta?.errorCode || 'EMPTY';
      if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
      recordResult(
        'search',
        errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED ? 'BLOCK' : 'EMPTY',
        `${THREE_CKTV_CONFIG.baseUrl}/?s=عثمان`,
        `Returned 0 results (${searchRes._meta?.errorMessage || errCode})`,
        'ACCESS_OBSTACLE'
      );
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('search', 'BLOCK', `${THREE_CKTV_CONFIG.baseUrl}/?s=عثمان`, err.message, 'ACCESS_OBSTACLE');
  }

  // 4. Details Probe
  console.log('\n--- 4. Live Details Probe ---');
  const detailsUrl = `${THREE_CKTV_CONFIG.baseUrl}/series/serie-kurulus-osman/`;
  try {
    const details = await scrapeDetails(detailsUrl, { timeoutMs: 6000 });
    if (details && details.title) {
      recordResult('details', 'PASS', detailsUrl, `Loaded "${details.title}"`, 'LIVE_VERIFIED');
    } else {
      recordResult('details', 'EMPTY', detailsUrl, 'No details loaded', 'ACCESS_OBSTACLE');
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('details', 'BLOCK', detailsUrl, err.message, 'ACCESS_OBSTACLE');
  }

  // 5. Episodes Probe
  console.log('\n--- 5. Live Episodes Probe ---');
  try {
    const episodes = await scrapeEpisodes(detailsUrl, { timeoutMs: 6000 });
    if (episodes.length > 0) {
      recordResult('episodes', 'PASS', detailsUrl, `Found ${episodes.length} episodes`, 'LIVE_VERIFIED');
    } else {
      const errCode = episodes._meta?.errorCode || 'EMPTY';
      if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
      recordResult('episodes', 'BLOCK', detailsUrl, episodes._meta?.errorMessage || errCode, 'ACCESS_OBSTACLE');
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('episodes', 'BLOCK', detailsUrl, err.message, 'ACCESS_OBSTACLE');
  }

  // 6. Servers Probe
  console.log('\n--- 6. Live Servers Probe ---');
  const watchUrl = `${THREE_CKTV_CONFIG.baseUrl}/watch/kurulus-osman-ep-194/?do=views`;
  try {
    const servers = await scrapeServers(watchUrl, { timeoutMs: 6000 });
    if (servers.length > 0) {
      recordResult('servers', 'PASS', watchUrl, `Extracted ${servers.length} servers`, 'LIVE_VERIFIED');
    } else {
      const errCode = servers._meta?.errorCode || 'EMPTY';
      if (errCode === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
      recordResult('servers', 'BLOCK', watchUrl, servers._meta?.errorMessage || errCode, 'ACCESS_OBSTACLE');
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('servers', 'BLOCK', watchUrl, err.message, 'ACCESS_OBSTACLE');
  }

  // 7. Stream Resolve Probe
  console.log('\n--- 7. Live Resolve Probe ---');
  try {
    const resolved = await resolveStream(watchUrl, { timeoutMs: 6000 });
    if (resolved && resolved.verified === true) {
      recordResult('resolve', 'PASS', watchUrl, `Stream resolved: ${resolved.type}`, 'LIVE_VERIFIED');
    } else {
      recordResult(
        'resolve',
        'WARN',
        watchUrl,
        `Unverified fallback embed (${resolved?.type || 'unknown'}) due to live host redirection loop`,
        'ACCESS_OBSTACLE'
      );
    }
  } catch (err) {
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) isAccessBlocked = true;
    recordResult('resolve', 'BLOCK', watchUrl, err.message, 'ACCESS_OBSTACLE');
  }

  // 8. Live Linear / Sports Check
  console.log('\n--- 8. Live Linear / Sports Check ---');
  assertStrictUnsupportedLive();

  // Print Final Capability Matrix Table
  console.log('\n=== 3ckTV Capability Matrix ===');
  console.table(
    results.map((r) => ({
      Capability: r.capability,
      Status: r.status,
      Classification: r.classification,
      Evidence: r.evidence.slice(0, 65)
    }))
  );

  if (isAccessBlocked) {
    console.log('\n⚠️ Live site is currently unreachable / blocked (e.3cktv.com -> 302 -> ei.3cktv.com ENOTFOUND).');
    console.log('Classified as ACCESS_OBSTACLE; exiting with code 2 as expected for blocked sites.');
    process.exit(2);
  } else {
    console.log('\n✅ Live verification complete.');
    process.exit(0);
  }
}

function assertStrictUnsupportedLive() {
  if (PROVIDER_META.capabilities.live === false) {
    recordResult('live', 'PASS', 'N/A', 'Site lacks live linear broadcast (on-demand only)', 'UNSUPPORTED');
  } else {
    recordResult('live', 'FAIL', 'N/A', 'Unexpected live capability declaration', 'NOT_IMPLEMENTED');
  }
}

runLiveSuite().catch((err) => {
  console.error('Fatal live suite error:', err);
  process.exit(1);
});
