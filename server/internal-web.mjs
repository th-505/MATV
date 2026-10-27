import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {diagnosticsAuthorized} from './diagnostics/search-trace.mjs';
import {createRateLimiter,getClientAddress} from './hardening.mjs';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.woff2':'font/woff2','.bin':'application/octet-stream','.frag':'application/octet-stream','.txt':'text/plain; charset=utf-8','.z':'application/octet-stream'};
const digest=x=>createHash('sha256').update(x).digest('hex');
export function createInternalWeb({root=path.resolve('internal_web'),now=Date.now,token=()=>process.env.DIAGNOSTICS_TOKEN||''}={}){
 const sessions=new Map(),rate=createRateLimiter({windowMs:60000,max:8});
 function authorized(req){
  if(diagnosticsAuthorized(req,token()))return true;
  const value=String(req.headers.cookie||'').match(/(?:^|;\s*)najd_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  return Boolean(value&&sessions.get(digest(value))>now());
 }
 const login=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نجد — دخول الاختبار الداخلي</title><link rel="stylesheet" href="/admin/style.css"><script src="/internal/login.js" defer></script><main><h1>نجد — اختبار داخلي</h1><p>هذه النسخة خاصة بالإدارة والاختبار. أدخل مفتاح الإدارة للوصول.</p><form method="post" action="/internal/login"><label>مفتاح الإدارة <input type="password" name="key" autocomplete="off" required></label><button>دخول</button></form></main></html>`;
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/internal'))return false;
  if(url.pathname!=='/internal'&&!url.pathname.startsWith('/internal/'))return false;
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' https: data: blob:; media-src https: blob:; font-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if(url.pathname==='/internal/login.js'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end("document.querySelector('form').action='/internal/login'+location.hash;");return true;
  }
  if(url.pathname==='/internal/login'&&req.method==='POST'){
   if(!rate(getClientAddress(req)).ok){res.writeHead(429);res.end('RATE_LIMITED');return true}
   const origin=req.headers.origin;if(origin&&origin!==`https://${req.headers.host}`&&!(process.env.NODE_ENV==='test'&&origin===`http://${req.headers.host}`)){res.writeHead(403);res.end('ORIGIN_REJECTED');return true}
   let body='';for await(const part of req){body+=part.toString('utf8');if(Buffer.byteLength(body)>4096){res.writeHead(413);res.end('BODY_TOO_LARGE');return true}}
   const supplied=new URLSearchParams(body).get('key')||'';
   if(!diagnosticsAuthorized({headers:{authorization:'Bearer '+supplied}},token())){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end(login);return true}
   for(const[k,expires]of sessions)if(expires<=now())sessions.delete(k);
   if(sessions.size>=32)sessions.delete(sessions.keys().next().value);
   const session=randomBytes(32).toString('hex');sessions.set(digest(session),now()+8*3600000);
   res.writeHead(303,{'Set-Cookie':`najd_admin=${session}; Path=/internal/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,Location:'/internal/'});res.end();return true;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return true}
  if(!authorized(req)){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':login);return true}
  if(url.pathname==='/internal'){res.writeHead(303,{Location:'/internal/'});res.end();return true}
  let relative;try{relative=decodeURIComponent(url.pathname.slice('/internal/'.length))||'index.html'}catch{res.writeHead(400);res.end();return true}
  const file=path.resolve(root,relative),ext=path.extname(file).toLowerCase();
  if(relative.includes('\0')||relative.includes('\\')||!file.startsWith(root+path.sep)||!mime[ext]){res.writeHead(404);res.end();return true}
  let stat;try{stat=await fs.promises.lstat(file)}catch{res.writeHead(404);res.end();return true}
  if(!stat.isFile()||stat.isSymbolicLink()){res.writeHead(404);res.end();return true}
  const real=await fs.promises.realpath(file);if(!real.startsWith(root+path.sep)){res.writeHead(404);res.end();return true}
  res.writeHead(200,{'Content-Type':mime[ext],'Content-Length':stat.size});
  if(req.method==='HEAD')res.end();else fs.createReadStream(real).on('error',()=>res.destroy()).pipe(res);
  return true;
 }
 return {handle,authorized};
}
