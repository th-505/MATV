import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSafeResponse} from '../server/scrapers/shared/http.mjs';
import {resolveProviderMedia} from '../server/scrapers/shared/provider-media.mjs';
import {resolveStream} from '../server/scrapers/sites/cimanow.mjs';
test('guarded HTTP never forwards cookies or authorization across origins',async()=>{
 const calls=[];
 await fetchSafeResponse('https://source.example/start',{allowHttp:false,maxRetries:0,cookies:'public_session=fixture',headers:{authorization:'Bearer hosting-fixture','X-CSRF-TOKEN':'csrf-fixture'},fetchImpl:async(url,options)=>{
  calls.push({url,headers:options.headers});return calls.length===1?new Response(null,{status:302,headers:{location:'https://cdn.example/final'}}):new Response('ok');
 }});
 const first=new Headers(calls[0].headers),second=new Headers(calls[1].headers);
 assert.equal(first.get('cookie'),'public_session=fixture');assert.equal(second.get('cookie'),null);assert.equal(second.get('authorization'),null);assert.equal(second.get('x-csrf-token'),null);
});
test('same-origin 307 preserves POST payload, cross-origin body forwarding is rejected',async()=>{
 const calls=[];await fetchSafeResponse('https://source.example/start',{method:'POST',body:'payload',allowHttp:false,maxRetries:0,fetchImpl:async(url,options)=>{calls.push(options);return calls.length===1?new Response(null,{status:307,headers:{location:'/final'}}):new Response('ok')}});
 assert.equal(calls[1].method,'POST');assert.equal(calls[1].body,'payload');
 await assert.rejects(fetchSafeResponse('https://source.example/start',{method:'POST',body:'payload',allowHttp:false,maxRetries:0,fetchImpl:async()=>new Response(null,{status:307,headers:{location:'https://other.example/final'}})}),/CROSS_ORIGIN_BODY_REDIRECT/);
});
test('only the originating provider receives its public-session cookie during server resolution',async()=>{
 const seen=[];const entry={module:{scrapeServers:async()=>[{url:'https://source.example/resolve',type:'embed',headers:{Cookie:'public_session=fixture',Referer:'https://source.example/watch','X-CSRF-TOKEN':'fixture'}},{url:'https://other.example/embed',type:'embed',headers:{Cookie:'public_session=fixture',Referer:'https://source.example/watch','X-CSRF-TOKEN':'fixture'}}],resolveStream:async(url,options)=>{seen.push({url,headers:new Headers(options.headers)});return{};}}};
 await resolveProviderMedia(entry,'https://source.example/watch');
 assert.equal(seen.find(r=>r.url.endsWith('/resolve')).headers.get('cookie'),'public_session=fixture');
 assert.equal(seen.find(r=>r.url.includes('other.example')).headers.get('cookie'),null);
});
test('CimaNow public watch-resolution POST retains the same-origin session and CSRF context',async()=>{
 let posted=false;const watch='https://cimanow.me/watch/fixture';
 const reference='https://cimanow.me/watch/resolve#'+new URLSearchParams({key:'fixture',index:'0',csrf:'csrf-fixture',watchUrl:watch});
 const result=await resolveStream(reference,{headers:{Cookie:'public_session=fixture'},fetchImpl:async(url,options)=>{
  posted=true;assert.equal(options.method,'POST');const h=new Headers(options.headers);assert.equal(h.get('cookie'),'public_session=fixture');assert.equal(h.get('x-csrf-token'),'csrf-fixture');
  return new Response(JSON.stringify({ok:true,url:'https://cdn.example/video.mp4'}),{headers:{'Content-Type':'application/json'}});
 }});
 assert(posted);assert.equal(result.url,'https://cdn.example/video.mp4');
});
