import test from 'node:test';
import assert from 'node:assert/strict';
import {createTmdbRuntime} from '../server/tmdb-runtime.mjs';

test('search preserves actual pages and caches each page for thirty minutes', async()=>{
 let clock=1000;const calls=[];
 const runtime=createTmdbRuntime({apiKey:'fixture-key',backupApiKey:'',bearerToken:'',now:()=>clock,
  fetchImpl:async input=>{const url=new URL(input);const page=Number(url.searchParams.get('page'));calls.push(page);
   return {ok:true,status:200,json:async()=>({page,total_pages:3,results:[{id:page,title:'Title '+page,media_type:'movie',release_date:'2025-01-01'}]})};}});
 assert.equal((await runtime.search('Title',{page:1})).pagination.has_more,true);
 assert.equal((await runtime.search('Title',{page:2})).data[0].id,'2');
 clock+=29*60_000;await runtime.search('Title',{page:1});assert.deepEqual(calls,[1,2]);
 clock+=60_001;await runtime.search('Title',{page:1});assert.deepEqual(calls,[1,2,1]);
 assert.equal((await runtime.search('Title',{page:3})).pagination.has_more,false);
 for(const page of [0,-1,501,1.5,'2'])await assert.rejects(runtime.search('Title',{page}),/TMDB_BAD_PAGE/);
});
