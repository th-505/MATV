// Offline contract and fixture parsing checks. No live-provider claims.
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const originals = [];
let networkAttempts = 0;
function denyNetwork(target, key) {
  originals.push([target, key, target[key]]);
  target[key] = () => {
    networkAttempts++;
    throw Error(`OFFLINE_TEST_NETWORK_FORBIDDEN:${key}`);
  };
}
// Install before importing provider modules, including built-in named imports.
denyNetwork(globalThis, 'fetch');
for (const target of [http, https]) for (const key of ['request', 'get']) denyNetwork(target, key);
for (const key of ['connect', 'createConnection']) denyNetwork(net, key);
denyNetwork(net.Socket.prototype, 'connect');
denyNetwork(tls, 'connect');
for (const target of [dns, dns.promises]) for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) denyNetwork(target, key);
syncBuiltinESMExports();

let passed = 0;
let failed = 0;
async function check(label, action) {
  const before = networkAttempts;
  try {
    await action();
    assert.equal(networkAttempts, before, 'Network was attempted and possibly swallowed by the scraper');
    passed++;
    console.log(`PASS ${label}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

function requireItems(result) {
  assert.ok(Array.isArray(result), 'Expected an array');
  assert.ok(result.length > 0, `Fixture produced no items (${result?._meta?.errorCode || 'no diagnostic'}: ${result?._meta?.errorMessage || ''})`);
  assert.notEqual(result._meta?.ok, false, 'Scraper attached a failed diagnostic');
  for (const item of result) {
    assert.ok(item && typeof item === 'object', 'Expected catalog item object');
    assert.ok(String(item.title || item.name || '').trim(), 'Missing item title');
    assert.ok(item.ref || item.url || item.id, 'Missing item reference');
  }
}

function queryFor(fixture) {
  const raw = fixture.FIXTURE_META.urls?.search;
  if (raw) {
    const url = new URL(raw);
    for (const key of ['s', 'q', 'query', 'keywords', 'term', 'find']) {
      if (url.searchParams.get(key)) return url.searchParams.get(key);
    }
    const pathQuery = url.pathname.match(/(?:Searching|search)\/([^/]+)/i)?.[1];
    if (pathQuery) return decodeURIComponent(pathQuery);
  }
  return 'batman';
}

try {
  const { PROVIDERS_MAP } = await import('../server/scrapers/registry.mjs');
  const { SCRAPER_ERROR_CODES } = await import('../server/scrapers/shared/errors.mjs');
  const { assertSafeScraperUrl } = await import('../server/scrapers/shared/http.mjs');
  await check('registry contains unique provider IDs', () => {
    assert.ok(PROVIDERS_MAP.size > 0);
    for (const [id, { meta, module }] of PROVIDERS_MAP) {
      assert.equal(meta.id, id);
      assert.equal(module.PROVIDER_META, meta);
      for (const name of ['scrapeCatalog', 'scrapeSearch', 'scrapeDetails', 'scrapeEpisodes', 'scrapeServers', 'resolveStream']) {
        assert.equal(typeof module[name], 'function', `${id} missing ${name}`);
      }
    }
  });

  for (const [id, { meta, module }] of PROVIDERS_MAP) {
    let fixture;
    await check(`${id}: fixture metadata`, async () => {
      fixture = await import(`./fixtures/providers/${id}.fixture.mjs`);
      assert.equal(fixture.FIXTURE_META?.providerId, id);
      // Fixture provenance is a repository declaration, not independently verified here.
    });
    if (!fixture) continue;

    if (meta.capabilities.catalog) await check(`${id}: nonempty catalog fixture`, async () => {
      const fixtureHtml = fixture.CATALOG_HTML ?? fixture.CATALOG_TODAY_HTML ?? fixture.REAL_MATCHES_TODAY_HTML;
      assert.equal(typeof fixtureHtml, 'string', 'Catalog fixture missing');
      const options = { fixtureHtml, strict: true };
      if (id === 'ipauniverse') {
        assert.ok(fixture.REAL_TMDB_CATALOG_JSON, 'TMDB catalog fixture missing');
        options.fixtureTmdbJson = fixture.REAL_TMDB_CATALOG_JSON;
      }
      const category = ['mewsry', 'yallashoot'].includes(id) ? 'today' : id === 'egydead_live' ? 'live' : 'movies';
      requireItems(await module.scrapeCatalog(category, 1, options));
    });

    if (meta.capabilities.search) await check(`${id}: nonempty search fixture`, async () => {
      const fixtureHtml = fixture.SEARCH_HTML ?? fixture.SEARCH_JSON ?? fixture.REAL_SEARCH_HTML ?? (id === 'ipauniverse' ? fixture.HOME_HTML : undefined);
      assert.equal(typeof fixtureHtml, 'string', 'Search fixture missing');
      const options = { fixtureHtml, strict: true };
      if (id === 'ipauniverse') {
        assert.ok(fixture.REAL_TMDB_SEARCH_JSON, 'TMDB search fixture missing');
        options.fixtureTmdbJson = fixture.REAL_TMDB_SEARCH_JSON;
      }
      requireItems(await module.scrapeSearch(queryFor(fixture), 1, options));
    });
    else await check(`${id}: explicit unsupported search`, async () => {
      try {
        const result = await module.scrapeSearch('test', 1, { fixtureHtml: '', strict: true });
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
        assert.equal(result._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);
      } catch (error) {
        if (error.code !== SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY) throw error;
      }
    });
  }

  await check('SSRF metadata endpoint blocked', () => {
    assert.throws(() => assertSafeScraperUrl('http://169.254.169.254/latest/meta-data'),
      error => error.code === SCRAPER_ERROR_CODES.UNSAFE_URL);
  });
  await check('no network attempted by fixture suite', () => assert.equal(networkAttempts, 0));
} finally {
  for (const [target, key, value] of originals.reverse()) target[key] = value;
  syncBuiltinESMExports();
}
console.log(`Offline fixture checks: ${passed} passed, ${failed} failed; ${networkAttempts} network attempts blocked.`);
if (failed) process.exitCode = 1;
