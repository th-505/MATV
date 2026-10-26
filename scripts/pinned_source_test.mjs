import assert from 'node:assert/strict';
import { getProvider } from '../server/scrapers/registry.mjs';
import { SOURCE_REGISTRY, getSource, createSourceSearch, createMultiSourceSearch, listSourceCapabilities, titleMatchesQuery } from '../server/scrapers/source-registry.mjs';

assert.equal(SOURCE_REGISTRY.length, 19);
assert.equal(getSource('wecima').id, 'mycima');
assert.equal(getSource('akoam').id, 'akwam');
assert.equal(getSource('yallashoot'), null);
assert.equal(getSource('egydead_live'), null);
for (const source of SOURCE_REGISTRY) {
  assert.equal(typeof getProvider(source.id)?.module.scrapeSearch, 'function', source.id);
  const calls = [];
  const search = createSourceSearch({ loadModule: async module => {
    calls.push(module);
    return { scrapeSearch: async (query, page, options) => {
      assert.equal(page, 1);
      assert.equal(options.strict, true);
      return [{ title: `فيلم ${query}`, ref: `${source.id}:ref` }, { title: 'unrelated result' }];
    } };
  } });
  const result = await search('العمل', source.id);
  assert.deepEqual(calls, [source]);
  assert.equal(result.length, 1);
  assert.equal(result[0].selected_source, source.id);
  assert.equal(result[0].ref, `${source.id}:ref`);
}
assert.equal(titleMatchesQuery('فيلم: العَمَل', 'العمل'), true);
let loads = 0;
const failedSearch = createSourceSearch({ loadModule: async () => {
  loads++;
  return { scrapeSearch: async () => { throw Error('PROVIDER_TIMEOUT'); } };
} });
await assert.rejects(failedSearch('title', 'alooy'), /PROVIDER_TIMEOUT/);
assert.equal(loads, 1, 'source failure must not trigger a fallback');
await assert.rejects(failedSearch('title', 'not-a-source'), /SOURCE_NOT_SUPPORTED/);
await assert.rejects(failedSearch('a', 'mycima'), /INVALID_QUERY/);
assert.equal(loads, 1);
const emptySearch = createSourceSearch({ loadModule: async () => ({ scrapeSearch: async () => [] }) });
assert.deepEqual(await emptySearch('title', 'mycima'), []);
console.log('Pinned source routing: 19 concrete search modules, aliases, filtering, errors, and no fallback passed.');

const capabilities = listSourceCapabilities();
assert.equal(capabilities.length, SOURCE_REGISTRY.length);
assert.deepEqual(Object.keys(capabilities[0]).sort(), ['aliases', 'domain', 'id', 'name_ar', 'search']);
let active = 0, maxActive = 0;
const searched = [];
const allSearch = createMultiSourceSearch({ search: async (query, provider) => {
  searched.push(provider);
  active++;
  maxActive = Math.max(maxActive, active);
  await new Promise(resolve => setTimeout(resolve, 2));
  active--;
  if (provider === 'alooy') throw Error('PROVIDER_DOWN');
  return [{ title: query, selected_source: provider, ref: `${provider}:same` },
    { title: query, selected_source: provider, ref: `${provider}:same` }, { title: 'unrelated' }];
} });
const combined = await allSearch('test');
assert.equal(searched.length, SOURCE_REGISTRY.length);
assert.equal(combined.length, SOURCE_REGISTRY.length - 1);
assert.equal(maxActive, 6);
const unavailable = createMultiSourceSearch({ search: async () => { throw Error('DOWN'); } });
await assert.rejects(unavailable('test'), /SOURCES_UNAVAILABLE/);
console.log('Unified search: all registered searchers, six concurrent provider calls, isolation and deduplication passed.');
