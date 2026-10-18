import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  encodeProviderServerName,
  generateCloudFallbackServers,
  classifyLatencyTier,
  deduplicateAndMergeCatalog,
  normalizeEpisodesList,
  formatRuntimeArabic
} from '../web/core/ma-nexus.js';

assert.deepEqual(generateCloudFallbackServers('42',false),[]);

// 1. Server code encryption contract (never expose raw scraper names)
assert.equal(encodeProviderServerName('akwam', 1), 'AK-1');
assert.equal(encodeProviderServerName('alooy', 2), 'AY-2');
assert.equal(encodeProviderServerName('mycima', 1), 'MA-1');
assert.equal(encodeProviderServerName('cimanow', 1), 'CW-1');
assert.equal(encodeProviderServerName('arabseed', 1), 'AD-1');
assert.equal(encodeProviderServerName('egydead', 1), 'ED-1');
assert.equal(encodeProviderServerName('https://w1.shahid4u.net/watch', 3), 'SU-3');

// 2. Latency tier classification contract
assert.equal(classifyLatencyTier(110, true).emoji, '🟢');
assert.match(classifyLatencyTier(110, true).label, /110ms ⚡/);
assert.equal(classifyLatencyTier(250, true).emoji, '🟢');
assert.equal(classifyLatencyTier(480, true).emoji, '🟡');
assert.equal(classifyLatencyTier(850, true).emoji, '🟠');
assert.equal(classifyLatencyTier(9999, false).emoji, '🔴');

// 3. Composite work deduplication (Title + Year)
const merged = deduplicateAndMergeCatalog([
  { id: 'mycima:1', title: 'فيلم Inception 2010 مترجم', year: '2010', source: 'mycima', type: 'movie' },
  { id: 'akwam:2', title: 'مشاهدة فيلم Inception كامل HD', year: '2010', source: 'akwam', type: 'movie', tmdbId: '27205' }
]);
assert.equal(merged.length, 1, 'duplicate titles in the same year must merge into a single card');
assert.equal(merged[0].tmdbId, '27205');
assert.equal(merged[0].typeLabel, 'فيلم');
assert.ok(merged[0].mergedRefs.includes('mycima:1') && merged[0].mergedRefs.includes('akwam:2'));

// 4. Episode normalization prevents undefined
const eps = normalizeEpisodesList([{ title: 'الحلقة 7', ref: 'ep7' }, { name: 'Episode 8' }]);
assert.equal(eps[0].number, 7);
assert.equal(eps[0].label, 'الحلقة 7');
assert.equal(eps[1].number, 8);
assert.ok(!eps.some(e => String(e.title).includes('undefined') || String(e.label).includes('undefined')));

// 5. Arabic runtime formatting
assert.equal(formatRuntimeArabic(115, 'movie'), '1س 55د');
assert.equal(formatRuntimeArabic(45, 'tv'), '45 د');
assert.equal(formatRuntimeArabic(null, 'tv'), '');
assert.equal(formatRuntimeArabic(undefined, 'movie'), '');
assert.equal(formatRuntimeArabic(-1), '');

// 6. index.html MA-NEXUS v8.0 architectural contract guard
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexHtml, /\/web\/core\/ma-nexus\.js/, 'index.html must use MA-NEXUS v8.0 orchestrator');
assert.match(indexHtml, /id="pageTitleDetail"/, 'index.html must include full-screen #pageTitleDetail view');
assert.match(indexHtml, /id="pagePlayerView"/, 'index.html must include full-screen #pagePlayerView view');
assert.match(indexHtml, /id="tab-home"/, 'index.html must include Netflix/Shahid #tab-home shelves');
assert.match(indexHtml, /id="tab-settings"/, 'index.html must include local BYOK #tab-settings view');
assert.match(indexHtml, /handleRouteChange\(\)/, 'index.html must initialize via hash router handleRouteChange()');

console.log('MA-NEXUS v8.0 architecture, encrypted server codes, latency probe, deduplication, and full-screen pages passed');
