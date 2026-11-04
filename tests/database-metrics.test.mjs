import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabaseMetrics} from '../server/diagnostics/database-metrics.mjs';
test('private metrics are single-flight and rate bounded, with CPU derived from two samples',async()=>{
 let clock=0,calls=0;
 const read=createDatabaseMetrics({url:'https://fixture.supabase.co',key:'sb_secret_private',now:()=>clock,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url.pathname,'/customer/v1/privileged/metrics');assert.equal(options.redirect,'error');
  const n=calls===1?[80,20]:[140,60];
  return new Response(`node_cpu_seconds_total{cpu="0",mode="idle"} ${n[0]}\nnode_cpu_seconds_total{cpu="0",mode="user"} ${n[1]}\nprivate_metric{secret="never-return-this"} 1`);
 }});
 const first=await Promise.all([read(),read(),read()]);assert.equal(calls,1);assert.equal(first[0].cpu_percent,null);
 await read();assert.equal(calls,1);clock=60001;const next=await read();assert.equal(next.cpu_percent,40);assert.equal(calls,2);assert(!JSON.stringify(next).includes('private'));
});
test('metrics refuse unsafe URLs, hide upstream bodies and back off failures',async()=>{
 let calls=0;const unsafe=createDatabaseMetrics({url:'http://localhost',key:'secret',fetchImpl:async()=>{calls++;}});
 assert.equal((await unsafe()).reason,'METRICS_BAD_URL');assert.equal(calls,0);
 const read=createDatabaseMetrics({url:'https://fixture.supabase.co',key:'secret',fetchImpl:async()=>{calls++;return new Response('secret body',{status:503})}});
 assert.deepEqual(await read(),{state:'unavailable',cpu_percent:null,reason:'METRICS_HTTP_503'});await read();assert.equal(calls,1);
});

test('an exporter without CPU counters never reports a zero or a successful sample',async()=>{
 const read=createDatabaseMetrics({url:'https://fixture.supabase.co',key:'secret',fetchImpl:async()=>new Response('other_metric 1')});
 const result=await read();assert.equal(result.state,'unavailable');assert.equal(result.cpu_percent,null);assert.equal(result.reason,'CPU_METRIC_UNAVAILABLE');
});
