import assert from 'node:assert/strict';
import http from 'node:http';
import { createMitvRuntimeServer } from '../server/index-runtime.mjs';
import { FallbackPlaybackRuntime } from '../server/fallback-runtime.mjs';
let opened=0;
const fallbackRuntime=new FallbackPlaybackRuntime();
fallbackRuntime.openDirectMedia=async()=>{opened++;throw Error('retired route invoked runtime');};
const baseServer=http.createServer((_req,res)=>{res.writeHead(404);res.end();});
const server=createMitvRuntimeServer({baseServer,fallbackRuntime});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  for(const method of ['GET','HEAD','POST']) {
    const response=await fetch(base+'/api/v1/fallback/media?ref=fallback:old',{method,headers:{Origin:'https://th-505.github.io',Range:'bytes=10-13'}});
    assert.equal(response.status,410);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://th-505.github.io');
    assert.equal(response.headers.get('content-disposition'),null);
    assert.equal(response.headers.get('content-range'),null);
    if(method!=='HEAD') assert.equal((await response.json()).media_proxy,false);
  }
  assert.equal(opened,0,'retired route must reject before invoking any source/runtime');
  const resolved=await (await fetch(base+'/api/v1/fallback/resolve?tmdb_id=42&type=movie')).json();
  assert.equal(resolved.status,'unavailable');assert(!JSON.stringify(resolved).includes('https://'));
  assert.equal((await fetch(base+'/api/v1/fallback/probe?ref=old')).status,410);
  console.log('fallback_runtime_http_test: media410 without runtime I/O; no embedded playback');
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
