import test from 'node:test';import assert from 'node:assert/strict';
import {fetchSafeResponse} from '../server/scrapers/shared/http.mjs';
test('HTML requests honor the caller byte budget instead of silently using the global8MiB default',async()=>{
 await assert.rejects(fetchSafeResponse('https://budget.example/page',{allowHttp:false,skipDnsResolution:true,maxRetries:0,maxBytes:64,fetchImpl:async()=>new Response('x'.repeat(128),{status:200,headers:{'content-type':'text/html'}})}),/UPSTREAM_BODY_TOO_LARGE/);
});
