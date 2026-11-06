// Isolated synthetic HTTP load against the real router and Beta service; no external DB/provider traffic.
import {createServer} from '../server/app.mjs';
import http from 'node:http';
import {createBrowserWorkService} from '../server/browser/service.mjs';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
const origin='https://mycima.gdn',work=origin+'/series/fixture/',source='mycima:'+Buffer.from(work).toString('base64url');
const html='<h1>Load Fixture</h1><div class="episodes-list"><a href="/watch/fixture/episode-1/">Load Fixture الحلقة 1</a></div>';
let detailsCalls=0,probes=0;
const browser=createBrowserWorkService({store:null,lookup:()=>({meta:{id:'mycima',domains:[origin]},module:{
 scrapeDetails:async()=>{detailsCalls++;return{title:'Load Fixture',type:'series',episodes:[],sourceUrl:work}},
 scrapeServers:async()=>[{url:'https://cdn.example/fixture.mp4'}],
}}),fetchPage:async url=>({html,url}),probe:async()=>{probes++;return{playable:true,container_verified:true,webPlayable:true}}});
const server=createServer({catalogStore:null,harvestService:{start(){},async stop(){}},browserConfigurationService:{async refresh(){},close(){}},browserWorkService:browser});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const admitted=await browser.request(source);await browser.settle();
const route='/api/v1/browser/work?'+new URLSearchParams({ref:admitted.ref});
const percentile=(xs,p)=>xs.length?xs[Math.min(xs.length-1,Math.floor(xs.length*p))]:null;
async function phase(concurrency,durationMs){
 const end=performance.now()+durationMs,latencies=[],status={};
 await Promise.all(Array.from({length:concurrency},async(_,index)=>{
  const agent=new http.Agent({keepAlive:true,localAddress:`127.0.0.${index+2}`});
  try{while(performance.now()<end){const start=performance.now();try{
    const code=await new Promise((resolve,reject)=>{const request=http.get(base+route,{agent},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.setTimeout(5000,()=>request.destroy(Error('LOCAL_TEST_TIMEOUT')));});
    status[code]=(status[code]||0)+1;
   }catch{status.network_error=(status.network_error||0)+1;}
   latencies.push(performance.now()-start);
   await new Promise(r=>setTimeout(r,Math.max(0,1000-(performance.now()-start))));
  }}finally{agent.destroy();}
 }));
 return{concurrency,duration_ms:durationMs,latencies,status};
}
const soakMs=Math.min(300000,Math.max(30000,Number(process.env.NAJD_SOAK_MS)||30000));
const profiles=[['load',[[8,3000]]],['stress',[[64,3000]]],['spike',[[4,1000],[64,1000],[4,1000]]],[soakMs===30000?'short_soak':'soak_5min',[[8,soakMs]]]],results=[];
try{
 for(const[name,stages]of profiles){
  global.gc?.();const before=process.memoryUsage(),cpu=process.cpuUsage(),start=performance.now(),delay=monitorEventLoopDelay({resolution:20});delay.enable();
  const samples=[];for(const[vu,ms]of stages)samples.push(await phase(vu,ms));
  delay.disable();global.gc?.();const after=process.memoryUsage(),used=process.cpuUsage(cpu),latencies=samples.flatMap(x=>x.latencies).sort((a,b)=>a-b),status={};for(const sample of samples)for(const[k,v]of Object.entries(sample.status))status[k]=(status[k]||0)+v;
  const result={profile:name,stages:stages.map(([concurrency,duration_ms])=>({concurrency,duration_ms})),requests:latencies.length,status,p50_ms:percentile(latencies,.5),p95_ms:percentile(latencies,.95),p99_ms:percentile(latencies,.99),elapsed_ms:performance.now()-start,cpu_ms:(used.user+used.system)/1000,heap_delta_bytes:after.heapUsed-before.heapUsed,event_loop_p95_ms:delay.percentile(95)/1e6};results.push(result);console.log(JSON.stringify(result));
 }
 const report={observed_at:new Date().toISOString(),basis:'Synthetic virtual users on loopback, actual Najd HTTP router/Beta indexing and cache, injected public markup and media probe; no humans, real provider load or Supabase load. The bounded soak is not a multi-hour endurance guarantee. Single process with distinct loopback addresses per virtual user, paced at one request/second/user; production IP rate limiter remains enabled. No production capacity certification.',details_calls:detailsCalls,media_probes:probes,results};
 const folder=process.env.NAJD_LOAD_OUTPUT||'/tmp/najd300';mkdirSync(folder,{recursive:true});writeFileSync(folder+'/load-profiles.json',JSON.stringify(report,null,2)+'\n');
 if(results.some(r=>Object.keys(r.status).some(s=>s!=='200')))process.exitCode=1;
}finally{await new Promise(r=>server.close(r));}
