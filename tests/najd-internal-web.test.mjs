import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInternalWeb} from '../server/internal-web.mjs';
test('internal web requires admin authentication for every asset and expires opaque cookies',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'najd-internal-'));
 fs.writeFileSync(path.join(root,'index.html'),'PRIVATE_BUILD');
 fs.writeFileSync(path.join(root,'app.js'),'PRIVATE_CODE');
 fs.writeFileSync(path.join(root,'NOTICES'),'FONT_AND_PACKAGE_LICENSES');
 let clock=1000;const key='fixture-admin-key-'+ 'x'.repeat(32);
 const gate=createInternalWeb({root,now:()=>clock,token:()=>key});
 const server=http.createServer(async(req,res)=>{if(!await gate.handle(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const suffix of ['','app.js','NOTICES']){const r=await fetch(base+'/internal/'+suffix);assert.equal(r.status,401);assert.ok(!(await r.text()).includes('PRIVATE_'));}
  const no=await fetch(base+'/internal/login',{method:'POST',body:'key=wrong'});assert.equal(no.status,401);
  const yes=await fetch(base+'/internal/login',{method:'POST',body:new URLSearchParams({key}),redirect:'manual'});
  assert.equal(yes.status,303);const cookie=yes.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.ok(!cookie.includes(key));
  const headers={cookie:cookie.split(';')[0]};
  assert.equal(await(await fetch(base+'/internal/app.js',{headers})).text(),'PRIVATE_CODE');
  const notices=await fetch(base+'/internal/NOTICES',{headers});assert.equal(notices.status,200);assert.match(notices.headers.get('content-type'),/text\/plain/);assert.equal(await notices.text(),'FONT_AND_PACKAGE_LICENSES');
  assert.equal((await fetch(base+'/internal/%2e%2e%2fpackage.json',{headers})).status,404);
  clock+=8*3600000+1;
  assert.equal((await fetch(base+'/internal/app.js',{headers})).status,401);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
