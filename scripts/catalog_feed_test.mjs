import assert from 'node:assert/strict';
import {createCatalogFeed,catalogCategoryFor} from '../server/catalog-feed.mjs';
import {listProviders,getProvider} from '../server/scrapers/registry.mjs';
let clock=0;
const calls=[];
let active=0, peak=0;
const entries=['a','b','c'].map(id=>({meta:{id,capabilities:{catalog:true}},module:{config:{categories:{movies:'/movies'}},async scrapeCatalog(category,page){
  calls.push([id,category,page]); active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,5));active--;
  if(page>4) return [];
  return Array.from({length:20},(_,i)=>({title:`${id} ${page}:${i}`,ref:`${id}:${(page-1)*20+i}`,type:'movie'}));
}}}));
const feed=createCatalogFeed({providers:()=>entries,now:()=>clock,concurrency:2});
const [first,coalesced]=await Promise.all([feed.read('browse-movies'),feed.read('browse-movies')]);
assert.deepEqual(first.data,coalesced.data);
assert.equal(calls.length,3);
assert.equal(first.data.length,30);
assert.deepEqual(first.data.map(row=>row.source),[...Array(10).fill('a'),...Array(10).fill('b'),...Array(10).fill('c')]);
const seen=new Set(first.data.map(row=>row.ref));
for(let page=2;page<=8;page++) {
  const result=await feed.read('browse-movies',page);
  assert.equal(result.data.length,30);
  for(const row of result.data){assert.ok(!seen.has(row.ref));seen.add(row.ref);}
}
assert.equal(seen.size,240,'continue beyond the first sixty cached works per provider');
assert.ok(peak<=2);
const old=first.snapshot;
clock=3_600_001;
assert.notEqual((await feed.read('browse-movies')).snapshot,old);
await assert.rejects(feed.read('invalid'),/FEED_BAD_REQUEST/);
const timeout=createCatalogFeed({providers:()=>[{...entries[0],module:{config:entries[0].module.config,scrapeCatalog:()=>new Promise(()=>{})}}],timeoutMs:5});
const failed=await timeout.read('browse-movies');
assert.equal(failed.status,'error');assert.equal(failed.data.length,0);assert.equal(failed.diagnostics.sources[0].code,'CATALOG_TIMEOUT');
for(const meta of listProviders()) {
 const entry=getProvider(meta.id);
 for(const kind of ['movie','series','anime']) {
  const category=catalogCategoryFor(entry,kind);
  if(category) assert.equal(typeof entry.module.scrapeCatalog,'function');
 }
}
console.log('Catalog feed: registry routing, balanced ten-source blocks, coalescing, bounded concurrency, hourly refresh, pagination beyond sixty and timeout passed');
