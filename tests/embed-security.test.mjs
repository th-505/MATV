import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchEmbedResponse, cascadeResolveStream, isValidDirectMediaUrl, unpackDeanEdwards} from '../server/scrapers/stream-unwrapper.mjs';
test('recursive embed resolver rejects private addresses and encoded bridges before network access',async()=>{
 for(const u of ['http://127.0.0.1/video.mp4','https://169.254.169.254/latest/meta-data','https://[::1]/embed/1','https://public.example/play?url='+Buffer.from('https://127.0.0.1/embed/1').toString('base64url')])assert.deepEqual(await cascadeResolveStream(u),[]);
 assert.equal(isValidDirectMediaUrl('https://127.0.0.1/video.mp4'),false);
 assert.equal(isValidDirectMediaUrl('https://user:pass@media.example/video.mp4'),false);
});
test('embed HTTP adapter validates redirect hops, DNS targets and decompressed body size',async()=>{
 let calls=0;const response=()=>{calls++;return new Response(null,{status:302,headers:{location:'https://169.254.169.254/latest/meta-data'}})};
 await assert.rejects(fetchEmbedResponse('https://embed.example/e/1',{fetchImpl:response}),/PRIVATE|LOCAL|UNSAFE/);assert.equal(calls,1);
 calls=0;await assert.rejects(fetchEmbedResponse('https://embed.example/e/1',{dnsLookupImpl:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:async()=>{calls++;return new Response('bad')}}),/PRIVATE/);assert.equal(calls,0);
 await assert.rejects(fetchEmbedResponse('https://embed.example/e/1',{fetchImpl:async()=>new Response('x',{headers:{'content-length':String(9*1024*1024)}})}),/TOO_LARGE/);
});
test('untrusted packed metadata has bounded radix/count and literal substitutions',()=>{
 const packed=(radix,count,words,body='0')=>`eval(function(p,a,c,k,e,d){return p}('${body}',${radix},${count},'${words}'.split('|')))`;
 assert.equal(unpackDeanEdwards(packed(1,1,'bad')),'');
 assert.equal(unpackDeanEdwards(packed(62,999999999999,'bad')),'');
 assert.equal(unpackDeanEdwards(packed(2,1,'$&')),'$&');
 assert.equal(unpackDeanEdwards(packed(2,1,'safe')),'safe');
});
