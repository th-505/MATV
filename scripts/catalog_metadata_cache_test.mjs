import assert from 'node:assert/strict';
import {createServer,assertCatalogReference} from '../server/app.mjs';
import {createSupabaseCatalogStore} from '../server/provider-store.mjs';
import {createCatalogMetadataCache,catalogMetadata,trustedNewUntil} from '../server/catalog-metadata-cache.mjs';
import {sourcePublishedAt} from '../server/source-publication.mjs';

const refs={
  '3isk':'3isk:'+Buffer.from('/watch/tvshows/demo/').toString('base64url'),
  akoam:'legacy:'+encodeURIComponent('https://akwam.ss/series/123/demo'),
  alooy:'alooy:'+Buffer.from('/watch/demo.html?key=episode1').toString('base64url'),
  laroza:'laroza:'+Buffer.from('/view-serie1.php?ser=demo').toString('base64url'),
};
for(const [provider,ref] of Object.entries(refs)) assert.equal(assertCatalogReference(ref),provider);
for(const ref of ['https://evil.test','legacy:'+encodeURIComponent('https://akwam.ss/watch/test'),
  'legacy:'+encodeURIComponent('https://akwam.ss/movie/test?token=private'),
  'legacy:'+encodeURIComponent('https://127.0.0.1/movie/test'),'3isk:bad','laroza:bad','alooy:bad'])
  assert.throws(()=>assertCatalogReference(ref));

let clock=1792000000000,loads=0,reads=0;const rows=new Map(),writes=[];
const store={get:async(provider,ref)=>{reads++;return rows.get(ref);},
  touch:async(provider,ref,{metadata,count})=>{
    writes.push({provider,ref,metadata,count});const previous=rows.get(ref);
    rows.set(ref,{metadata:metadata || previous.metadata,request_count:(previous?.request_count || 0)+count,
      demand_hits:[...Array(Math.min(3,count)).fill(new Date(clock).toISOString()),...(previous?.demand_hits || [])].slice(0,3),
      refresh_after:metadata ? new Date(clock+600000).toISOString() : previous.refresh_after});
  }};
const payload=ref=>({title:'A real title',movie_title:'A real title',poster:'https://images.test/poster.jpg',ref,
  description:'Safe summary',type:'series',year:2024,genres:['Drama'],audio_language:'ar',edition:'dubbed',
  media_sources:[{url:'https://video.test/token/master.m3u8?token=secret'}],headers:{Referer:'private'},
  iframe_url:'https://ads.test/embed',media_url:'https://video.test/v.mp4',token:'private',
  subtitles:[{url:'https://video.test/sub.srt?token=private'}],episodes:[]});
const config={store,now:()=>clock,validateRef:assertCatalogReference,load:async(provider,ref)=>{loads++;return payload(ref);}};
const cache=createCatalogMetadataCache(config);
const [one,two]=await Promise.all([cache.get(refs.laroza),cache.get(refs.laroza)]);
assert.deepEqual(one,two);assert.equal(loads,1);assert.equal(reads,1);
assert.equal(rows.get(refs.laroza).request_count,2,'second demand is persisted promptly so this is not a one-off work');
assert.equal(writes.length,2);assert.equal(writes[0].metadata.title,'A real title');
assert.equal(writes[1].metadata,null,'a repeat demand only touches the small counter');
for(const bad of ['headers','media_sources','iframe_url','media_url','token','subtitles']) assert.equal(Object.hasOwn(one,bad),false);
for(let i=0;i<20;i++) await cache.get(refs.laroza);
assert.equal(writes.length,3,'first three observed demands are prompt, later UI visits do not write the DB every time');
assert.equal(reads,1,'memory cache precedes DB reads');
await cache.flush();assert.equal(rows.get(refs.laroza).request_count,22);
const restarted=createCatalogMetadataCache(config);await restarted.get(refs.laroza);
assert.equal(loads,1,'a runtime restart uses the shared metadata cache');
clock+=600001;await restarted.get(refs.laroza);assert.equal(loads,2,'metadata refresh is demand based after ten minutes');
await Promise.all(Object.values(refs).map(ref=>cache.get(ref)));
assert.equal(rows.size,4,'all four providers use the same private metadata lifecycle');
const before=loads;await assert.rejects(cache.get('laroza:invalid'));assert.equal(loads,before);

const unavailable=createCatalogMetadataCache({...config,store:{get:async()=>{throw Error('offline');},touch:async()=>{throw Error('offline');}}});
assert.equal((await unavailable.get(refs['3isk'])).title,'A real title');
assert.equal(unavailable.status().storage_error,'SUPABASE_CATALOG_UNAVAILABLE');
let outageReads=0,outageWrites=0;
const limitedOutage=createCatalogMetadataCache({...config,store:{get:async()=>{outageReads++;return null;},touch:async()=>{outageWrites++;throw Error('offline');}}});
await limitedOutage.get(refs.laroza);await limitedOutage.get(refs['3isk']);await limitedOutage.get(refs.laroza);
assert.equal(outageReads,1);assert.equal(outageWrites,1,'a database failure backs off shared reads and writes for thirty seconds');
assert.equal(trustedNewUntil({year:2026,title:'Latest new movie'},clock),null);
assert.equal(trustedNewUntil({published_at:new Date(clock-7*86400000).toISOString()},clock),null);
assert.equal(trustedNewUntil({published_at:new Date(clock+86400000).toISOString()},clock),null);
assert.equal(trustedNewUntil({published_at:new Date(clock-3600000).toISOString()},clock),new Date(clock+47*3600000).toISOString());
assert.equal(trustedNewUntil({is_latest:true},clock),new Date(clock+48*3600000).toISOString());
assert.equal(sourcePublishedAt('<meta property="article:published_time" content="2026-10-15T10:00:00+03:00">'),'2026-10-15T07:00:00.000Z');
assert.equal(sourcePublishedAt('<time datetime="2026-10-15">Latest</time><script>datePublished="2026-10-15"</script>'),null);
assert.equal(sourcePublishedAt('<meta property="article:published_time" content="2026-02-30T10:00:00Z">'),null);
const latestWrites=[];const latestCache=createCatalogMetadataCache({...config,store:{get:async()=>null,touch:async(...args)=>latestWrites.push(args)}});
latestCache.observeLatest([{ref:refs['3isk']}]);await latestCache.get(refs['3isk']);
assert.equal(latestWrites[0][2].newUntil,new Date(clock+48*3600000).toISOString());
const badImage=catalogMetadata({...payload(refs.laroza),poster:'https://cdn.test/a.jpg?token=secret'},'laroza',refs.laroza,assertCatalogReference);
assert.equal(badImage.poster,'');
const bounded=catalogMetadata({...payload(refs.laroza),episodes:Array.from({length:500},()=>({...payload(refs.laroza),title:'Title '.repeat(100),ref:refs.laroza}))},'laroza',refs.laroza,assertCatalogReference);
assert(Buffer.byteLength(JSON.stringify(bounded))<=128*1024);

const calls=[];const adapter=createSupabaseCatalogStore({url:'https://fixture.supabase.co',key:'sb_secret_fixture',
  fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return init.method==='GET' ? Response.json([]) : new Response(null,{status:204});}});
await adapter.get('laroza',refs.laroza);await adapter.touch('laroza',refs.laroza,{metadata:one,count:1});
assert.equal(calls[0].url.pathname,'/rest/v1/mitv_catalog_cache');
assert.equal(calls[0].url.searchParams.get('limit'),'1');
assert.equal(calls[0].init.headers.Authorization,undefined);assert.equal(calls[0].init.redirect,'error');
assert.equal(calls[1].url.pathname,'/rest/v1/rpc/mitv_touch_catalog');
assert.equal(JSON.parse(calls[1].init.body).p_provider,'laroza');
assert.throws(()=>createSupabaseCatalogStore({url:'https://fixture.supabase.co',key:'sb_publishable_fixture'}),/SERVER_KEY_REQUIRED/);

let endpointLoads=0;const unavailableProvider={status:()=>({}),search:async()=>({data:[]})};
const server=createServer({iskRuntime:unavailableProvider,alooyRuntime:unavailableProvider,larozaRuntime:unavailableProvider,
  catalogStore:null,catalogLoader:async(provider,ref)=>{endpointLoads++;return payload(ref);},runtimeService:{status:()=>({})}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/cinema/metadata?ref='+encodeURIComponent(refs.laroza));
  assert.equal(response.status,200);assert.equal((await response.json()).source,'laroza');
  assert.equal((await fetch(base+'/api/cinema/metadata?ref='+encodeURIComponent(refs.laroza),{method:'POST',body:JSON.stringify({metadata:payload(refs.laroza)})})).status,405);
  assert.equal((await fetch(base+'/api/cinema/metadata?ref=bad')).status,400);
  assert.equal(endpointLoads,1,'clients cannot submit cache payloads or request arbitrary targets');
} finally {await new Promise(resolve=>server.close(resolve));}
console.log('Private catalog metadata: four providers, no media/headers/tokens, bounded JSON/cache, coalesced requests, prompt second hit, batched touches, restart/refresh, outage, strict GET/reference boundary passed');
