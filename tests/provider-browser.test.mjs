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

test('successful metadata is coalesced and bounded, while failures and empty pages are never cached',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);let clock=100;
 const meta={id:'sample',name:'Sample',domains:['https://sample.example'],capabilities:{catalog:true,live:true}};
 const browser=createProviderBrowser({now:()=>clock,catalogTtlMs:1000,providers:()=>[meta],lookup:()=>({meta,module:{CONFIG:{categories:{live:'/'}},scrapeCatalog:async()=>{calls++;await gate;return[{ref:'sample:observed',title:'Observed',type:'live'}]}}})});
 assert.equal(browser.sources()[0].content_type,'live');
 const a=browser.catalog('sample','live'),b=browser.catalog('sample','live');await new Promise(r=>setImmediate(r));assert.equal(calls,1);release();const[first,second]=await Promise.all([a,b]);first.items[0].title='caller mutation';assert.equal(second.items[0].title,'Observed');assert.equal((await browser.catalog('sample','live')).items[0].title,'Observed');assert.equal(calls,1);clock+=1001;await browser.catalog('sample','live');assert.equal(calls,2);
 let attempts=0;const fail=createProviderBrowser({providers:()=>[meta],lookup:()=>({meta,module:{CONFIG:{categories:{live:'/'}},scrapeCatalog:async()=>{attempts++;if(attempts===1)throw Object.assign(Error('blocked'),{code:'ACCESS_BLOCKED'});return[];}}})});
 await assert.rejects(()=>fail.catalog('sample','live'),/SOURCE_UNAVAILABLE/);await fail.catalog('sample','live');await fail.catalog('sample','live');assert.equal(attempts,3);
});
