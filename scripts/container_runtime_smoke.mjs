import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startMitvRuntimeServer } from '/app/server/index-runtime.mjs';
const server = startMitvRuntimeServer({port:0});
await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
try {
 const health=await fetch(base+'/health');assert.equal(health.status,200);
 const response=await fetch(base+'/api/v1/explore/sources');assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.data.length,19);
 const tmdb=await fetch(base+'/api/v1/tmdb/catalog?path=%2Ftrending%2Fmovie%2Fweek');assert.equal(tmdb.status,503);
 assert.equal((await tmdb.json()).message,'TMDB_NOT_CONFIGURED');
 console.log(JSON.stringify({production_container:true,health:200,source_count:body.data.length,tmdb_unconfigured:503}));
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
