import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {protectServer} from '../server/security-boundary.mjs';
import {getClientAddress} from '../server/hardening.mjs';
import {readBoundedText} from '../server/scrapers/shared/http.mjs';
test('security boundary covers intercepted routes, rejects foreign origins, spoofing cannot reset limit',async()=>{
 const s=protectServer(createServer((req,res)=>res.end('ok')),{max:2});
 await new Promise(r=>s.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+s.address().port;
 try {
  for(const origin of ['https://attacker.github.io','https://th-505.github.io.evil.test'])assert.equal((await fetch(base+'/api/v1/tmdb/status',{headers:{origin}})).status,403);
  const a=await fetch(base+'/health',{headers:{origin:'https://th-505.github.io','x-forwarded-for':'1.2.3.4'}});assert.equal(a.status,200);assert.equal(a.headers.get('x-content-type-options'),'nosniff');assert.equal(a.headers.get('x-frame-options'),'DENY');
  assert.equal((await fetch(base+'/api/v1/tmdb/status',{headers:{'x-forwarded-for':'2.3.4.5'}})).status,200);
  assert.equal((await fetch(base+'/api/v1/fallback/status',{headers:{'x-forwarded-for':'3.4.5.6'}})).status,429);
 }finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
test('forwarded client address defaults to socket, Render uses appended verified peer',()=>{
 const previous=process.env.RENDER;try{delete process.env.RENDER;const req={headers:{'x-forwarded-for':'1.2.3.4, 5.6.7.8'},socket:{remoteAddress:'127.0.0.1'}};assert.equal(getClientAddress(req),'127.0.0.1');process.env.RENDER='true';assert.equal(getClientAddress(req),'5.6.7.8');}finally{if(previous===undefined)delete process.env.RENDER;else process.env.RENDER=previous;}
});
test('upstream size bound rejects declared and chunked decompressed overflow',async()=>{
 await assert.rejects(readBoundedText(new Response('12345',{headers:{'content-length':'5'}}),4),/TOO_LARGE/);
 await assert.rejects(readBoundedText(new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(5));c.close();}})),4),/TOO_LARGE/);
 assert.equal(await readBoundedText(new Response('صالح'),20),'صالح');
});
