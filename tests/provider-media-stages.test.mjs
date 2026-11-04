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
