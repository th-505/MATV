import test from'node:test';import assert from'node:assert/strict';
import{probeHarvestMedia}from'../server/harvest/media-probe.mjs';
import{fetchSafeResponse}from'../server/scrapers/shared/http.mjs';
const candidate={url:'https://cdn.example/video.mp4',headers:{Referer:'https://source.example/'}};
const headProbe=async()=>({playable:true,container:'mp4',webPlayable:false,statusCode:200});
test('successful HEAD cannot certify HTML, empty or broken container bytes',async()=>{
 for(const bytes of [Buffer.from('<html>blocked</html>'),Buffer.alloc(0),Buffer.from('not a video')])assert.equal((await probeHarvestMedia(candidate,{headProbe,fetchImpl:async()=>({status:206,bytes})})).playable,false);
 const bytes=Buffer.from('000000186674797069736f6d00000001','hex');
 const result=await probeHarvestMedia(candidate,{headProbe,fetchImpl:async(_url,options)=>{assert.equal(options.headers.Referer,candidate.headers.Referer);assert.equal(options.headers.Range,'bytes=0-32767');return{status:206,bytes}}});
 assert.equal(result.container_verified,true);assert.equal(result.webPlayable,false);
});
test('binary prefix cancels an ignored Range without corrupting bytes or reading a large response',async()=>{
 let cancelled=false,reads=0;
 const body=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(8192).fill(255));},cancel(){cancelled=true}});
 const r=await fetchSafeResponse(candidate.url,{allowHttp:false,responseType:'bytes',prefixBytes:10000,maxRetries:0,fetchImpl:async()=>new Response(body,{headers:{'content-type':'video/mp4','content-length':'2000000000'}})});
 assert.equal(r.bytes.length,10000);assert.equal(r.bytes[0],255);assert.equal(r.html,'');assert.equal(cancelled,true);assert(reads<=4);
});
test('binary mode still blocks unsafe redirect targets before fetching them',async()=>{
 let calls=0;await assert.rejects(()=>fetchSafeResponse(candidate.url,{allowHttp:false,responseType:'bytes',prefixBytes:10000,maxRetries:0,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}})}}));assert.equal(calls,1);
});
