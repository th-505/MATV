import assert from 'node:assert/strict';
import {assertSourceUrl,parseWatch,mediaKindFromUrl,fetchSourceHtml,directWatch} from '../server/providers/akoam.mjs';
for (const [extension,kind] of [['mp4','mp4'],['m3u8','hls'],['mpd','dash'],['mkv','matroska'],['webm','webm'],['ts','mpeg-ts']]) {
  const url=`https://s201d1.downet.net/media/file.${extension}`;
  assert.equal(mediaKindFromUrl(url),kind);
  assert.equal(parseWatch(`<source src="${url}">`).candidates[0],url);
}
for(const url of ['https://user:password@akwam.ss/watch/x','https://akwam.ss:8443/watch/x','https://downet.net.evil.test/media/file.mp4']) assert.throws(()=>assertSourceUrl(url,{allowMedia:true}));
const original=globalThis.fetch;
try {
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push(String(url)); assert.equal(options.redirect,'manual');
    if(requests.length===1)return new Response('',{status:302,headers:{location:'/watch/next'}});
    if(requests.length===2)return new Response('<iframe src="/watch/final"></iframe>');
    return new Response('<video src="https://s201d1.downet.net/media/movie.mkv"></video>');
  };
  assert.equal((await directWatch('https://akwam.ss/watch/first')).media_type,'matroska');
  assert.deepEqual(requests,['https://akwam.ss/watch/first','https://akwam.ss/watch/next','https://akwam.ss/watch/final']);
  let hops=0;
  globalThis.fetch=async(url,options)=>{ if(++hops===1) return new Response('',{status:302,headers:{location:'https://s201d1.downet.net/media/redirect.mp4'}}); assert.equal(options.method,'HEAD','redirect to video must never GET media bytes');return new Response(null,{headers:{'content-type':'video/mp4'}}); };
  assert.equal((await directWatch('https://akwam.ss/watch/redirect')).media_src,'https://s201d1.downet.net/media/redirect.mp4');
  hops=0;
  const target=Buffer.from('/watch/decoded').toString('base64');
  globalThis.fetch=async()=>++hops===1 ? new Response(`location.href=atob('${target}')`) : new Response('<source src="https://s201d1.downet.net/media/decoded.mkv">');
  assert.equal((await directWatch('https://akwam.ss/watch/encoded')).media_type,'matroska');
  let outbound=0;
  globalThis.fetch=async()=>{outbound++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});};
  await assert.rejects(fetchSourceHtml('https://akwam.ss/watch/first'),/UNSAFE_CINEMA_SOURCE_URL/);assert.equal(outbound,1);
} finally {globalThis.fetch=original;}
console.log('Phase 2 provider: six direct formats, bounded trusted redirects and encoded links passed');
