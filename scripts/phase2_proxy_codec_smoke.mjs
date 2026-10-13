import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
process.env.NODE_ENV='test';
const {createServer,__createMediaReferenceForTest}=await import('../server/app.mjs');
const original=https.request;const requests=[];
https.request=(url,options,callback)=>{
  const uri=new URL(url);assert.equal(uri.host,'s201d1.downet.net');
  assert(options.headers.Referer);assert(options.headers['User-Agent']);
  requests.push({path:uri.pathname,range:options.headers.Range});
  const filename=path.basename(uri.pathname);assert(/^[a-zA-Z0-9_.-]+$/.test(filename));
  const file='/tmp/matv-codec-fixtures/'+filename;
  const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>queueMicrotask(()=>{
    const upstream=new PassThrough();upstream.statusCode=fs.existsSync(file)?200:404;
    upstream.headers={'content-type':filename.endsWith('.mpd')?'application/dash+xml':filename.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'application/octet-stream'};
    callback(upstream);if(fs.existsSync(file))fs.createReadStream(file).pipe(upstream);else upstream.end();
  });return req;
};
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try{
  const mapping={};for(const file of ['sample.mp4','sample.mkv','sample.webm','sample.ts','master.m3u8','master.mpd']){
    mapping[file]=base+__createMediaReferenceForTest('https://s201d1.downet.net/fixtures/'+file,'https://akwam.ss/watch/fixture');
  }
  fs.writeFileSync('/tmp/matv-codec-network.json',JSON.stringify(mapping));
  const {stdout}=await promisify(execFile)('/workspace/flutter-sdk/bin/dart',['run','tool/phase2_codec_smoke.dart',process.argv[2],'/tmp/matv-codec-fixtures','/tmp/matv-codec-network.json'],{cwd:new URL('../flutter_app',import.meta.url),env:{...process.env,LD_LIBRARY_PATH:path.dirname(process.argv[2])},timeout:120000,maxBuffer:1024*1024});
  const result=JSON.parse(stdout.split('\n').find(line=>line.startsWith('{')));
  assert.equal(result.results.length,6);assert(result.results.every(row=>row.decoded));
  assert(requests.some(row=>row.path.endsWith('.m4s')));assert(requests.some(row=>row.path.endsWith('.ts')));
  console.log(JSON.stringify({...result,via:'MATV HTTP media proxy including HLS/DASH child resources',upstream_requests:requests.length,range_requests:requests.filter(row=>row.range).length}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));https.request=original;}
