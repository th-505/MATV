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

const durableRows=new Map();
const store={
  async get(provider,category){return durableRows.get(`${provider}:${category}`)||null;},
  async put(provider,category,payload,expires){durableRows.set(`${provider}:${category}`,{payload:structuredClone(payload),expires_at:new Date(expires).toISOString()});},
};
clock=0;
const durableFeed=createCatalogFeed({providers:()=>entries,store,now:()=>clock});
await durableFeed.read('browse-movies');
const beforeRestore=calls.length;
const restored=createCatalogFeed({providers:()=>entries,store,now:()=>clock});
assert.equal((await restored.read('browse-movies')).data.length,30);
assert.equal(calls.length,beforeRestore,'restart restores private fresh metadata without rescraping');
assert.equal((await restored.read('browse-movies',2)).data.length,30);
assert.equal(calls.length,beforeRestore);
clock=3_600_001;
await restored.read('browse-movies');
assert.equal(calls.length,beforeRestore+3,'expired durable metadata is refreshed');
const outage=createCatalogFeed({providers:()=>entries,store:{get:async()=>{throw Error('offline');},put:async()=>{throw Error('offline');}}});
assert.equal((await outage.read('browse-movies')).data.length,30);
await timeout.read('browse-movies');
assert.equal((await timeout.read('browse-movies')).cached,false,'failed pages remain retryable');
console.log('Private feed persistence: restart restore, expiry refresh, database outage and retry passed');

const {createServer}=await import('../server/app.mjs');
const openCalls=[];
const server=createServer({catalogStore:null,catalogFeedStore:{recordOpen:async(...args)=>openCalls.push(args)}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const ref='mycima:original-work-ref';
  assert.equal((await fetch(base+'/api/cinema/open?ref='+encodeURIComponent(ref),{method:'POST'})).status,202);
  assert.deepEqual(openCalls,[['mycima',ref]],'only original provider and work reference are recorded');
  assert.equal((await fetch(base+'/api/cinema/open?ref='+encodeURIComponent(ref))).status,405);
  assert.equal((await fetch(base+'/api/cinema/open?ref=unknown:work',{method:'POST'})).status,400);
  assert.equal(openCalls.length,1);
} finally {await new Promise(resolve=>server.close(resolve));}
console.log('Aggregate opens: POST-only, known provider, original reference, no user identity passed');

const foreignEntry={meta:{id:'genre-source',capabilities:{catalog:true}},module:{config:{categories:{movies_foreign:'/foreign'}},
  scrapeCatalog:async category=>{assert.equal(category,'movies_foreign');return [{title:'Foreign fixture',ref:'genre-source:original',type:'movie'}];}}};
assert.equal(catalogCategoryFor(foreignEntry,'movie',getProvider,'arabic'),null,'unsupported genres never fall back to another genre');
const genreFeed=createCatalogFeed({providers:()=>[foreignEntry]});
assert.equal((await genreFeed.read('browse-movie-foreign')).data[0].ref,'genre-source:original');
assert.deepEqual((await genreFeed.read('browse-movie-arabic')).data,[]);
console.log('Genre feed: declared category only, no unrelated genre fallback passed');
