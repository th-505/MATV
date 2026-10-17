import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROVIDERS_MAP, getProvider, getProviderByCode, getProvidersByCode, listProviders, resolveProviderReference
} from '../server/scrapers/registry.mjs';
import { resolveAkwamTargetUrl } from '../server/scrapers/sites/akwam.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXPECTED_IDS = [
  'mycima', 'akwam', 'cimanow', 'shahid4u', 'moviztime', 'shii4u', 'egydead', 'ipauniverse',
  '3cktv', 'anime4up', 'qfilm', 'ristoanime', 'arabseed', 'mewsry', 'anime4up_rest',
  'witanime', 'egydead_live', 'yallashoot', '3isk', 'alooy', 'laroza'
];

assert.equal(PROVIDERS_MAP.size, EXPECTED_IDS.length, 'registry must contain the audited provider inventory');
assert.deepEqual(listProviders().map((provider) => provider.id).sort(), [...EXPECTED_IDS].sort());
for (const id of EXPECTED_IDS) {
  const entry = getProvider(id);
  assert.ok(entry, `${id} must be registered`);
  assert.equal(entry.meta.id, id);
  for (const capability of ['catalog', 'details', 'episodes', 'servers', 'resolve']) {
    if (entry.meta.capabilities?.[capability]) {
      const exportName = { catalog: 'scrapeCatalog', details: 'scrapeDetails', episodes: 'scrapeEpisodes', servers: 'scrapeServers', resolve: 'resolveStream' }[capability];
      assert.equal(typeof entry.module[exportName], 'function', `${id} claims ${capability} but has no ${exportName}`);
    }
  }
  if (entry.meta.capabilities?.search) assert.equal(typeof entry.module.scrapeSearch, 'function');
  const fixture = await import(`./fixtures/providers/${id}.fixture.mjs`);
  assert.equal(fixture.FIXTURE_META?.providerId, id, `${id} fixture identity mismatch`);
}

for (const [alias, id] of Object.entries({ akoam: 'akwam', moviz: 'moviztime', ipa: 'ipauniverse', risto: 'ristoanime', sports_live: 'yallashoot', '3ck': '3cktv' })) {
  assert.equal(getProvider(alias)?.meta.id, id, `${alias} alias should resolve to ${id}`);
}
for (const code of ['MA-1', 'AK-1', 'SH-1', 'AP-1', 'AP-2', 'ED-2', 'YT-1', 'LA-1']) {
  assert.ok(getProviderByCode(code), `legacy code ${code} should resolve to a provider family`);
}
assert.equal(getProviderByCode('AP-2').meta.id, 'anime4up', 'the canonical AP provider is stable and independent of registration order');
assert.deepEqual(getProvidersByCode('AP-2').map((entry) => entry.meta.id), ['anime4up', 'anime4up_rest']);
const legacyAkwamUrl = 'https://akwam.ss/movie/legacy-ref';
const legacyAkwamEncoded = Buffer.from(legacyAkwamUrl).toString('base64url');
assert.equal(getProvider('akoam')?.meta.id, 'akwam');
assert.equal(resolveProviderReference(`akoam:${legacyAkwamUrl}`)?.meta.id, 'akwam');
assert.equal(resolveAkwamTargetUrl(`akoam:${legacyAkwamEncoded}`), legacyAkwamUrl,
  'legacy Base64URL akoam refs must resolve through the current Akwam provider');
assert.equal(resolveProviderReference('https://shii4u.cam/film/a')?.meta.id, 'shii4u');
assert.equal(resolveProviderReference('https://w1.anime4up.rest/anime/a')?.meta.id, 'anime4up_rest');
assert.equal(resolveProviderReference('https://tv10.egydead.live/h3/')?.meta.id, 'egydead_live');

const fixtureTestFiles = readdirSync(resolve(ROOT, 'scripts/providers'))
  .filter((name) => name.endsWith('.fixture.test.mjs'))
  .map((name) => resolve(ROOT, 'scripts/providers', name));
const requiredFixtureTests = new Set(['akwam', '3isk', 'alooy', 'anime4up', 'arabseed', 'cimanow', 'egydead', 'ipauniverse', 'laroza', 'mewsry', 'moviztime', 'mycima', 'qfilm', 'ristoanime', 'shahid4u', 'witanime', 'yallashoot']);
for (const id of requiredFixtureTests) assert.ok(fixtureTestFiles.some((path) => path.endsWith(`/${id}.fixture.test.mjs`)), `missing deterministic fixture test: ${id}`);
fixtureTestFiles.push(resolve(ROOT, 'scripts/providers/additional_provider_fixtures.test.mjs'));

for (const testFile of fixtureTestFiles) {
  const result = spawnSync(process.execPath, ['--import', resolve(ROOT, 'scripts/disable_external_fetch.mjs'), testFile], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  assert.equal(result.status, 0, `fixture test failed: ${testFile}`);
}

console.log(`PASS: ${EXPECTED_IDS.length} registry identities/capabilities and ${fixtureTestFiles.length} deterministic provider fixture test files`);
