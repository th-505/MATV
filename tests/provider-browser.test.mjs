import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderBrowser } from '../server/scrapers/provider-browser.mjs';

test('provider browsing keeps the selected source and registered categories', async () => {
  const calls = [];
  const meta = { id: 'one', name: 'One', domains: ['https://one.example'], capabilities: { catalog: true } };
  const browser = createProviderBrowser({ providers: () => [meta], lookup: id => id === 'one' ? {
    meta, module: { CONFIG: { categories: { series: '/series/' } },
      async scrapeCatalog(category, page) {
        calls.push([category, page]);
        const items = [{ ref: 'one:series-1', title: 'Series', source: 'incorrect' }];
        Object.defineProperty(items, '_meta', { value: { next_page: 2 } });
        return items;
      },
    },
  } : null });
  assert.equal(browser.sources()[0].categories[0].id, 'series');
  const result = await browser.catalog('one', '', 1);
  assert.deepEqual(calls, [['series', 1]]);
  assert.equal(result.items[0].source, 'one');
  assert.deepEqual(result.items[0].source_refs, { one: 'one:series-1' });
  assert.equal(result.pagination.has_more, true);
  await assert.rejects(() => browser.catalog('one', 'https://127.0.0.1/', 1), /BAD_CATEGORY/);
  await assert.rejects(() => browser.catalog('one', 'series', 0), /BAD_PAGE/);
  await assert.rejects(() => browser.catalog('missing', '', 1), /UNAVAILABLE/);
  assert.equal(calls.length, 1, 'invalid routes must never invoke a scraper');
});
