import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackClient,browserDirectSource} from '../web/core/playback-client.js';
const media={url:'https://media.example/movie.mp4',kind:'direct'};
const item={id:'tmdb:tv:309328',title:'تحت الأرض',year:2026,type:'series'};
function fixture(states){let count=0;const calls=[];let clock=0;return{calls,client:createPlaybackClient({now:()=>clock,pollMs:1,delay:async()=>{clock++;},fetchImpl:async(url,init)=>{
 calls.push({url:new URL(url),method:init.method});const start=url.pathname.endsWith('start');return{ok:true,json:async()=>({data:start?{state:'queued'}:states[Math.min(count++,states.length-1)]})};}})};}
test('polls background job, returns exact requested episode and first partial result',async()=>{
 const {client,calls}=fixture([{state:'running'},{state:'running',result:{servers:[media]}}]);
 const states=[];const result=await client.resolve(item,{season:2,episode:4,onState:value=>states.push(value.state)});
 assert.equal(result.state,'ready');assert.equal(result.servers.length,1);
 assert.equal(calls[0].method,'POST');assert.equal(calls[0].url.searchParams.get('episode'),'4');
 assert.equal(calls[0].url.searchParams.get('season'),'2');assert(!calls.some(x=>x.url.hostname==='127.0.0.1'));
 assert(states.includes('resolving'));
});
test('empty completion is terminal, never a perpetual preparation message',async()=>{
 const {client}=fixture([{state:'ready',result:{servers:[],reason:'IDENTITY_NOT_VERIFIED'}}]);
 const result=await client.resolve(item);assert.equal(result.state,'unavailable');assert.equal(result.reason,'IDENTITY_NOT_VERIFIED');
});
test('pinned source never resolves an arbitrary merged alternative',async()=>{
 const calls=[];const client=createPlaybackClient({fetchImpl:async(url)=>{calls.push(new URL(url));return{ok:true,json:async()=>({servers:[media]})};}});
 const result=await client.resolve({id:'mycima:reference',mergedRefs:['akwam:wrong'],type:'series',selected_source:'mycima'},{season:3,episode:7});
 assert.equal(result.state,'ready');assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('ref'),'mycima:reference');assert.equal(calls[0].pathname,'/api/v1/playback');
});
test('navigation cancellation aborts outstanding work',async()=>{
 const controller=new AbortController();controller.abort();
 const client=createPlaybackClient({fetchImpl:async()=>{throw Error('must not fetch');}});
 await assert.rejects(client.resolve(item,{signal:controller.signal}),{name:'AbortError'});
});
test('rejects iframe, fake direct query, browser-required headers and expired media',()=>{
 assert.equal(browserDirectSource({url:'https://example.com/player?file=.mp4',kind:'direct'}),null);
 assert.equal(browserDirectSource({...media,headers:{Referer:'https://provider.example'}}),null);
 assert.equal(browserDirectSource({...media,type:'embed'}),null);
 assert.equal(browserDirectSource({...media,expires_at:new Date(0).toISOString()}),null);
});
