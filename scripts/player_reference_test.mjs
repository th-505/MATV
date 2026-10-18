import assert from 'node:assert/strict';
import {resolveUnifiedServersForItem} from '../web/core/ma-nexus.js';
import {createServer} from '../server/app.mjs';
const originalFetch=globalThis.fetch;
const requests=[];
try {
  globalThis.fetch=async input=>{
    const url=new URL(input);requests.push(url);
    if(url.pathname==='/v1/resolve') return Response.json({sources:[]});
    if(url.pathname==='/api/v1/resolve') return Response.json({servers:[{provider:'akwam',code:'AK-7',kind:'direct',url:'https://media.example/work.m3u8'}]});
    if(url.origin==='https://media.example') return new Response('',{status:200});
    throw Error('UNEXPECTED_NETWORK');
  };
  const rows=await resolveUnifiedServersForItem({id:'opaque-card-id',href:'akoam:original-work',title:'Original title'},1,1,'https://backend.example');
  const request=requests.find(url=>url.pathname==='/api/v1/resolve');
  assert.equal(request.searchParams.get('ref'),'akoam:original-work');
  assert.equal(request.searchParams.get('id'),'opaque-card-id');
  assert.equal(rows[0].code,'AK-7');
  assert.equal(requests.some(url=>url.hostname==='127.0.0.1'||url.hostname.includes('themoviedb')),false);
} finally {globalThis.fetch=originalFetch;}
const server=createServer({catalogStore:null,providerDetails:async()=>{throw Error('SOURCE_UNAVAILABLE');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let externalCalls=0;
try {
  globalThis.fetch=async()=>{externalCalls++;throw Error('NO_EXTERNAL_FALLBACK');};
  const response=await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1/resolve?ref=mycima:original&title=Different%20work`);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).servers,[]);
  assert.equal(externalCalls,0,'a failed original reference must not select another work by title');
} finally {globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));}
console.log('Player references: original ref over card ID, original server code, no localhost/TMDb guessing, no unrelated-work fallback passed');
