import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentDiscovery, matchesIdentity, selectEpisode, directCandidate } from '../server/scrapers/content-discovery.mjs';
import { createConcurrencyQueue } from '../server/scrapers/shared/concurrency.mjs';
const hit = { title: 'Example', year: 2025, type: 'series', url: 'show' };
function entry(id, { hits = [hit], episodes = [], fail = false, delay = async () => {} } = {}) {
  return {meta:{id,code:id,capabilities:{search:true,details:true}},module:{
    scrapeSearch: async () => { await delay(); if(fail) throw Error('unavailable'); return hits; },
    scrapeDetails: async target => target === 'show' ? {type:'series',episodes,servers:[]} : {servers:[{url:`https://media.example/${target}.mp4`}]},
  }};
}
test('requires title and known year/type; never uses an unrelated first hit', () => {
  assert.equal(matchesIdentity({title:'Other',year:2025},'Example',{year:2025}),false);
  assert.equal(matchesIdentity({...hit,year:2024},'Example',{year:2025}),false);
  assert.equal(matchesIdentity({...hit,year:null},'Example',{year:2025}),false);
  assert.equal(matchesIdentity(hit,'Example',{year:2025,type:'movie'}),false);
  assert.equal(matchesIdentity(hit,'Example',{year:2025,type:'series'}),true);
});
test('selects exact season AND episode, never the first episode', async () => {
  const episodes=[{season:1,number:2,url:'wrong'},{season:2,number:2,url:'right'}];
  assert.equal(selectEpisode(episodes,2,2).url,'right');
  assert.equal(selectEpisode(episodes,2,3),undefined);
  const runtime=createContentDiscovery({entries:[entry('a',{episodes})]});
  assert.deepEqual(await runtime.discover('Example',2,3,{year:2025,type:'series'}),[]);
  const results=await runtime.discover('Example',2,2,{year:2025,type:'series'});
  assert.equal(results[0].url,'https://media.example/right.mp4');
  assert.equal(results[0].season,2);
});
test('runs providers concurrently within budget and isolates failure', async () => {
  let active=0,peak=0;
  const delay=async()=>{ active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--; };
  const episodes=[{season:1,number:1,url:'episode'}];
  const entries=Array.from({length:12},(_,i)=>entry(String(i),{delay,episodes,fail:i===1}));
  const result=await createContentDiscovery({entries,concurrency:3}).discover('Example',1,1,{year:2025});
  assert.equal(result.length,11);assert.equal(peak,3);
});
test('direct media extension belongs to path, embed and fake direct labels rejected', () => {
  assert.equal(directCandidate({url:'https://media.example/player?x=.mp4',kind:'direct'}),false);
  assert.equal(directCandidate({url:'https://media.example/movie.mp4',kind:'embed'}),false);
  assert.equal(directCandidate({url:'https://media.example/movie.m3u8?token=x'}),true);
});
test('queue transfers reserved slot, bounds pressure, releases on failure', async () => {
  const queue=createConcurrencyQueue({concurrency:1,maxQueued:1});
  let release;const first=queue.run(()=>new Promise(r=>{release=r;}));
  const second=queue.run(async()=>{throw Error('task failure');});
  await assert.rejects(queue.run(async()=>{}),/SERVER_BUSY_QUEUE_FULL/);
  release(); await first; await assert.rejects(second,/task failure/);
  await queue.run(async()=>{});assert.deepEqual(queue.metrics(),{active:0,queued:0});
});
