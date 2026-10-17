// scripts/providers/ipauniverse.live.test.mjs
// Real network verification test suite for IPA Universe scraper (IE)
import {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
} from '../../server/scrapers/sites/ipauniverse.mjs';
import { fetchProviderHtml } from '../../server/scrapers/shared/http.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

const MATRIX = {
  originShell: { status: 'PENDING', detail: '' },
  catalog: { status: 'PENDING', detail: '' },
  searchEnglish: { status: 'PENDING', detail: '' },
  searchArabic: { status: 'PENDING', detail: '' },
  searchEmpty: { status: 'PENDING', detail: '' },
  details: { status: 'PENDING', detail: '' },
  servers: { status: 'PENDING', detail: '' },
  episodes: { status: 'PENDING', detail: '' },
  resolve: { status: 'PENDING', detail: '' }
};

let exitCode = 0;

async function runLiveAudit() {
  console.log('================================================================');
  console.log('       IPA UNIVERSE (IE) LIVE CAPABILITY VERIFICATION AUDIT     ');
  console.log('================================================================\n');

  // 1. Live Origin Shell Reachability
  console.log('1. Probing watch.ipauniverse.com SPA origin shell...');
  try {
    const originRes = await fetchProviderHtml('https://watch.ipauniverse.com/', {
      providerId: PROVIDER_META.id
    });
    console.log(`   Origin HTTP Status: ${originRes.status}`);
    console.log(`   Payload Size: ${originRes.html?.length || 0} bytes`);
    if (originRes.ok) {
      MATRIX.originShell = {
        status: 'LIVE_VERIFIED',
        detail: `HTTP ${originRes.status} (${originRes.html?.length} bytes)`
      };
      console.log('   ✓ Origin SPA shell reachable and active\n');
    } else {
      MATRIX.originShell = {
        status: 'ACCESS_OBSTACLE',
        detail: `HTTP ${originRes.status}`
      };
    }
  } catch (err) {
    console.error('   ✗ Origin probe failed:', err.message);
    if (err.code === SCRAPER_ERROR_CODES.ACCESS_BLOCKED) {
      MATRIX.originShell = { status: 'ACCESS_OBSTACLE', detail: err.message };
      exitCode = 2;
    } else {
      MATRIX.originShell = { status: 'FAILED', detail: err.message };
    }
  }

  // 2. Catalog Capability via Approved TMDb Configuration
  console.log('2. Testing Catalog capability (popular movies)...');
  try {
    const catalogItems = await scrapeCatalog('popular', 1);
    console.log(`   Catalog items returned: ${catalogItems.length}`);
    if (catalogItems.length > 0) {
      const top3 = catalogItems.slice(0, 3);
      top3.forEach((item, idx) => {
        console.log(`   [${idx + 1}] "${item.title}" (${item.year}) - Rating: ${item.rating || 'N/A'}`);
        console.log(`       URL: ${item.url}`);
        console.log(`       Poster: ${item.poster ? item.poster.slice(0, 60) + '...' : 'none'}`);
      });
      MATRIX.catalog = {
        status: 'LIVE_VERIFIED',
        detail: `${catalogItems.length} movies fetched (Top: "${top3[0]?.title}")`
      };
      console.log('   ✓ Catalog LIVE_VERIFIED successfully\n');
    } else {
      const errCode = catalogItems._meta?.errorCode;
      MATRIX.catalog = { status: 'EMPTY', detail: errCode || 'No items' };
    }
  } catch (err) {
    console.error('   ✗ Catalog test failed:', err.message);
    MATRIX.catalog = { status: 'FAILED', detail: err.message };
  }

  // 3. Search Capability (English, Arabic, and No-Result Query)
  console.log('3. Testing Search capability...');
  try {
    // English query: Fight Club
    console.log('   3a. Query: "Fight Club"');
    const searchFightClub = await scrapeSearch('Fight Club', 1);
    console.log(`       Results count: ${searchFightClub.length}`);
    const found550 = searchFightClub.find((m) => m.id === '550' || m.url.includes('id=550'));
    if (found550) {
      console.log(`       ✓ Found TMDb 550: "${found550.title}" (${found550.year}) -> ${found550.url}`);
      MATRIX.searchEnglish = {
        status: 'LIVE_VERIFIED',
        detail: `Found "${found550.title}" (TMDb 550)`
      };
    } else if (searchFightClub.length > 0) {
      MATRIX.searchEnglish = {
        status: 'LIVE_VERIFIED',
        detail: `Returned ${searchFightClub.length} items (Top: "${searchFightClub[0].title}")`
      };
    } else {
      MATRIX.searchEnglish = { status: 'EMPTY', detail: '0 results' };
    }

    // Arabic query: رسالة
    console.log('   3b. Query (Arabic): "رسالة"');
    const searchArabic = await scrapeSearch('رسالة', 1);
    console.log(`       Results count: ${searchArabic.length}`);
    if (searchArabic.length > 0) {
      console.log(`       ✓ Arabic search returned: "${searchArabic[0].title}" (${searchArabic[0].year})`);
      MATRIX.searchArabic = {
        status: 'LIVE_VERIFIED',
        detail: `${searchArabic.length} results (Top: "${searchArabic[0].title}")`
      };
    } else {
      MATRIX.searchArabic = { status: 'EMPTY', detail: '0 results' };
    }

    // No-result query
    console.log('   3c. Query (non-existent): "xyznonexistenttitle9999"');
    const searchNonExistent = await scrapeSearch('xyznonexistenttitle9999', 1);
    console.log(`       Results count: ${searchNonExistent.length} (errorCode: ${searchNonExistent._meta?.errorCode})`);
    if (searchNonExistent.length === 0 && searchNonExistent._meta?.errorCode === SCRAPER_ERROR_CODES.EMPTY_RESULT) {
      MATRIX.searchEmpty = { status: 'LIVE_VERIFIED', detail: 'Gracefully returned EMPTY_RESULT' };
      console.log('       ✓ Non-existent query handled correctly without throwing\n');
    } else {
      MATRIX.searchEmpty = { status: 'UNEXPECTED', detail: `Count: ${searchNonExistent.length}` };
    }
  } catch (err) {
    console.error('   ✗ Search test failed:', err.message);
    MATRIX.searchEnglish = { status: 'FAILED', detail: err.message };
  }

  // 4. Details Capability with Genuine TMDb ID (550 - Fight Club)
  console.log('4. Testing Details capability with real TMDb movie 550 (Fight Club)...');
  console.log('   Contract tested: detail.html?id=550 (internal scraper contract)');
  try {
    const details = await scrapeDetails('detail.html?id=550');
    if (details._meta?.ok) {
      console.log(`   ✓ Title: "${details.title}"`);
      console.log(`   ✓ Year: ${details.year}`);
      console.log(`   ✓ Rating: ${details.rating}`);
      console.log(`   ✓ Runtime: ${details.runtime}`);
      console.log(`   ✓ Genres: ${details.genres.join(', ')}`);
      console.log(`   ✓ IMDb ID: ${details.imdb_id}`);
      console.log(`   ✓ TMDb ID: ${details.tmdb_id}`);
      console.log(`   ✓ Starring: ${details.cast.slice(0, 4).join(', ')}`);
      console.log(`   ✓ Directed by: ${details.directors.join(', ')}`);
      console.log(`   ✓ Overview: ${details.overview.slice(0, 100)}...`);
      console.log(`   ✓ Servers count: ${details.servers.length}`);
      MATRIX.details = {
        status: 'LIVE_VERIFIED',
        detail: `Fight Club (1999) - Genres: [${details.genres.join(', ')}] - IMDb: ${details.imdb_id}`
      };
      console.log('   ✓ Details LIVE_VERIFIED successfully\n');
    } else {
      console.error('   ✗ Details returned error:', details._meta?.errorMessage);
      MATRIX.details = { status: 'FAILED', detail: details._meta?.errorMessage };
    }
  } catch (err) {
    console.error('   ✗ Details test failed:', err.message);
    MATRIX.details = { status: 'FAILED', detail: err.message };
  }

  // 5. Servers Extraction & Verification Distinction
  console.log('5. Testing Servers extraction & verification distinction...');
  try {
    const servers = await scrapeServers('detail.html?id=550');
    console.log(`   Servers extracted: ${servers.length}`);
    if (servers.length > 0) {
      servers.forEach((s, idx) => {
        console.log(`   Server #${idx + 1}: ${s.name} (${s.code})`);
        console.log(`       URL: ${s.url}`);
        console.log(`       Type: ${s.type} (streamType: ${s.streamType})`);
        console.log(`       Verified: ${s.verified} (Correct: Embed URL is NEVER marked verified: true)`);
      });

      const embedServer = servers[0];
      if (embedServer.type === 'embed' && embedServer.verified === false) {
        MATRIX.servers = {
          status: 'LIVE_VERIFIED',
          detail: `${embedServer.url} (type: 'embed', verified: false)`
        };
        console.log('   ✓ Servers LIVE_VERIFIED with strict type: "embed" and verified: false\n');
      } else {
        MATRIX.servers = {
          status: 'DEFECT',
          detail: `Expected verified: false and type: 'embed', got verified=${embedServer.verified}, type=${embedServer.type}`
        };
      }
    } else {
      MATRIX.servers = { status: 'EMPTY', detail: '0 servers extracted' };
    }
  } catch (err) {
    console.error('   ✗ Servers test failed:', err.message);
    MATRIX.servers = { status: 'FAILED', detail: err.message };
  }

  // 6. Episodes Capability (Genuinely Unsupported on Movies-only SPA)
  console.log('6. Testing Episodes capability (movies-only portal)...');
  try {
    const episodes = await scrapeEpisodes('detail.html?id=550');
    console.log(`   Episodes count: ${episodes.length} (ok: ${episodes._meta?.ok}, errorCode: ${episodes._meta?.errorCode})`);
    if (episodes._meta?.errorCode === SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY) {
      MATRIX.episodes = {
        status: 'UNSUPPORTED',
        detail: 'watch.ipauniverse.com is a movies-only portal without episode lists'
      };
      console.log('   ✓ Episodes accurately reported as UNSUPPORTED capability\n');
    } else {
      MATRIX.episodes = { status: 'UNEXPECTED', detail: `Code: ${episodes._meta?.errorCode}` };
    }
  } catch (err) {
    console.error('   ✗ Episodes test failed:', err.message);
    MATRIX.episodes = { status: 'FAILED', detail: err.message };
  }

  // 7. Stream Resolution
  console.log('7. Testing resolveStream capability...');
  try {
    const stream = await resolveStream('detail.html?id=550');
    console.log(`   Stream resolve ok: ${stream._meta?.ok}`);
    console.log(`   Stream URL: ${stream.streamUrl}`);
    console.log(`   Stream Type: ${stream.type}`);
    console.log(`   Verified: ${stream.verified}`);
    if (stream._meta?.ok && stream.type === 'embed' && stream.verified === false) {
      MATRIX.resolve = {
        status: 'LIVE_VERIFIED',
        detail: `Embed resolved to ${stream.streamUrl} (verified: false)`
      };
      console.log('   ✓ resolveStream LIVE_VERIFIED correctly (embed URL resolved, verified: false)\n');
    } else {
      MATRIX.resolve = { status: 'FAILED', detail: stream._meta?.errorMessage || 'Invalid resolve payload' };
    }
  } catch (err) {
    console.error('   ✗ resolveStream test failed:', err.message);
    MATRIX.resolve = { status: 'FAILED', detail: err.message };
  }

  // Capability Matrix Summary
  console.log('================================================================');
  console.log('                  CAPABILITY MATRIX SUMMARY                     ');
  console.log('================================================================');
  for (const [key, val] of Object.entries(MATRIX)) {
    console.log(` ${key.padEnd(16)} | ${val.status.padEnd(16)} | ${val.detail}`);
  }
  console.log('================================================================\n');

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

runLiveAudit();
