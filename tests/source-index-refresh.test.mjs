import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceApi} from '../server/harvest/source-api.mjs';
import {workReference} from '../server/harvest/work-reference.mjs';

test('manual indexing queues only the selected source work and rejects a canonical all-provider refresh',async()=>{
  const source='ahwak:'+Buffer.from('https://yam.ahwaktv.net/view-serie.php?name=khamsin-khamsin-series').toString('base64url');
  const ref=workReference(source),jobs=[];let wake=0;
  const api=createSourceApi({now:()=>1730000000000,worker:{wake(){wake++}},store:{
    async request(){return[]},async getWork(){return{title:'خمسين خمسين',metadata:{source_ref:source}}},
    async enqueue(job){jobs.push(job)},
  }});
  const admitted=await api.requestWork(ref,{reason:'source_refresh'});
  assert.equal(jobs.length,1);assert.equal(jobs[0].provider,'ahwak');assert.equal(jobs[0].stage,'work');
  assert.equal(jobs[0].payload.source_ref,source);assert.equal(admitted.requested_at,jobs[0].payload.refresh_requested_at);
  await api.requestWork(ref,{reason:'source_refresh'});assert.equal(jobs.length,1,'deduplicate repeated clicks');
  await assert.rejects(api.requestWork('tmdb:tv:42',{reason:'source_refresh'}),/SOURCE_WORK_REQUIRED/);
  assert.equal(jobs.length,1);assert(wake>0);
});

test('index refresh remains pending through selected-source pagination, without waiting for media jobs',async()=>{
  const ref='source:ahwak:aaaaaaaaaaaaaaaaaaaaaaaa';let status='queued';
  const api=createSourceApi({worker:{wake(){}},store:{
    async getWork(){return{metadata:{index_started_at:'cycle-new'},last_checked_at:'2026-11-04T12:00:01Z'}},
    async request(table){return table==='matv_discovery_jobs'?[
      {stage:'work',status:'ready'},
      {stage:'provider',status,payload:{phase:'source_page',catalog_started_at:'cycle-new'}},
      {stage:'provider',status:'failed',payload:{phase:'source_page',catalog_started_at:'cycle-old'}},
      {stage:'episode',status:'running'},
    ]:[]},
  }});
  assert.equal((await api.workStatus(ref)).index_state,'queued');
  status='running';assert.equal((await api.workStatus(ref)).index_state,'running');
  status='ready';assert.equal((await api.workStatus(ref)).index_state,'ready');
});

test('source cards expose their observed state without implying every unavailable index is running',async()=>{
 const ref='source:ahwak:aaaaaaaaaaaaaaaaaaaaaaaa';
 const api=createSourceApi({worker:{wake(){}},store:{
  async getWork(){return{title:'عمل',metadata:{}}},
  async request(table){return table==='najd_source_catalog'?[{provider:'ahwak',state:'identity_unconfirmed',progress:{source_work_ref:ref,title:'عمل'}}]:[]},
 }});
 const status=await api.workStatus('tmdb:tv:42');
 assert.equal(status.source_editions.length,1);
 assert.equal(status.source_editions[0].state,'identity_unconfirmed');
 assert.equal(status.source_editions[0].available,false);
 assert.equal(status.source_editions[0].reason,'CANONICAL_IDENTITY_UNCONFIRMED');
});
