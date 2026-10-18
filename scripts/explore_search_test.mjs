import assert from 'node:assert/strict';
import { sourceDisplayName, sourceDisplayNames } from '../server/source-display.mjs';
import { searchStateMessage } from '../web/core/source-display.js';
import { createServer } from '../server/app.mjs';
import { listProviders, PROVIDERS_MAP } from '../server/scrapers/registry.mjs';
for (const [original, expected] of [[' أكوام ', 'ذكوام'], [' Akoam ', 'ذkoam'], ['123Movies', 'ذ23Movies'], ['١٢٣عربي', 'ذ٢٣عربي'], ['😀Movie', 'ذMovie'], ['', ''], ['أكوام (Akwam)', 'ذكوام (ذkwam)'], ['ماي سيما (MyCima / WeCima)', 'ذاي سيما (ذyCima / ذeCima)'], ['123 (456Movies)', 'ذ23 (ذ56Movies)'], ['𐐀Name', 'ذName']]) assert.equal(sourceDisplayName(original), expected);
assert.deepEqual(sourceDisplayNames('ماي سيما (MyCima / WeCima)'), {primary: 'ذاي سيما', alternatives: ['ذyCima', 'ذeCima']});
const newMeta = { id: 'new-provider', name: 'NewProvider', domains: [], capabilities: { search: true } };
// The registry list is the single source of metadata; no client-side source registry.
const known = listProviders();
assert.equal(sourceDisplayName(newMeta.name), 'ذewProvider');
const calls = [];
const server = createServer({ catalogStore: null, providerSearch: async (id, q) => {
  calls.push([id, q]);
  return { status: q, provider_id: id, data: q === 'success' ? [{title: 'Fixture', ref: 'akoam:fixture', providerId: id, source: id}] : [], error: null };
}});
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  // Use the same backend configuration mechanism as the browser, scoped to this test.
  globalThis.document = {
    querySelector: selector => selector === 'meta[name="matv-api-base"]' ? {content: `http://127.0.0.1:${server.address().port}`} : null,
    documentElement: {style:{}}, getElementById: () => ({}),
    createElement: () => ({}), head: {appendChild() {}}
  };
  const { searchCinema, getSearchProviders, sourceLabel } = await import('../web/core/api-client.js');
  const providers = await getSearchProviders();
  assert.equal(providers.length, known.length);
  for (const meta of known) {
    const row = providers.find(p => p.id === meta.id);
    assert.equal(row.displayName, sourceDisplayName(meta.name || meta.id));
    assert.deepEqual(row.displayNames, sourceDisplayNames(meta.name || meta.id));
    assert.equal(row.supportsSearch, Boolean(meta.capabilities?.search && typeof PROVIDERS_MAP.get(meta.id).module.scrapeSearch === 'function'));
  }
  for (const status of ['success', 'no_results', 'unsupported', 'error']) {
    const response = await searchCinema(status, 'akoam');
    assert.equal(response.data.status, status);
    assert.equal(response.data.data.length, status === 'success' ? 1 : 0);
    assert.equal(Boolean(searchStateMessage(response.data)), status !== 'success');
    if (status === 'success') {
      const item = response.data.data[0];
      assert.equal(item.href, 'akoam:fixture');
      assert.equal(item.providerId, 'akoam');
      const display = sourceLabel(item);
      assert.equal(display, providers.find(p => p.id === 'akwam').displayName);
      assert.equal(sourceLabel(item), display); // repeat render never re-transforms
    }
  }
  assert.deepEqual(calls, ['success', 'no_results', 'unsupported', 'error'].map(q => ['akoam', q]));
  console.log('Explore policy, registry metadata, HTTP error states, query and reference preservation passed');
} finally { delete globalThis.document; await new Promise(resolve => server.close(resolve)); }
