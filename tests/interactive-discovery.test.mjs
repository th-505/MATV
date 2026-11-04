import test from 'node:test';import assert from 'node:assert/strict';
import {createHarvestStore} from '../server/harvest/store.mjs';
import {createHarvestWorker} from '../server/harvest/worker.mjs';
import {createHarvestPipeline} from '../server/harvest/pipeline.mjs';
import {sourceIndexIdentity,distinctSourceEditions} from '../server/harvest/source-edition-identity.mjs';
import {scrapeDetails,PROVIDER_META} from '../server/scrapers/sites/mycima.mjs';
import {MOVIE_DETAILS_HTML} from '../scripts/fixtures/providers/mycima.fixture.mjs';
import {createProviderBrowser} from '../server/scrapers/provider-browser.mjs';

test('twenty source searches start before any finishes while index and media retain their own slots',async()=>{
 let issued=false,index=false,media=false;const started=[],release=[];
 const store={claimLane:async(w,limit,lane)=>{
  if(lane==='search'&&!issued){issued=true;assert.equal(limit,20);return Array.from({length:20},(_,i)=>({job_key:'s'+i,stage:'provider',payload:{phase:'search'}}));}
  if(lane==='index'&&!index){index=true;return[{job_key:'i',stage:'work'}]}
  if(lane==='media'&&!media){media=true;return[{job_key:'m',stage:'episode'}]}
  return[];
 },heartbeat:async()=>{},complete:async()=>{},fail:async()=>{}};
 const wait=job=>{started.push(job.job_key);return new Promise(r=>release.push(r))};
 const worker=createHarvestWorker({store,handlers:{provider:wait,work:wait,episode:wait},pollMs:60000});
 worker.start();await new Promise(r=>setImmediate(r));
 assert.equal(started.filter(x=>x.startsWith('s')).length,20);assert(started.includes('i')&&started.includes('m'));
 for(const r of release)r({});await worker.stop();assert.equal(worker.metrics().active,0);
});

test('edition deduplication requires identical actual indexes and preserves other providers, cuts and numbering',()=>{
 const eps=[{season:1,episode:1,source_ref:'https://one.example/e1'},{season:1,episode:2,source_ref:'https://one.example/e2'}];
 const a=sourceIndexIdentity('one','subtitled',eps);assert.equal(a,sourceIndexIdentity('one','subtitled',[...eps].reverse()));
 assert.notEqual(a,sourceIndexIdentity('one','dubbed',eps));assert.notEqual(a,sourceIndexIdentity('one','subtitled',[{...eps[0],season:2},eps[1]]));
 const row={provider:'one',edition:'subtitled',index_identity:a};
 const unique=distinctSourceEditions([{...row,ref:'a'},{...row,ref:'b'},{...row,ref:'c',provider:'two'},{...row,ref:'d',edition:'dubbed'},{...row,ref:'e',index_identity:null},{...row,ref:'f',index_identity:null}]);
 assert.equal(unique.length,5);assert.equal(sourceIndexIdentity('one','subtitled',[]),null);
});

test('MyCima current OG poster survives when retired poster markup is absent',async()=>{
 const html=MOVIE_DETAILS_HTML.replace(/<div class="Poster--Single-begin">[\s\S]*?<\/div>/,'')+'<meta property="og:image" content="https://mycima.gdn/uploads/current-poster.jpg">';
 const details=await scrapeDetails('https://mycima.gdn/watch/test/',{fixtureHtml:html});
 assert.equal(details.poster,'https://mycima.gdn/uploads/current-poster.jpg');
});

test('provider-specific resolver is called before the generic page unwrapper',async()=>{
 let resolved=0,patch;
 const store={getEpisode:async()=>null,getWork:async()=>({metadata:{identity_scope:'source',title:'Test Movie',source_edition:'subtitled'}}),setEpisode:async(r,p,s,value)=>{patch=value},request:async()=>[],event:async()=>{}};
 const entry={meta:PROVIDER_META,module:{scrapeDetails:async()=>({title:'Test Movie',type:'movie',sourceUrl:'https://mycima.gdn/watch/test/',servers:[]}),scrapeServers:async()=>[],resolveStream:async()=>{resolved++;return{url:'https://cdn.example/test.mp4'}}}};
 const pipeline=createHarvestPipeline({store,entries:[entry],probe:async()=>({playable:true,container_verified:true,webPlayable:true})});
 await pipeline.episode({content_ref:'source:mycima:'+'a'.repeat(24),provider:'mycima',season_number:0,episode_number:0,payload:{source_ref:'mycima:'+Buffer.from('https://mycima.gdn/watch/test/').toString('base64url'),observed_episode:{season:0,episode:0}}});
 assert.equal(resolved,1);assert.equal(patch.media.length,1);assert.equal(patch.media[0].identity_verified,true);
});

test('browser retains actual blocked/timeout codes instead of flattening all failures',async()=>{
 const meta={id:'one',domains:['https://one.example'],capabilities:{catalog:true}};
 const entry={meta,module:{CONFIG:{categories:{all:'/'}},scrapeCatalog:async()=>{throw Object.assign(Error('timeout'),{code:'NETWORK_TIMEOUT'})}}};
 const browser=createProviderBrowser({lookup:()=>entry});
 await assert.rejects(browser.catalog('one','all',1),e=>e.message==='BROWSER_SOURCE_UNAVAILABLE'&&e.code==='NETWORK_TIMEOUT');
});

test('browser emits compact numeric ratings for already installed clients',async()=>{
 const meta={id:'one',domains:['https://one.example'],capabilities:{catalog:true}};
 const browser=createProviderBrowser({lookup:()=>({meta,module:{CONFIG:{categories:{all:'/'}},scrapeCatalog:async()=>[{id:'x',ref:'one:x',title:'Work',rating:'8.5',image:'https://one.example/poster.jpg',unused:'x'.repeat(200000)}]}})});
 const result=await browser.catalog('one','all',1);assert.equal(result.items[0].rating,8.5);assert.equal(result.items[0].poster,'https://one.example/poster.jpg');assert(JSON.stringify(result).length<2000);
});

test('a not-yet-updated DB retains the compatible worker instead of stalling the queue',async()=>{
 let legacy=0;
 const store={claimLane:async()=>{throw Error('HARVEST_DB_HTTP_404')},claim:async()=>{legacy++;return[]},heartbeat:async()=>{},complete:async()=>{},fail:async()=>{}};
 const worker=createHarvestWorker({store,handlers:{},pollMs:60000});worker.start();await new Promise(r=>setImmediate(r));
 worker.wake();await new Promise(r=>setImmediate(r));await worker.stop();assert.equal(legacy,1);assert.equal(worker.metrics().concurrency,2);
});


test('a slow media DB claim does not hold up the next search batch',async()=>{
 let searches=0,releaseMedia;
 const store={claimLane:async(w,n,lane)=>{
  if(lane==='search'){searches++;return[]}
  if(lane==='media')await new Promise(r=>{releaseMedia=r});
  return[];
 },heartbeat:async()=>{},complete:async()=>{},fail:async()=>{}};
 const worker=createHarvestWorker({store,handlers:{},pollMs:60000});
 worker.start();await new Promise(r=>setImmediate(r));
 worker.wake();await new Promise(r=>setImmediate(r));
 assert.equal(searches,2);releaseMedia();await worker.stop();
});


test('real harvest store posts lane, legacy and identity RPC bodies without query pollution',async()=>{
 const calls=[];
 const store=createHarvestStore({url:'https://fixture.supabase.co/',key:'sb_secret_fixture',fetchImpl:async(url,options)=>{
  calls.push({path:url.pathname,query:url.search,method:options.method,body:JSON.parse(options.body)});
  return new Response('[]',{status:200});
 }});
 await store.claim('worker-id',2);await store.claimLane('worker-id',20,'search');await store.claimKnown('worker-id',20,'search',['job-1']);await store.sourceIndexIdentities(['source:one:test']);
 assert.deepEqual(calls,[
  {path:'/rest/v1/rpc/najd_claim_jobs',query:'',method:'POST',body:{p_worker:'worker-id',p_limit:2}},
  {path:'/rest/v1/rpc/najd_claim_jobs_lane',query:'',method:'POST',body:{p_worker:'worker-id',p_limit:20,p_lane:'search'}},
  {path:'/rest/v1/rpc/najd_claim_known_jobs',query:'',method:'POST',body:{p_worker:'worker-id',p_limit:20,p_lane:'search',p_keys:['job-1']}},
  {path:'/rest/v1/rpc/najd_source_index_identities',query:'',method:'POST',body:{p_refs:['source:one:test']}}
 ]);
});


test('persisted enqueue notifications give the worker exact durable keys for twenty parallel searches',async()=>{
 let notify;let claimedKeys=[],started=0;const release=[];
 const store={onQueued:fn=>{notify=fn},claimLane:async()=>[],claimKnown:async(w,n,lane,keys)=>{
  assert.equal(lane,'search');assert.equal(n,20);claimedKeys=keys;return keys.map(job_key=>({job_key,stage:'provider'}));
 },heartbeat:async()=>{},complete:async()=>{},fail:async()=>{}};
 const worker=createHarvestWorker({store,handlers:{provider:()=>{started++;return new Promise(r=>release.push(r))}},pollMs:60000});
 worker.start();await new Promise(r=>setImmediate(r));
 for(let i=0;i<20;i++)notify({job_key:'durable-'+i,stage:'provider',payload:{phase:'search'}});
 await new Promise(r=>setImmediate(r));assert.equal(claimedKeys.length,20);assert.equal(started,20);
 for(const r of release)r({});await worker.stop();
});

test('the store only announces durable keys after a successful enqueue RPC',async()=>{
 const rows=[{job_key:'one',stage:'provider',payload:{phase:'search'}}];let reject=true,announced=[];
 const store=createHarvestStore({url:'https://fixture.supabase.co/',key:'sb_secret_fixture',fetchImpl:async()=>new Response(reject?'{}':'[]',{status:reject?503:200})});
 store.onQueued(row=>announced.push(row.job_key));
 await assert.rejects(store.enqueueMany(rows));assert.deepEqual(announced,[]);
 reject=false;await store.enqueueMany(rows);assert.deepEqual(announced,['one']);
});


test('a missing keyed RPC retains twenty-slot lane claims without enabling the old two-slot worker',async()=>{
 let lanes=0;const store={claimKnown:async()=>{throw Error('HARVEST_DB_HTTP_404')},claimLane:async()=>{lanes++;return[]},heartbeat:async()=>{},complete:async()=>{},fail:async()=>{}};
 const worker=createHarvestWorker({store,handlers:{},pollMs:60000});
 worker.wake({jobs:[{job_key:'known-work',stage:'work'}]});await new Promise(r=>setImmediate(r));
 assert(lanes>=3);assert.equal(worker.metrics().concurrency,26);await worker.stop();
});
