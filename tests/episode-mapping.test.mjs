import test from'node:test';import assert from'node:assert/strict';
import{mapSourceEpisodes,episodeMatchesMapping}from'../server/harvest/episode-mapping.mjs';
const metadata={seasons:[{season_number:1,episode_count:16},{season_number:2,episode_count:4}]};
const rows=Array.from({length:20},(_,i)=>({season:1,episode:i+1,source_ref:'observed:'+i}));
test('observed continuous 17–20 map to S2E1–4 without inventing a link',()=>{
 const mapped=mapSourceEpisodes(rows,metadata);assert.equal(mapped.length,20);
 assert.deepEqual(mapped.slice(16).map(r=>[r.season,r.episode,r.source_episode]),[[2,1,17],[2,2,18],[2,3,19],[2,4,20]]);
 assert.deepEqual(mapped.map(r=>r.source_ref),rows.map(r=>r.source_ref));
 const last=mapped.at(-1),input={season_number:2,episode_number:4,payload:{observed_episode:last}};
 assert.equal(episodeMatchesMapping({season_number:1,episode_number:20},input),true);
 assert.equal(episodeMatchesMapping({season_number:1,episode_number:19},input),false);
});
test('split seasons, gaps, partial tails, specials and out-of-range numbers are not guessed',()=>{
 for(const input of [rows.slice(16),rows.filter(r=>r.episode!==5),rows.map(r=>r.episode>16?{...r,season:2,episode:r.episode-16}:r),[...rows,{season:1,episode:21}],rows.map(r=>({...r,season:0}))]){
  const mapped=mapSourceEpisodes(input,metadata);assert(mapped.every(r=>r.numbering_basis==='source-season'));
  assert.deepEqual(mapped.map(r=>[r.season,r.episode]),input.map(r=>[r.season,r.episode]));
 }
 assert.equal(mapSourceEpisodes(rows,{seasons:[]})[16].season,1);
});

test('live discovery resolves the observed absolute episode through the provider server extractor',async()=>{
 const {createContentDiscovery}=await import('../server/scrapers/content-discovery.mjs');const calls=[];
 const module={scrapeSearch:async()=>[{title:'تحت الأرض',year:2026,type:'series',ref:'fixture:work'}],scrapeDetails:async ref=>{calls.push(ref);return ref==='fixture:work'?{title:'تحت الأرض',year:2026,type:'series',episodes:rows.map(r=>({ref:r.source_ref,season:r.season,number:r.episode}))}:{title:'تحت الأرض الحلقة 17',year:2026,type:'series',servers:[]}},scrapeServers:async ref=>{assert.equal(ref,'observed:16');return[{url:'https://cdn.example/17.mp4',kind:'direct',headers:{Referer:'https://source.example/'}}]}};
 const discover=createContentDiscovery({entries:[{meta:{id:'fixture',capabilities:{search:true,details:true}},module}]});
 const result=await discover.discover('تحت الأرض',2,1,{ref:'tmdb:tv:309328',year:2026,type:'series',canonicalSeasons:metadata.seasons});
 assert.equal(result.length,1);assert.equal(calls.at(-1),'observed:16');assert.equal(result[0].observed_identity.season,2);assert.equal(result[0].observed_identity.episode,1);
});
test('a formerly cached absolute episode is re-resolved when its canonical season mapping changes',async()=>{
 const{createHarvestPipeline}=await import('../server/harvest/pipeline.mjs');let reads=0;const patches=[];
 const store={getEpisode:async()=>({state:'playable',media_expires_at:new Date(Date.now()+600000).toISOString(),media:[{observed_identity:{season:1,episode:17}}]}),getWork:async()=>({metadata:{title:'تحت الأرض',year:2026}}),setEpisode:async(_ref,_provider,_source,patch)=>patches.push(patch),request:async()=>{},event:async()=>{}};
 const entries=[{meta:{id:'fixture',domains:['https://source.example'],capabilities:{search:true,details:true}},module:{scrapeDetails:async()=>{reads++;return{title:'تحت الأرض الحلقة 17',year:2026,season_number:1,episode_number:17,media_sources:[{kind:'direct',url:'https://cdn.example/17.mp4'}]}}}}];
 const pipeline=createHarvestPipeline({store,metadata:{},entries,probe:async()=>({playable:true,container_verified:true,webPlayable:false})});
 const mapped=mapSourceEpisodes(rows,metadata)[16];await pipeline.episode({content_ref:'tmdb:tv:309328',provider:'fixture',season_number:2,episode_number:1,payload:{source_ref:'fixture:17',observed_episode:mapped,observed_identity:{title:'تحت الأرض',year:2026}}});
 assert.equal(reads,1);assert.equal(patches.at(-1).state,'playable');assert.equal(patches.at(-1).media[0].observed_identity.season,2);assert.equal(patches.at(-1).media[0].observed_identity.episode,1);assert.equal(patches.at(-1).media[0].source_identity.source_episode,17);
});
