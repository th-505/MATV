import test from 'node:test';import assert from 'node:assert/strict';
import {resolveProviderMedia} from '../server/scrapers/shared/provider-media.mjs';
test('provider resolves its observed embedded server rather than treating an episode page as the video',async()=>{
 const calls=[];const entry={module:{scrapeServers:async()=>[{url:'https://player.example/embed/19',kind:'embed'}],resolveStream:async target=>{calls.push(target);return target.includes('/embed/')?{url:'https://cdn.example/19.mp4'}:null}}};
 const streams=await resolveProviderMedia(entry,'mycima:episode19');assert.equal(streams[0].url,'https://cdn.example/19.mp4');assert.deepEqual(calls,['mycima:episode19','https://player.example/embed/19']);
});
test('failed container evidence tries another server of the same provider and never publishes an iframe',async()=>{
 const entry={module:{scrapeServers:async()=>[{url:'https://cdn.example/dead.mp4'},{url:'https://player.example/working',type:'embed'}],resolveStream:async()=>({url:'https://cdn.example/good.m3u8'})}};
 const inspected=[];const result=await resolveProviderMedia(entry,'provider:episode',{accept:async rows=>{inspected.push(...rows.map(r=>r.url));return rows.filter(r=>r.url.endsWith('good.m3u8'))}});
 assert.deepEqual(result.map(r=>r.url),['https://cdn.example/good.m3u8']);assert(inspected.includes('https://cdn.example/dead.mp4'));assert(!inspected.some(url=>url.includes('player.example')));
});
test('private player URLs cannot enter the provider resolver fallback',async()=>{
 const targets=[];const entry={module:{scrapeServers:async()=>[{url:'https://127.0.0.1/private',type:'embed'}],resolveStream:async target=>{targets.push(target);return null}}};
 assert.deepEqual(await resolveProviderMedia(entry,'provider:episode'),[]);assert.deepEqual(targets,['provider:episode']);
});


test('an observed ninth fallback server is reached with bounded concurrency',async()=>{
 let active=0,peak=0;const calls=[];const source='https://source.example/work';
 const entry={module:{scrapeServers:async()=>Array.from({length:10},(_,i)=>({url:'https://player.example/server'+i,format:'iframe'})),resolveStream:async url=>{calls.push(url);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return url.endsWith('server9')?{servers:[{url:'https://cdn.example/good.mp4',format:'mp4'}]}:{};}}};
 const rows=await resolveProviderMedia(entry,source);assert.equal(rows[0].url,'https://cdn.example/good.mp4');assert.equal(calls[0],source);assert(peak<=2);assert(calls.includes('https://player.example/server9'));
});

test('an incomplete observed mirror scan is explicit instead of a false no-media result',async()=>{
 let clock=0;const entry={module:{scrapeServers:async()=>[{url:'https://player.example/server',format:'iframe'}],resolveStream:async()=>{clock+=50000;return{};}}};
 await assert.rejects(resolveProviderMedia(entry,'https://source.example/work',{now:()=>clock}),error=>error.code==='MEDIA_SERVER_SCAN_PARTIAL'&&error.observed_targets===2&&error.attempted_targets===1);
});

test('a working first server does not suppress other observed hosts or their qualities',async()=>{
 const calls=[];const entry={module:{scrapeServers:async()=>[
  {url:'https://cdn.example/direct.mp4'},
  ...Array.from({length:3},(_,i)=>({url:`https://player.example/${i}`,type:'embed'}))],
  resolveStream:async target=>{calls.push(target);return target.startsWith('https://player.example/')?{sources:[720,1080,1440].map(height=>({url:`https://cdn.example/${target.at(-1)}/${height}.mp4`,quality:`${height}p`}))}:null}}};
 const rows=await resolveProviderMedia(entry,'provider:episode');
 assert.equal(rows.length,10);assert.equal(calls.length,4);
 assert.equal(rows._meta.server_scan_complete,true);assert.equal(rows._meta.resolver_attempted,4);
 assert.equal(new Set(rows.map(r=>r.url)).size,10);
});
test('usable media is retained with an explicit partial scan when the deadline expires',async()=>{
 let clock=0;const entry={module:{scrapeServers:async()=>[{url:'https://cdn.example/direct.mp4'},{url:'https://player.example/extra',type:'embed'}],resolveStream:async()=>{clock+=50000;return null;}}};
 const rows=await resolveProviderMedia(entry,'https://source.example/work',{now:()=>clock});
 assert.equal(rows.length,1);assert.equal(rows._meta.server_scan_complete,false);assert.equal(rows._meta.resolver_targets,2);
});
test('observed external embeds use a host resolver rather than an incompatible provider reference decoder',async()=>{
 const calls=[];const entry={module:{scrapeServers:async()=>[{url:'https://player.example/embed/2',type:'embed'}],resolveStream:async target=>{if(target!=='https://source.example/episode')throw Error('INVALID_PROVIDER_REFERENCE');return null;}}};
 const rows=await resolveProviderMedia(entry,'https://source.example/episode',{resolveEmbed:async(target,parent,deadline)=>{calls.push({target,parent,deadline});return[{url:'https://cdn.example/master.m3u8'}]}});
 assert.equal(rows.length,1);assert.equal(calls[0].target,'https://player.example/embed/2');assert.equal(calls[0].parent,'https://source.example/');assert(Number.isFinite(calls[0].deadline));
});
test('all direct qualities are inspected with bounded probe concurrency',async()=>{
 let active=0,peak=0;const sources=Array.from({length:60},(_,i)=>({url:`https://cdn.example/${i}.mp4`}));
 const rows=await resolveProviderMedia({module:{}},'provider:episode',{details:{media_sources:sources},accept:async candidates=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return candidates;}});
 assert.equal(rows.length,60);assert(peak<=2);assert.equal(rows._meta.inspected_media_candidates,60);
});
test('a probe deadline retains usable sources but never claims all observed qualities were inspected',async()=>{
 let clock=0;const rows=await resolveProviderMedia({module:{}},'provider:episode',{now:()=>clock,resolverBudgetMs:1000,details:{media_sources:Array.from({length:20},(_,i)=>({url:`https://cdn.example/${i}.mp4`}))},accept:async candidates=>{clock+=600;return candidates;}});
 assert(rows.length>0&&rows.length<20);assert.equal(rows._meta.server_scan_complete,false);assert.equal(rows._meta.observed_media_candidates,20);
});
