import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createHarvestPipeline}from'../server/harvest/pipeline.mjs';import{createSourceApi}from'../server/harvest/source-api.mjs';
import{workReference}from'../server/harvest/work-reference.mjs';
import{decideSourceCatalog,observedRuntimeMinutes}from'../server/scrapers/shared/catalog-decision.mjs';
import*as isk from'../server/scrapers/sites/3isk.mjs';import*as ck from'../server/scrapers/sites/3cktv.mjs';
const fixture=name=>readFile(new URL('./fixtures/valley-wolves/'+name,import.meta.url),'utf8');
function memoryStore(){const works=new Map(),sources=new Map(),episodes=new Map(),jobs=new Map(),events=[];return{works,sources,episodeRows:episodes,jobs,events,
 getWork:async ref=>works.get(ref),putWork:async row=>works.set(row.ref,row),putSource:async row=>sources.set(row.work_ref+'|'+row.provider+'|'+row.source_ref,row),
 putEpisodes:async rows=>{for(const r of rows){const k=r.work_ref+'|'+r.provider+'|'+r.source_ref;episodes.set(k,{...episodes.get(k),...r})}},
 getEpisode:async(ref,provider,source)=>episodes.get(ref+'|'+provider+'|'+source),setEpisode:async(ref,provider,source,patch)=>{const key=ref+'|'+provider+'|'+source;episodes.set(key,{...episodes.get(key),...patch})},
 episodes:async(ref,{season,episode,limit=1000,offset=0}={})=>[...episodes.values()].filter(r=>r.work_ref===ref&&(season===undefined||r.season===season)&&(episode===undefined||r.episode===episode)).slice(offset,offset+limit),
 enqueue:async row=>jobs.set(row.job_key,row),enqueueMany:async rows=>{for(const row of rows)jobs.set(row.job_key,row)},event:async row=>events.push(row),
 request:async(table,p={},method='GET',patch)=>{const all=table==='matv_discovery_jobs'?[...jobs.values()]:table==='najd_source_catalog'?[...sources.values()]:[];const found=all.filter(r=>(!p.job_key||r.job_key===p.job_key.slice(3))&&(!p.content_ref||r.content_ref===p.content_ref.slice(3))&&(!p.work_ref||r.work_ref===p.work_ref.slice(3))&&(!p.status||r.status===p.status.slice(3))&&(!p.stage||r.stage===p.stage.slice(3))&&(!p.season_number||r.season_number===Number(p.season_number.slice(3)))&&(!p.episode_number||r.episode_number===Number(p.episode_number.slice(3))));if(method==='PATCH')for(const row of found)Object.assign(row,patch);return found}};}

test('source identity is stable, provider scoped and rejects arbitrary references',()=>{
 const a='3isk:abc',b='3cktv:abc';assert.equal(workReference(a),workReference(a));assert.notEqual(workReference(a),workReference(b));assert.equal(workReference('tmdb:tv:34587'),'tmdb:tv:34587');assert.throws(()=>workReference('https://127.0.0.1/private'));assert.throws(()=>workReference('unknown:abc'));assert.throws(()=>workReference('3isk:bad\nref'));
});
test('observed runtime and language editions are not year guesses or cross-cut equivalence',()=>{
 assert.equal(observedRuntimeMinutes('ساعتين و20 دقيقة'),140);assert.equal(observedRuntimeMinutes('ساعة و30 دقيقة'),90);assert.equal(observedRuntimeMinutes('تاريخ الإضافة2026/09/06'),null);
 assert.equal(decideSourceCatalog({title:'وادي الذئاب مدبلج',episodes:[]}).edition,'dubbed');assert.equal(decideSourceCatalog({title:'وادي الذئاب مترجم',episodes:[]}).edition,'subtitled');
});
test('the actual source 55+42 index stays 55+42 without a fabricated canonical year or TMDB request',async()=>{
 const html=await fixture('3isk-original-index.html'),original='3isk:'+Buffer.from('https://3iskk.xyz/watch/tvshows/serie-kurtlar-vadisi-pusu-1oct5/').toString('base64url');
 const store=memoryStore(),entry={meta:isk.PROVIDER_META,module:{scrapeDetails:(ref,o)=>isk.scrapeDetails(ref,{...o,fixtureHtml:html})}};
 const p=createHarvestPipeline({store,metadata:{details:()=>{throw Error('TMDB_MUST_NOT_BE_REQUESTED')}},entries:[entry],fetchPage:async()=>({html})});const ref=workReference(original);
 await p.work({content_ref:ref,payload:{source_ref:original}});const work=store.works.get(ref);
 assert.equal(work.tmdb_id,null);assert.equal(work.metadata.year,null);assert.deepEqual(work.metadata.seasons.map(s=>s.episode_count),[55,42]);assert.equal(work.metadata.number_of_episodes,97);assert.equal(work.metadata.runtime_minutes,140);assert.equal(work.metadata.source_index_authoritative,true);assert.equal(work.metadata.canonical_identity_verified,false);
 assert.equal([...store.jobs.values()].filter(j=>j.stage==='episode').length,97);
 assert.equal([...store.episodeRows.values()].filter(e=>e.season===2).length,42);
});
test('a dubbed fifth-part gap is detected and another provider cannot merge its edition',async()=>{
 const d=await ck.scrapeDetails('https://e.3cktv.cam/video/series/kurtlar-vadisi-dubbed-s5/',{fixtureHtml:await fixture('3cktv-dubbed-s5-gap.html')});
 const a=decideSourceCatalog(d);assert.equal(a.edition,'dubbed');assert.equal(a.index.distinct_episodes,77);assert.equal(a.completeness,'partial');assert.deepEqual(a.index.seasons[0].gap_ranges,[{from:36,to:36}]);assert.notEqual(workReference(d.ref),workReference('3isk:'+d.ref.slice(d.ref.indexOf(':')+1)));
});
test('card/favorite requests create source jobs and the source API returns paginated own episodes',async()=>{
 const store=memoryStore(),wakes=[];const api=createSourceApi({store,worker:{wake:()=>wakes.push(1)},now:()=>20000});
 const original='3cktv:abc',ref=workReference(original);const response=await api.requestWork(original,{reason:'favorite'});assert.equal(response.ref,ref);assert.equal(store.jobs.get(ref+':work').payload.source_ref,original);assert.equal(wakes.length,1);
 store.works.set(ref,{ref,title:'مدبلج',type:'series',metadata:{title:'مدبلج',source_ref:original,source_index_authoritative:true,seasons:[{season_number:5,episode_count:150}]}});
 await store.putEpisodes(Array.from({length:150},(_,i)=>({work_ref:ref,provider:'3cktv',source_ref:'3cktv:episode'+i,season:5,episode:i+1,title:'الحلقة '+(i+1)})));
 const first=await api.sourceDetails(ref,{season:1});assert.equal(first.season_number,5);assert.equal(first.episodes.length,100);assert.equal(first.episode_pagination.next_offset,100);assert(first.episodes.every(e=>e.ref.startsWith(ref+':s5:e')));
 const rest=await api.sourceDetails(ref,{season:5,offset:100});assert.equal(rest.episodes.length,50);assert.equal(rest.episode_pagination.has_more,false);
});
test('source cache excludes another source numbering and returns only direct current media for its edition',async()=>{
 const store=memoryStore(),api=createSourceApi({store,worker:{wake:()=>{}},now:()=>20000}),ref=workReference('3cktv:abc');
 store.works.set(ref,{ref,title:'المصدر',type:'series',metadata:{edition:'3cktv:cut-a',source_edition:'dubbed'}});
 await store.putEpisodes([{work_ref:ref,provider:'3cktv',source_ref:'3cktv:e1',season:5,episode:1,state:'playable',media:[{url:'https://cdn.example/1.mp4',kind:'direct',expires_at:new Date(200000).toISOString(),identity_verified:true,observed_identity:{season:1,episode:1}}]}]);
 const wrong=await api.sourcePlayback(ref,{season:5,episode:1});assert.equal(wrong.state,'queued');
 const row=[...store.episodeRows.values()][0];row.media[0].observed_identity.season=5;
 row.media[0].expires_at='invalid';assert.equal((await api.sourcePlayback(ref,{season:5,episode:1})).state,'queued');row.media[0].expires_at=new Date(200000).toISOString();
 const ready=await api.sourcePlayback(ref,{season:5,episode:1});assert.equal(ready.state,'ready');assert.equal(ready.servers[0].edition,'3cktv:cut-a');assert.equal(ready.servers[0].label,'مدبلج');assert.equal(ready.servers[0].provider_id,'3cktv');
});
test('a movie keeps its private playback row without exposing an episode zero or a series grid',async()=>{
 const store=memoryStore(),api=createSourceApi({store,worker:{wake:()=>{}}}),ref=workReference('3cktv:movie');
 store.works.set(ref,{ref,title:'فيلم',type:'movie',metadata:{type:'movie',title:'فيلم المصدر',overview:'وصف المصدر',catalog_metadata:{title:'فيلم',overview:'وصف TMDB'},seasons:[]}});
 await store.putEpisodes([{work_ref:ref,provider:'3cktv',source_ref:'3cktv:movie',season:0,episode:0}]);
 const result=await api.sourceDetails(ref);assert.equal(result.episodes.length,0);assert.equal(result.season_number,0);assert.equal(result.overview,'وصف TMDB');assert.equal(result.observed_overview,'وصف المصدر');assert.equal(store.episodeRows.size,1);
});

test('interactive playback forces refresh through polling, promotes queued work and retries failed work with cooldown',async()=>{
 let clock=20000;const store=memoryStore(),api=createSourceApi({store,worker:{wake:()=>{}},now:()=>clock}),ref=workReference('3cktv:refresh');
 store.works.set(ref,{ref,title:'مسلسل',metadata:{}});
 await store.putEpisodes([{work_ref:ref,provider:'3cktv',source_ref:'3cktv:e1',season:1,episode:1,state:'playable',media:[{url:'https://cdn.example/old.mp4',kind:'direct',expires_at:new Date(200000).toISOString(),identity_verified:true,observed_identity:{season:1,episode:1}}]}]);
 assert.equal((await api.sourcePlayback(ref,{refresh:true})).state,'queued');
 assert.equal((await api.sourcePlayback(ref)).state,'queued');
 const job=[...store.jobs.values()][0];job.payload.force_refresh=false;job.priority=4;
 await api.sourcePlayback(ref,{refresh:true});assert.equal(job.priority,10);assert.equal(job.payload.force_refresh,true);
 job.status='failed';job.error_code='DIRECT_MEDIA_NOT_FOUND';clock+=11000;
 assert.equal((await api.sourcePlayback(ref,{refresh:true})).state,'queued');
 const retry=[...store.jobs.values()][0];retry.status='failed';
 assert.equal((await api.sourcePlayback(ref,{refresh:true})).state,'failed');
});

test('refresh while a non-forced job is running cannot expose its rejected cache on the next poll',async()=>{
 const store=memoryStore(),api=createSourceApi({store,worker:{wake:()=>{}},now:()=>20000}),ref=workReference('3cktv:running');
 store.works.set(ref,{ref,title:'مسلسل',metadata:{}});
 await store.putEpisodes([{work_ref:ref,provider:'3cktv',source_ref:'3cktv:e1',season:1,episode:1,state:'playable',media:[{url:'https://cdn.example/old.mp4',kind:'direct',expires_at:new Date(200000).toISOString(),identity_verified:true,observed_identity:{season:1,episode:1}}]}]);
 await api.sourcePlayback(ref,{refresh:true});const job=[...store.jobs.values()][0];job.status='running';job.payload.force_refresh=false;
 await store.setEpisode(ref,'3cktv','3cktv:e1',{state:'playable',media:[{url:'https://cdn.example/old.mp4',kind:'direct',expires_at:new Date(200000).toISOString(),identity_verified:true,observed_identity:{season:1,episode:1}}]});
 assert.equal((await api.sourcePlayback(ref,{refresh:true})).state,'running');assert.equal((await api.sourcePlayback(ref)).state,'running');assert.equal([...store.episodeRows.values()][0].media.length,0);
});
