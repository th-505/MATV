import assert from 'node:assert/strict';
import {createProductionMatchRuntime} from '../server/match-production.mjs';
const calls=[];
const facade=createProductionMatchRuntime({edgeBase:'https://edge.example',fetchImpl:async(url)=>{calls.push(new URL(url).pathname);return Response.json({status:'success',sources:[{url:'https://pull.gosh6.app/live/one.m3u8',format:'hls',headers:{Referer:'https://news.yallowzeno.world/'},expires_at:new Date(Date.now()+60000).toISOString(),provider:'main'}]});}});
const p=await facade.playback('matchserver:fixture');assert.equal(p.data.playback_mode,'direct');assert.equal(p.data.media_path,'https://pull.gosh6.app/live/one.m3u8');assert.deepEqual(calls,['/v1/matches/playback']);
let status,body;await facade.proxyMedia({}, {set statusCode(s){status=s;},setHeader(){},end(text){body=text;}});
assert.equal(status,410);assert.match(body,/MATCH_PROXY_RETIRED/);assert.equal(calls.length,1);
console.log('Render match facade: only edge JSON; retired media route returns 410 without any upstream fetch');
