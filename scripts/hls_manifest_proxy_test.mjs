// Historical CI filename retained: its contract now enforces proxy retirement.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createMitvRuntimeServer } from '../server/index-runtime.mjs';
import { createAlooyWebBridge } from '../server/alooy-stream-bridge.mjs';
import { probeDirectMedia, directSource, filterBrowserSources } from '../server/direct-media.mjs';
import { assertSourceUrl } from '../server/providers/akoam.mjs';

const originalFetch=globalThis.fetch, originalHttps=https.request;
let outbound=0;
globalThis.fetch=async()=>{outbound++;throw Error('retired route attempted upstream fetch');};
https.request=()=>{outbound++;throw Error('retired route attempted upstream HTTPS');};
const server=createMitvRuntimeServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
function request(path,method='GET') {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,
      headers:{Origin:'https://th-505.github.io',Range:'bytes=0-1023'}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end();
  });
}
try {
  for(const path of ['/api/cinema/media?id=old&download=1','/api/alooy/media?id=old','/api/v1/fallback/media?ref=old','/api/matches/media?id=old']) {
    for(const method of ['GET','HEAD','POST']) {
      const result=await request(path,method);
      assert.equal(result.status,410,`${path} ${method}`);
      assert.equal(result.headers['content-range'],undefined);
      assert.equal(result.headers['content-disposition'],undefined);
      if(method!=='HEAD')assert.match(JSON.parse(result.text).message,/PROXY_RETIRED/);
    }
  }
  assert.equal(outbound,0,'every retired route must fail on first request without any upstream I/O');
  const bridge=createAlooyWebBridge({requestImpl:()=>{outbound++;throw Error('must not call');}});
  assert.throws(()=>bridge.register({media_path:'https://vid1.ujeklsj.site/video.mp4'}),/PROXY_RETIRED/);
  let status,body;
  await bridge.proxy({method:'GET',headers:{range:'bytes=0-'}},{set statusCode(v){status=v;},setHeader(){},end(v){body=v;}},'any');
  assert.equal(status,410);assert.equal(JSON.parse(body).media_proxy,false);assert.equal(outbound,0);

  const calls=[];
  globalThis.fetch=async(target,init)=>{
    const url=new URL(target);calls.push({url:url.href,method:init.method,headers:init.headers});
    if(url.hostname==='akwam.ss'&&url.pathname==='/movie/phase1-direct')return new Response('<title>Direct fixture</title><a href="/watch/fixture">Watch</a><a href="/download/fixture">Download</a>');
    if(url.hostname==='akwam.ss'&&url.pathname==='/watch/fixture')return new Response('<source src="https://video.downet.net/hls/master.m3u8"><source src="https://video.downet.net/video/alternative.mp4">');
    if(url.hostname==='akwam.ss'&&url.pathname==='/download/fixture')return new Response('<a href="https://files.downet.net/download/direct.mp4">MP4</a>');
    assert(url.hostname.endsWith('.downet.net'),'unexpected fixture host');
    assert.equal(init.method,'HEAD','metadata resolution must never GET video or manifest bytes');
    assert.equal(init.headers.Range,undefined);
    const browser=!!init.headers.Origin;
    const browserCompatible=url.pathname.endsWith('.m3u8');
    return new Response(null,{headers:{'content-type':browserCompatible?'application/vnd.apple.mpegurl':'video/mp4',
      ...(browser&&browserCompatible?{'access-control-allow-origin':'*'}:{})}});
  };
  const ref='legacy:'+encodeURIComponent('https://akwam.ss/movie/phase1-direct');
  const native=JSON.parse((await request('/api/cinema/details?ref='+encodeURIComponent(ref))).text);
  assert.equal(native.playback_mode,'direct');assert.equal(native.is_iframe,false);
  assert(native.media_path.startsWith('https://video.downet.net/'));
  assert.equal(native.headers.Referer,'https://akwam.ss/watch/fixture');
  assert.equal(native.headers['User-Agent'].startsWith('Mozilla/'),true);
  assert(native.media_sources.some(s=>s.media_type==='mp4'));assert.equal(native.download_available,true);
  assert(!JSON.stringify(native).includes('/api/cinema/media'));
  const web=JSON.parse((await request('/api/cinema/details?ref='+encodeURIComponent(ref)+'&platform=web')).text);
  assert.equal(web.media_sources.length,1);assert.equal(web.media_type,'m3u8');assert.equal(web.web_playable,true);
  assert.equal(web.download_available,false);
  assert(calls.filter(c=>c.url.includes('.downet.net')).every(c=>c.method==='HEAD'));

  const validateUrl=url=>assertSourceUrl(url,{allowMedia:true});
  let inspected=0;
  const denied=await probeDirectMedia('https://video.downet.net/video/blocked.mp4',{}, {validateUrl,browser:true,fetchImpl:async(_url,init)=>{
    inspected++;assert.equal(init.method,'HEAD');return new Response(null,{status:403,headers:{'content-type':'video/mp4','access-control-allow-origin':'*'}});
  }});
  assert.equal(denied.playable,false);assert.equal(denied.webPlayable,false);assert.equal(inspected,1);
  await assert.rejects(()=>probeDirectMedia('https://evil.test/video.mp4',{}, {validateUrl,fetchImpl:async()=>{inspected++;}}),/UNSAFE_CINEMA_SOURCE_URL/);
  assert.equal(inspected,1,'untrusted redirect/input must fail before network');
  const hidden=filterBrowserSources({movie_title:'protected',...directSource('https://video.downet.net/v.mp4',{Referer:'https://akwam.ss/watch/test'})});
  assert.equal(hidden.playback_unavailable,true);assert.equal(hidden.media_path,undefined);assert.deepEqual(hidden.media_sources,[]);
  console.log('Cloud video retirement: cinema/Alooy/fallback/matches410 with zero upstream calls; direct metadata HEAD-only and web CORS filtering passed');
} finally {
  server.closeAllConnections();await new Promise(r=>server.close(r));
  globalThis.fetch=originalFetch;https.request=originalHttps;
}
