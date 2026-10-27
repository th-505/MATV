import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve(new URL('..',import.meta.url).pathname);
const fixture=process.env.PLAYBACK_MP4_FIXTURE;
if(!fixture)throw Error('Set PLAYBACK_MP4_FIXTURE to a local generated H264/AAC MP4.');
const bytes=await readFile(fixture);
const isHls=fixture.endsWith('.m3u8');
const mediaUrl='https://fixture.media.example/video.'+(isHls?'m3u8':'mp4');
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=resolve(root,'.'+(path==='/'?'/docs/legacy/index.html.source':path));if(!file.startsWith(root+'/'))throw Error('path');
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.html'?'text/html':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({serviceWorkers:'block'});let polls=0;const requests=[];const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===base)return route.continue();
  if(url.href===mediaUrl)return route.fulfill({status:200,contentType:isHls?'application/vnd.apple.mpegurl':'video/mp4',headers:{'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'},body:bytes});
  if(isHls && url.hostname==='fixture.media.example' && /^\/segment\d+\.ts$/.test(url.pathname))return route.fulfill({contentType:'video/mp2t',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(resolve(fixture,'..','.'+url.pathname))});
  if(process.env.HLS_JS_FIXTURE && url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:await readFile(process.env.HLS_JS_FIXTURE)});
  if(url.pathname==='/api/v1/discovery/start'){requests.push(url);return route.fulfill({json:{status:'accepted',data:{state:'queued'}}});}
  if(url.pathname==='/api/v1/discovery/status'){polls++;return route.fulfill({json:{status:'success',data:polls===1?{state:'running'}:{state:'ready',result:{servers:[{url:mediaUrl,kind:'direct',provider:'fixture'}]}}}});}
  if(url.pathname==='/api/v1/tmdb/catalog'){
   const p=url.searchParams.get('path');const body=p==='/tv/1'?{id:1,name:'Fixture',seasons:[{season_number:2}]}:p==='/tv/1/season/2'?{episodes:[{episode_number:4,season_number:2,name:'Episode 4'}]}:{results:[]};
   return route.fulfill({json:body});
  }
  if(route.request().resourceType()==='script')return route.fulfill({contentType:'text/javascript',body:''});
  if(route.request().resourceType()==='image')return route.abort();
  return route.fulfill({json:{status:'success',data:[],items:[],results:[]}});
 });
 await page.goto(base+'/#/watch?id=tmdb:tv:1&type=tv&title=Fixture&s=2&ep=4');
 await page.waitForFunction(()=>document.getElementById('maVideoPlayer').currentTime>0.2,{},{timeout:20000});
 assert.equal(requests[0].searchParams.get('season'),'2');assert.equal(requests[0].searchParams.get('episode'),'4');
 assert(polls>=2);assert.equal(await page.locator('#pagePlayerView iframe').count(),0);
 assert.equal(await page.locator('#playerPlaybackStatus').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('Full watch route: queued → running → exact S2E4 source → actual H264/AAC '+(isHls?'HLS':'MP4')+' playback; no iframe or JavaScript errors.');
}catch(error){throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
