import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchTraces, searchTraceEvent, safeSearchUrl } from '../server/diagnostics/search-trace.mjs';
import { createSourceSearch } from '../server/scrapers/source-registry.mjs';
import { createEmptyArrayResult } from '../server/scrapers/shared/errors.mjs';
import { fetchSafeResponse } from '../server/scrapers/shared/http.mjs';
import { createServer } from '../server/app.mjs';
test('concurrent searches retain only their own transport events; bounded retention and no credential URLs',async()=>{
 let time=100;const logs=[];const s=createSearchTraces({maxEntries:2,ttlMs:1000,now:()=>time,logger:e=>logs.push(e)});
 const a=s.start({provider:'akwam',query:'private title'}),b=s.start({provider:'3isk',query:'other'});
 await Promise.all([s.run(a,async()=>{await new Promise(r=>setTimeout(r,8));searchTraceEvent('parser_result',{raw_count:1});return [1]}),s.run(b,async()=>{searchTraceEvent('upstream_error',{reason:'ACCESS_BLOCKED'});throw Object.assign(Error('ACCESS_BLOCKED'),{code:'ACCESS_BLOCKED'})}).catch(()=>{})]);
 assert(!s.list({id:a.id})[0].events.some(e=>e.reason==='ACCESS_BLOCKED'));
 assert(!JSON.stringify(logs).includes('private title'));
 assert.equal(safeSearchUrl('https://site.test/?s=name&token=SECRET&api_key=SECRET#private'),'https://site.test/?s=name');
 assert.equal(safeSearchUrl('https://user:secret@site.test'),null);
 s.start({provider:'x',query:'x'});assert.equal(s.list().length,2);time+=1001;assert.equal(s.list().length,0);
});
test('scraper metadata errors never become successful no-result searches',async()=>{
 const search=createSourceSearch({loadModule:()=>({scrapeSearch:async()=>createEmptyArrayResult('akwam','ACCESS_BLOCKED','secret message')})});
 await assert.rejects(search('test','akwam'),{code:'ACCESS_BLOCKED'});
});
test('actual redirects, HTTP responses and parser filtering are observable',async()=>{
 const s=createSearchTraces();const t=s.start({provider:'akwam',query:'اختبار'});let calls=0;
 await s.run(t,async()=>{await fetchSafeResponse('https://source.example/?s=test',{maxRetries:0,fetchImpl:async()=>++calls===1?new Response(null,{status:302,headers:{location:'https://source.example/search?q=test&token=SECRET'}}):new Response('<title>Search</title>',{status:200,headers:{'content-type':'text/html'}})});return []});
 assert(t.events.some(e=>e.stage==='upstream_redirect'));
 assert(t.events.some(e=>e.stage==='upstream_response'&&e.status===200));
 assert(!JSON.stringify(t).includes('SECRET'));
});
test('admin-only trace access, request ID correlation and upstream failure HTTP semantics',async()=>{
 const previous=process.env.DIAGNOSTICS_TOKEN;process.env.DIAGNOSTICS_TOKEN='test-only-admin-token-long-enough';
 const server=createServer({searchPinned:async()=>{throw Object.assign(Error('ACCESS_BLOCKED'),{code:'ACCESS_BLOCKED'})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/v1/diagnostics/searches')).status,401);
  const r=await fetch(base+'/api/v1/explore?provider=akwam&q=title&platform=tv&diagnostic_session=12345678-1234-1234-1234-123456789abc');const d=await r.json();
  assert.equal(r.status,503);assert.equal(r.headers.get('x-trace-id'),d.trace_id);assert.equal(d.reason,'ACCESS_BLOCKED');
  const data=await(await fetch(base+'/api/v1/diagnostics/searches?id='+d.trace_id,{headers:{authorization:'Bearer '+process.env.DIAGNOSTICS_TOKEN}})).json();
  assert.equal(data.items.length,1);assert.equal(data.items[0].platform,'tv');assert.equal(data.items[0].state,'error');assert(data.items[0].events.some(e=>e.stage==='response_finished'));
 }finally{process.env.DIAGNOSTICS_TOKEN=previous||'';server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('real-site search parameter regressions: q, keywords, and Arabic reserved characters', async()=>{
 const shahid=await import('../server/scrapers/sites/shahid4u.mjs');
 const qfilm=await import('../server/scrapers/sites/qfilm.mjs');
 const mycima=await import('../server/scrapers/sites/mycima.mjs');
 const a=await shahid.scrapeSearch('Test & اختبار',1,{fixtureHtml:'<article class="br-card"><a href="/film-test/"><h3 class="br-card-title">Test &amp; اختبار</h3></a></article>'});
 assert.equal(a.length,1);assert.equal(new URL(a._meta.url).searchParams.get('q'),'Test & اختبار');
 const b=await qfilm.scrapeSearch('Test & اختبار',1,{fixtureHtml:'<div class="pm-video-thumb"><a href="/watch.php?vid=abc"><img data-echo="https://a.qfilm.tv/img.jpg" alt="Test &amp; اختبار"></a></div>'});
 assert.equal(b.length,1);assert.equal(new URL(b._meta.url).pathname,'/search.php');assert.equal(new URL(b._meta.url).searchParams.get('keywords'),'Test & اختبار');
 const c=await mycima.scrapeSearch('Test & اختبار',1,{fixtureHtml:'<div class="GridItem"><a href="/watch/test/"><strong class="hasyear">Test &amp; اختبار</strong></a></div>'});
 assert.equal(new URL(c._meta.url).pathname,'/filtering');assert.equal(new URL(c._meta.url).searchParams.get('keywords'),'Test & اختبار');
});
test('a 200 login or suspended page is not a successful empty catalogue',async()=>{
 for(const [url,html] of [['https://source.example/signin/','<input type="password">'],['https://source.example/','<title>Account Suspended</title>']]){
  await assert.rejects(fetchSafeResponse(url,{maxRetries:0,fetchImpl:async()=>new Response(html,{status:200})}),{code:'ACCESS_BLOCKED'});
 }
});
