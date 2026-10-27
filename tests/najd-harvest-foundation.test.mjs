import test from 'node:test';
import assert from 'node:assert/strict';
import {scanEpisodeIndex} from '../server/harvest/episode-index.mjs';
import {matchHarvestIdentity,mediaExpiry} from '../server/harvest/identity.mjs';
import {createHarvestWorker} from '../server/harvest/worker.mjs';
import {validateProviderConfig,registerProviderOrigins,installProviderConfigs,rewriteProviderRequest} from '../server/scrapers/shared/provider-config.mjs';

test('all 1217 actual episode links survive without synthetic numbering or a sixty-item cap',()=>{
 const html='<div class="episodes">'+Array.from({length:1217},(_,i)=>`<a href="/episode-${i+1}/">الحلقة ${i+1}</a>`).join('')+'</div><a rel="next" href="/?page=2">التالي</a>';
 const index=scanEpisodeIndex(html,'https://source.example/',{provider:'fixture',domains:['source.example']});
 assert.equal(index.episodes.length,1217);assert.equal(index.episodes.at(-1).episode,1217);
 assert.equal(index.pages[0],'https://source.example/?page=2');
 const missing=scanEpisodeIndex('<div class="episodes"><a href="/film-12-2025/">فيلم 12 2025</a></div>','https://source.example/',{provider:'fixture',domains:['source.example']});
 assert.equal(missing.episodes.length,0);
});
test('name and conflicting year never match and metadata cannot lengthen media expiry',()=>{
 assert.equal(matchHarvestIdentity({title:'Example',year:2025,type:'movie'},{title:'Example',year:2024,type:'movie'}).accepted,false);
 assert.equal(matchHarvestIdentity({title:'Example',year:2025,type:'movie'},{title:'Different',year:2025,type:'movie'}).accepted,false);
 const now=Date.UTC(2026,9,27);const expiry=now+120_000;
 assert.equal(mediaExpiry({url:`https://cdn.example/movie.mp4?exp=${expiry/1000}`},now),expiry);
 assert.equal(mediaExpiry({url:`https://cdn.example/movie.mp4?exp=${(now-1000)/1000}`},now),null);
});
test('provider config rejects arbitrary fields, credentials and private domains',()=>{
 for(const config of [{code:'eval()'},{primary_domain:'http://source.example'},{primary_domain:'https://user:pass@source.example'},{primary_domain:'https://a.internal'},{search_parameter:'api_key'},{search_path:'/?s={query}&token=secret'},{card_selector:'.x:has(script)'}])assert.throws(()=>validateProviderConfig(config));
});
test('domain rotation strips old credentials and preserves third-party embed origins',()=>{
 registerProviderOrigins('fixture',['https://old.example']);
 installProviderConfigs([{provider:'fixture',config:{primary_domain:'https://new.example',search_path:'/?s={query}'}}]);
 const out=rewriteProviderRequest('https://old.example/search?q=Example',{providerId:'fixture',headers:{Cookie:'secret',Authorization:'Bearer secret',Referer:'https://old.example/'},cookies:'secret'});
 assert.equal(out.url,'https://new.example/?s=Example');assert.equal(out.options.cookies,'');
 assert.equal(out.options.headers.Cookie,undefined);assert.equal(out.options.headers.Authorization,undefined);
 assert.equal(out.options.headers.Referer,'https://new.example/');
 assert.equal(rewriteProviderRequest('https://embed.example/player',{providerId:'fixture'}).url,'https://embed.example/player');
 installProviderConfigs([]);
});
test('a synchronous handler failure releases the worker slot and records a failed job',async()=>{
 let claimed=false,failures=0;
 const store={claim:async()=>claimed?[]:(claimed=true,[{job_key:'a',stage:'work',attempts:1}]),heartbeat:async()=>{},complete:async()=>{},fail:async()=>{failures++}};
 const worker=createHarvestWorker({store,handlers:{work:()=>{throw Error('FIXTURE_FAILURE')}},pollMs:60000});
 worker.start();await new Promise(r=>setImmediate(r));await worker.stop();
 assert.equal(failures,1);assert.equal(worker.metrics().active,0);
});

test('observed Conan source has twelve references, eleven numbers and a real series parent',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('./fixtures/shahid4u-conan-index.html',import.meta.url),'utf8');
 const index=scanEpisodeIndex(html,'https://shahidfu.cam/episode-almhqq-kwnan-detective-conan-e1217/',{provider:'shahid4u',domains:['shahidfu.cam'],title:'انمي المحقق كونان Detective Conan الحلقة 1217 مترجمة'});
 assert.equal(index.episodes.length,12);assert.equal(new Set(index.episodes.map(row=>row.episode)).size,11);
 assert.equal(index.source_declared_references,12);assert.equal(index.parents.length,1);
 assert.equal(Math.min(...index.episodes.map(row=>row.episode)),1207);assert.equal(Math.max(...index.episodes.map(row=>row.episode)),1217);
});
test('AWS and nested CDN expiry hints can shorten, never extend cached media lifetime',()=>{
 const now=Date.UTC(2026,9,27,12);
 assert.equal(mediaExpiry({url:'https://cdn.example/film.mp4?X-Amz-Date=20261027T120000Z&X-Amz-Expires=120'},now),now+120000);
 assert.equal(mediaExpiry({url:'https://cdn.example/film.mp4?hdnea=exp%3D'+Math.floor((now+180000)/1000)+'%7Eacl%3D*'},now),now+180000);
});

test('a bilingual source title must contain two known aliases, not a loose single-word prefix',()=>{
 const expected={title:'المحقق كونان',aliases:['Detective Conan'],year:1996,type:'series'};
 assert.equal(matchHarvestIdentity(expected,{title:'انمي المحقق كونان Detective Conan الحلقة 1217 مترجمة',year:1996,type:'series'}).accepted,true);
 assert.equal(matchHarvestIdentity({title:'Avatar',year:2009},{title:'Avatar Special Other Story',year:2009}).accepted,false);
 assert.equal(matchHarvestIdentity(expected,{title:'المحقق كونان Detective Conan',year:2026,type:'series'}).accepted,false);
});


test('persistent cache excludes expired or unverified media and dashboard tolerates DB outage',async()=>{
 const {createHarvestService}=await import('../server/harvest/service.mjs');
 const now=Date.now();
 const store={episodes:async()=>[{media:[
  {url:'https://cdn.example/valid.mp4',expires_at:new Date(now+60000).toISOString(),identity_verified:true,web_playable:false},
  {url:'https://cdn.example/expired.mp4',expires_at:new Date(now-1000).toISOString(),identity_verified:true},
  {url:'https://cdn.example/unverified.mp4',expires_at:new Date(now+60000).toISOString(),identity_verified:false},
 ]}],request:async()=>{throw Error('DATABASE_UNAVAILABLE')},config:async()=>[]};
 const service=createHarvestService({store,metadata:{},now:()=>now});
 assert.equal((await service.media('tmdb:movie:1')).length,1);
 assert.equal(await service.media('tmdb:movie:1',{platform:'web'}),null);
 assert.equal(await service.media('other:1'),null);
 const summary=await service.summary();assert.equal(summary.configured,true);assert.deepEqual(summary.unavailable,['jobs','works','sources','events']);assert.deepEqual(summary.jobs,[]);
});


test('an empty search advances to the next alias and one unsafe card cannot discard valid siblings',async()=>{
 const {createHarvestPipeline}=await import('../server/harvest/pipeline.mjs');
 const queries=[],queued=[],events=[];
 const expected={title:'مثال',original_title:'Example',year:2025,type:'movie'};
 const store={getWork:async()=>({metadata:expected}),enqueueMany:async rows=>queued.push(...rows),event:async row=>events.push(row)};
 const empty=Object.assign([],{_meta:{errorCode:'EMPTY_RESULT',next_page:2}});
 const entry={meta:{id:'fixture',enabled:true,domains:['https://source.example'],capabilities:{search:true,details:true}},module:{scrapeSearch:async query=>{queries.push(query);return query==='Example'?empty:[{title:'مثال',year:2025,type:'movie',ref:'https://127.0.0.1/private'},{title:'مثال',year:2025,type:'movie',ref:'https://source.example/actual-film'}]}}};
 const pipeline=createHarvestPipeline({store,metadata:{},entries:[entry]});
 const first=await pipeline.provider({provider:'fixture',content_ref:'tmdb:movie:1',payload:{phase:'search',query_index:0,page:1,cycle:1}});
 assert.equal(first.continuation.query_index,1);assert.equal(first.continuation.page,1);
 await pipeline.provider({provider:'fixture',content_ref:'tmdb:movie:1',payload:first.continuation});
 assert.deepEqual(queries,['Example','مثال']);assert.equal(queued.length,1);assert.equal(queued[0].payload.url,'https://source.example/actual-film');
 assert(events.some(row=>row.reason==='UNSAFE_SOURCE_REFERENCE'));
});
