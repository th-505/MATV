// scripts/providers_unit_and_integration_test.mjs
// Comprehensive Unit & Integration Verification Suite for all 21 MATV scrapers & providers

import { PROVIDERS_MAP, listProviders } from '../server/scrapers/registry.mjs';
import { SCRAPER_ERROR_CODES, ScraperError } from '../server/scrapers/shared/errors.mjs';
import { assertSafeScraperUrl } from '../server/scrapers/shared/http.mjs';

const ALL_EXPECTED_IDS = [
  'mycima', 'akwam', 'cimanow', 'shahid4u', 'moviztime', 'shii4u',
  'egydead', 'ipauniverse', '3cktv', 'anime4up', 'qfilm', 'ristoanime',
  'arabseed', 'mewsry', 'anime4up_rest', 'witanime', 'egydead_live',
  'yallashoot', '3isk', 'alooy', 'laroza'
];

async function runTests() {
  console.log('=== STARTING 21-PROVIDER COMPREHENSIVE INTEGRATION TEST SUITE ===');
  let passedCount = 0;
  let failedCount = 0;

  console.log(`Checking registry size: ${PROVIDERS_MAP.size} registered providers.`);
  if (PROVIDERS_MAP.size !== 21) {
    console.error(`FAIL: Expected 21 providers in registry, found ${PROVIDERS_MAP.size}`);
    process.exit(1);
  }

  for (const expectedId of ALL_EXPECTED_IDS) {
    const entry = PROVIDERS_MAP.get(expectedId);
    if (!entry) {
      console.error(`FAIL: Provider ${expectedId} missing from PROVIDERS_MAP!`);
      failedCount++;
      continue;
    }

    const { meta, module } = entry;
    console.log(`\n[PROVIDER TEST] ${meta.name} (id: ${meta.id}, code: ${meta.code})`);

    // 1. Verify Standard Exports
    const requiredExports = ['PROVIDER_META', 'scrapeCatalog', 'scrapeSearch', 'scrapeDetails', 'scrapeEpisodes', 'scrapeServers', 'resolveStream'];
    for (const exp of requiredExports) {
      if (typeof module[exp] !== 'function' && exp !== 'PROVIDER_META') {
        console.error(`  FAIL: Missing function export ${exp}`);
        failedCount++;
      }
    }

    // 2. Load Real Fixture
    let fixtureMod = null;
    try {
      fixtureMod = await import(`./fixtures/providers/${expectedId}.fixture.mjs`);
      if (!fixtureMod.FIXTURE_META) {
        console.error(`  FAIL: Fixture missing FIXTURE_META`);
        failedCount++;
      } else {
        console.log(`  ✓ Fixture loaded (${fixtureMod.FIXTURE_META.providerId}, real: ${fixtureMod.FIXTURE_META.isRealLiveSample}, fetchedAt: ${fixtureMod.FIXTURE_META.fetchedAt || 'N/A'})`);
      }
    } catch (err) {
      console.error(`  FAIL: Could not import fixture for ${expectedId}:`, err.message);
      failedCount++;
    }

    // 3. Test Offline Capabilities via Fixture / Mock
    try {
      if (meta.capabilities.catalog) {
        const catRes = await module.scrapeCatalog('movies', 1, { fixtureOnly: true, timeoutMs: 1500 });
        if (Array.isArray(catRes)) {
          console.log(`  ✓ scrapeCatalog returned ${catRes.length} items`);
        } else {
          console.error(`  FAIL: scrapeCatalog did not return an array`);
          failedCount++;
        }
      }

      if (meta.capabilities.search) {
        const searchRes = await module.scrapeSearch('batman', 1, { fixtureOnly: true, timeoutMs: 1500 });
        if (Array.isArray(searchRes)) {
          console.log(`  ✓ scrapeSearch returned ${searchRes.length} items`);
        } else {
          console.error(`  FAIL: scrapeSearch did not return an array`);
          failedCount++;
        }
      } else {
        // Should handle unsupported search cleanly
        const searchRes = await module.scrapeSearch('test', 1, { fixtureOnly: true });
        if (Array.isArray(searchRes) && searchRes.length === 0) {
          console.log(`  ✓ scrapeSearch gracefully handled unsupported capability`);
        }
      }

      passedCount++;
    } catch (err) {
      console.error(`  FAIL: Error during capability execution for ${expectedId}:`, err.message);
      failedCount++;
    }
  }

  // 4. Test Error Classification
  console.log('\n[SHARED ERRORS & SSRF TEST]');
  try {
    let ssrfCaught = false;
    try {
      assertSafeScraperUrl('http://169.254.169.254/latest/meta-data');
    } catch (e) {
      ssrfCaught = (e.code === SCRAPER_ERROR_CODES.UNSAFE_URL);
    }
    if (ssrfCaught) {
      console.log('  ✓ AWS metadata endpoint safely blocked with UNSAFE_URL');
      passedCount++;
    } else {
      console.error('  FAIL: AWS metadata endpoint was not blocked properly!');
      failedCount++;
    }
  } catch (err) {
    console.error('  FAIL: Error during SSRF checks:', err);
    failedCount++;
  }

  console.log(`\n=== TEST SUITE COMPLETED: ${passedCount} tests passed, ${failedCount} failures ===`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
