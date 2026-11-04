import test from 'node:test';import assert from 'node:assert/strict';
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
