import test from'node:test';import assert from'node:assert/strict';
import{contentIdentity,explicitSeason}from'../shared/content-identity.js';
import{matchHarvestIdentity}from'../server/harvest/identity.mjs';
import{scanEpisodeIndex}from'../server/harvest/episode-index.mjs';
import{readCachedPlayback}from'../server/harvest/cached-playback.mjs';
const expected={title:'تحت الأرض',original_title:'Yeraltı',aliases:['Underground'],year:2026,type:'series'};
test('Arabic ordinal and compact season labels preserve identity without loose title matching',()=>{
 for(const title of['مشاهدة مسلسل تحت الأرض ج2 حلقة 3 ( 2026 )','مسلسل تحت الأرض الموسم الثاني الحلقة 3 مترجمة','Yeraltı'])assert.equal(matchHarvestIdentity(expected,{title,year:2026,type:'series'}).accepted,true);
 assert.equal(matchHarvestIdentity(expected,{title:'Yeralti',year:2026,type:'series'}).accepted,true);
 assert.equal(matchHarvestIdentity(expected,{title:'تحت الأرض الأخرى',year:2026,type:'series'}).accepted,false);
 assert.equal(matchHarvestIdentity(expected,{title:'تحت الأرض',year:2013,type:'series'}).accepted,false);
 assert.equal(explicitSeason('الموسم الثاني'),2);assert.equal(explicitSeason('تحت الأرض ج2 حلقة 3'),2);
 assert.equal(contentIdentity({title:'مسلسل تحت الأرض الموسم الثاني الحلقة 3'}).season_number,2);
 const index=scanEpisodeIndex('<div class="episodes"><a href="/episode-3/">الحلقة 3</a></div>','https://source.example/series/',{provider:'fixture',domains:['source.example'],title:'تحت الأرض الموسم الثاني'});
 assert.equal(index.episodes[0].season,2);assert.equal(index.episodes[0].episode,3);
});
test('Alooy selected key uses the observed episode label and actual second-season title',async()=>{
 const{scrapeDetails}=await import('../server/scrapers/sites/alooy.mjs');
 const fixtureHtml='<h1>تحت الأرض ج2</h1><p>Release: 2026</p><a href="https://fa.alooytv16.xyz/watch/yeralti-2.html?key=one">Ep#1</a><a href="https://fa.alooytv16.xyz/watch/yeralti-2.html?key=three">Ep#3</a><a href="https://fa.alooytv16.xyz/watch/yeralti-2.html?key=unknown">رابط غير مرقم</a>';
 const d=await scrapeDetails('https://fa.alooytv16.xyz/watch/yeralti-2.html?key=three',{fixtureHtml});
 assert.equal(d.year,'2026');assert.equal(d.episode_number,3);assert.equal(d.season_number,2);assert.deepEqual(d.episodes.map(e=>e.number),[1,3]);assert(d.episodes.every(e=>e.season===2));
});
test('Akwam release year comes from the work facts, not a related-card badge',async()=>{
 const{scrapeDetails}=await import('../server/scrapers/sites/akwam.mjs');
 const fixtureHtml='<aside><b class="badge-secondary">2024</b></aside><div><h1>تحت الارض</h1><div><span>السنة : 2026</span></div></div>';
 const d=await scrapeDetails('https://akwam.ss/series/5264/test',{fixtureHtml});assert.equal(d.year,'2026');
});
test('a verified DB hit needs no scrape, TMDB request or Gemini decision and rejects stale/mismatched rows',async()=>{
 const now=Date.now();let mediaCalls=0;
 const source={provider:'alooy',kind:'direct',url:'https://cdn.example/episode.mp4',expires_at:new Date(now+300000).toISOString(),identity_verified:true,observed_identity:{title:'تحت الأرض ج2',year:2026,season:2,episode:3}};
 const harvest={cachedWork:async()=>({data:expected}),cachedSeason:async()=>({data:{episodes:[{episode_number:3}]}}),media:async()=>{mediaCalls++;return[source]}};
 let result=await readCachedPlayback(harvest,{ref:'tmdb:tv:309328',season:2,episode:3},()=>now);assert.equal(result.cache_hit,true);assert.equal(result.source,'najd-private-cache');assert.equal(result.servers.length,1);assert.equal(mediaCalls,1);
 assert.equal(await readCachedPlayback(harvest,{ref:'tmdb:tv:309328',season:2,episode:4},()=>now),null);
 source.observed_identity.year=2013;assert.equal(await readCachedPlayback(harvest,{ref:'tmdb:tv:309328',season:2,episode:3},()=>now),null);
 source.observed_identity.year=2026;source.expires_at=new Date(now+1000).toISOString();assert.equal(await readCachedPlayback(harvest,{ref:'tmdb:tv:309328',season:2,episode:3},()=>now),null);
});
test('Shahid4u reads the labeled own year and keeps season two episode three',async()=>{
 const{scrapeDetails}=await import('../server/scrapers/sites/shahid4u.mjs');
 const fixtureHtml='<section class="sh-single-info"><h1>مسلسل تحت الأرض الموسم الثاني الحلقة 3 مترجمة</h1><div><strong>السنة</strong><div><a href="https://shahidfu.cam/search?year=2026">2026</a></div></div></section><div class="sh-single-episode-grid"><a href="https://shahidfu.cam/episode-series-s2-e3/" title="الحلقة 3">الحلقة 3</a></div>';
 const d=await scrapeDetails('https://shahidfu.cam/episode-series-s2-e3/',{fixtureHtml});assert.equal(d.year,'2026');assert.equal(d.season_number,2);assert.equal(d.episode_number,3);assert.equal(d.episodes[0].season,2);
});
test('an episode identity failure leaves no permanently resolving cache row',async()=>{
 const{createHarvestPipeline}=await import('../server/harvest/pipeline.mjs');const states=[];
 const store={getEpisode:async()=>null,setEpisode:async(_ref,_provider,_source,patch)=>states.push(patch.state),getWork:async()=>({metadata:expected})};
 const entries=[{meta:{id:'fixture',domains:['https://source.example'],capabilities:{search:true,details:true}},module:{scrapeDetails:async()=>({title:'مسلسل تحت الأرض الموسم الثاني الحلقة 1',year:2026,type:'series'})}}];
 const pipeline=createHarvestPipeline({store,metadata:{},entries});
 await assert.rejects(()=>pipeline.episode({content_ref:'tmdb:tv:309328',provider:'fixture',payload:{source_ref:'fixture:ref'},season_number:2,episode_number:3}),/HARVEST_EPISODE_IDENTITY_CONFLICT/);
 assert.deepEqual(states,['resolving','unavailable']);
});
