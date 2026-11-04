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
