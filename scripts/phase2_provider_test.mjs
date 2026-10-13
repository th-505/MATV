import assert from 'node:assert/strict';
import {assertSourceUrl,parseWatch,mediaKindFromUrl,fetchSourceHtml,directWatch} from '../server/providers/akoam.mjs';
import {rewriteDashManifest,dashProxyParameters,expandDashTemplate} from '../server/dash-manifest.mjs';
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
  globalThis.fetch=async()=>++hops===1 ? new Response('',{status:302,headers:{location:'https://s201d1.downet.net/media/redirect.mp4'}}) : new Response('video fixture',{headers:{'content-type':'video/mp4'}});
  assert.equal((await directWatch('https://akwam.ss/watch/redirect')).media_src,'https://s201d1.downet.net/media/redirect.mp4');
  hops=0;
  const target=Buffer.from('/watch/decoded').toString('base64');
  globalThis.fetch=async()=>++hops===1 ? new Response(`location.href=atob('${target}')`) : new Response('<source src="https://s201d1.downet.net/media/decoded.mkv">');
  assert.equal((await directWatch('https://akwam.ss/watch/encoded')).media_type,'matroska');
  let outbound=0;
  globalThis.fetch=async()=>{outbound++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});};
  await assert.rejects(fetchSourceHtml('https://akwam.ss/watch/first'),/UNSAFE_CINEMA_SOURCE_URL/);assert.equal(outbound,1);
} finally {globalThis.fetch=original;}
const urls=[];
const xml='<MPD><BaseURL>https://s201d1.downet.net/dash/</BaseURL><Period><AdaptationSet><Representation id="v1"><SegmentTemplate initialization="init-$RepresentationID$.m4s" media="chunk-$Number%05d$.m4s" /></Representation></AdaptationSet></Period></MPD>';
const output=rewriteDashManifest(xml,'https://s201d1.downet.net/media/master.mpd',url=>{urls.push(url);return `/api/cinema/media?id=${urls.length}${dashProxyParameters(url)}`;},url=>assertSourceUrl(url,{allowMedia:true}));
assert(output.includes('Number%05d'));assert(urls.some(url=>dashProxyParameters(url).includes('number=$Number%05d$')));assert(!output.includes('https://s201d1.downet.net'));
assert.equal(expandDashTemplate(urls.find(u=>u.includes('chunk')),new URLSearchParams('number=00012')),'https://s201d1.downet.net/dash/chunk-00012.m4s');
assert.throws(()=>expandDashTemplate('https://s201d1.downet.net/$RepresentationID$.m4s',new URLSearchParams('representationid=../x')),/INVALID_DASH_PARAMETER/);
assert.throws(()=>rewriteDashManifest('<!DOCTYPE x><MPD/>','https://s201d1.downet.net/master.mpd',x=>x,x=>new URL(x)),/UNSAFE_DASH_XML/);
assert.throws(()=>rewriteDashManifest('<MPD><BaseURL>http://127.0.0.1/</BaseURL><SegmentTemplate media="x.m4s"/></MPD>','https://s201d1.downet.net/master.mpd',x=>x,x=>assertSourceUrl(x,{allowMedia:true})),/UNSAFE_CINEMA_SOURCE_URL/);
console.log('Phase 2 provider: six formats, bounded redirects, trusted hosts, DASH templates and segment routing passed');
