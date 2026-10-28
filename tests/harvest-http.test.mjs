import test from'node:test';import assert from'node:assert/strict';import{createServer}from'../server/app.mjs';import{createMitvRuntimeServer}from'../server/index-runtime.mjs';
async function run(service,action){const base=createServer({harvestService:{start(){},async stop(){},...service}}),server=createMitvRuntimeServer({baseServer:base,tmdbRuntime:{details:async()=>({status:'success',data:{title:'وادي الذئاب',seasons:[{season_number:1,episode_count:20},{season_number:2,episode_count:35},{season_number:3,episode_count:31},{season_number:4,episode_count:11}]}})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await action('http://127.0.0.1:'+server.address().port)}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('opening metadata starts harvest without blocking TMDB data and explicit favorite requests are separate',async()=>{
 const calls=[];await run({cachedWork:async()=>null,requestWork:async(ref,options)=>{calls.push({ref,...options});return{ref,state:'queued'}}},async base=>{
  const metadata=await(await fetch(base+'/api/v1/tmdb/details?ref=tmdb:tv:34587')).json();assert.equal(metadata.data.title,'وادي الذئاب');assert.equal(metadata.data.source_index_authoritative,true);assert.equal(metadata.data.seasons.length,4);assert.deepEqual(calls[0],{ref:'tmdb:tv:34587',reason:'card_open'});
  const request=await fetch(base+'/api/v1/harvest/request?ref=3cktv%3Aobserved&reason=favorite',{method:'POST'});assert.equal(request.status,202);assert.equal(calls[1].ref,'3cktv:observed');assert.equal(calls[1].reason,'favorite');
  assert.equal((await fetch(base+'/api/v1/harvest/request?ref=tmdb:tv:34587')).status,405);
 });
});
test('support report endpoint requires the admin key and strips private values from the exported file',async()=>{
 const previous=process.env.DIAGNOSTICS_TOKEN;process.env.DIAGNOSTICS_TOKEN='fixture-admin-key-at-least-32-characters';let summaries=0;
 try{await run({summary:async()=>{summaries++;return{configured:true,jobs:[{job_key:'internal',content_ref:'tmdb:tv:34587',provider:'3cktv',stage:'episode',status:'failed',error_code:'NETWORK_TIMEOUT',payload:{token:'fixture-private-token'}}],events:[],sources:[],works:[],providers:[]}}},async base=>{
  assert.equal((await fetch(base+'/api/v1/admin/report')).status,401);assert.equal(summaries,0);
  const response=await fetch(base+'/api/v1/admin/report',{headers:{Authorization:'Bearer fixture-admin-key-at-least-32-characters'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/attachment/);const body=await response.text();assert(!body.includes('fixture-admin-key-at-least-32-characters'));assert(!body.includes('fixture-private-token'));const report=JSON.parse(body);assert.equal(report.schema_version,1);assert(report.report_ref);assert.equal(report.findings[0].code,'NETWORK_TIMEOUT');
 });}finally{if(previous===undefined)delete process.env.DIAGNOSTICS_TOKEN;else process.env.DIAGNOSTICS_TOKEN=previous;}
});
