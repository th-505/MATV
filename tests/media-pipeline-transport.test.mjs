import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter}from'node:events';
import{readHttps,assertPublicHttpsUrl,isPublicAddress}from'../server/media-pipeline/transport/https.mjs';
const lookup=async()=>[{address:'1.1.1.1',family:4}];
function mockRequest(rows,calls=[]){return(target,options,callback)=>{
 const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=e=>queueMicrotask(()=>req.emit('error',e));req.end=()=>queueMicrotask(()=>{calls.push({url:target.href,options});const row=rows[target.href];if(!row){req.emit('error',Error('unexpected'));return;}const res=new EventEmitter();res.statusCode=row.status||200;res.headers=row.headers||{};res.destroy=()=>{};callback(res);if(res.statusCode===200){res.emit('data',Buffer.from(row.body||''));res.emit('end');}});return req;
};}
test('new transport rejects private and encoded private URL forms',()=>{
 for(const value of ['https://127.0.0.1/','https://2130706433/','https://[::1]/','https://[::ffff:127.0.0.1]/','https://[::127.0.0.1]/','https://[64:ff9b::7f00:1]/','http://example.com','https://u:p@example.com','https://example.com:8443'])assert.throws(()=>assertPublicHttpsUrl(value),value);
 assert(isPublicAddress('1.1.1.1'));assert(isPublicAddress('2606:4700:4700::1111'));assert(!isPublicAddress('2002:7f00:1::'));
});
test('mixed public/private DNS answers are rejected before connecting',async()=>{
 let calls=0;await assert.rejects(()=>readHttps('https://cdn.example/',{lookup:async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}],request:()=>calls++}),{code:'TRANSPORT_UNSAFE_DNS'});assert.equal(calls,0);
});
test('new transport strips credentials across observed redirects and pins DNS',async()=>{
 const calls=[],r=await readHttps('https://cdn.example/a',{lookup,headers:{Cookie:'secret',Authorization:'Bearer secret',Referer:'https://source.example/'},request:mockRequest({'https://cdn.example/a':{status:302,headers:{location:'https://other.example/b'}},'https://other.example/b':{body:'video'}},calls)});
 assert.equal(r.bytes.toString(),'video');assert.equal(calls[1].options.headers.Cookie,undefined);assert.equal(calls[1].options.headers.Authorization,undefined);
 await new Promise(resolve=>calls[1].options.lookup('other.example',{},(_err,address)=>{assert.equal(address,'1.1.1.1');resolve();}));
});
test('redirects cannot reach private IPs; binary reads enforce size and prefix',async()=>{
 await assert.rejects(()=>readHttps('https://cdn.example/a',{lookup,request:mockRequest({'https://cdn.example/a':{status:302,headers:{location:'https://127.0.0.1/'}}})}),{code:'TRANSPORT_UNSAFE_URL'});
 const rows={'https://cdn.example/a':{body:'0123456789'}};
 await assert.rejects(()=>readHttps('https://cdn.example/a',{lookup,maxBytes:4,request:mockRequest(rows)}),{code:'TRANSPORT_BODY_LIMIT'});
 const result=await readHttps('https://cdn.example/a',{lookup,maxBytes:4,prefixBytes:4,request:mockRequest(rows)});assert.equal(result.bytes.toString(),'0123');
});
