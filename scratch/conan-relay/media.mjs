import {assertSafeScraperUrl,assertSafeResolvedHost} from './provider-runtime.mjs';
const originalFetch=globalThis.fetch;
import {unpackDeanEdwards} from "./unpack.mjs";
const ORIGIN='https://akwam.ss';
const PAGE=ORIGIN+'/movie/10524/detective-conan-one-eyed-flashback';
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
export function allowed(value,media=false,extraHosts=[]){
 const u=assertSafeScraperUrl(String(value),{allowHttp:false});
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('UNSAFE_UPSTREAM');
 if(media?!(/^(?:s[0-9a-z]+\.downet\.net|[a-z0-9-]+\.premilkyway\.com)$/.test(u.hostname)||extraHosts.includes(u.hostname)):u.hostname!=='akwam.ss')throw Error('UNSAFE_UPSTREAM');
 return u;
}
export async function prefix(response,max=1024,{timeoutMs=15000}={}){
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let total=0,timedOut=false;const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},timeoutMs);
 try{while(total<max){const {done,value}=await reader.read();if(done)break;const part=value.slice(0,max-total);chunks.push(part);total+=part.length;}}finally{clearTimeout(timer);await reader.cancel();}
 if(timedOut)throw Error('UPSTREAM_BODY_TIMEOUT');
 const result=new Uint8Array(total);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
export async function readText(response,{timeoutMs=15000}={}){
 const reader=response.body?.getReader();if(!reader)return '';const dec=new TextDecoder();let result='',size=0,timedOut=false;const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},timeoutMs);
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw Error('PAGE_TOO_LARGE');result+=dec.decode(value,{stream:true});}}finally{clearTimeout(timer);await reader.cancel();}if(timedOut)throw Error('UPSTREAM_BODY_TIMEOUT');return result+dec.decode();
}
export async function mediaFetch(source,range,method='GET'){
 let current=allowed(source.url,true,source.mediaHosts);
 for(let hop=0;hop<4;hop++){
  if(globalThis.fetch===originalFetch)await assertSafeResolvedHost(current.hostname);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response;
  try{response=await fetch(current,{method,redirect:'manual',headers:{...source.headers,...(range?{Range:range}:{})},signal:controller.signal});}finally{clearTimeout(timer);}
  if(![301,302,303,307,308].includes(response.status))return response;
  const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('BAD_REDIRECT');current=allowed(new URL(next,current).href,true,source.mediaHosts);
 }throw Error('REDIRECT_LIMIT');
}
export async function extract(){
 const jar=new Map(),queue=[PAGE],seen=new Set(),sources=[],diagnostics=[];
 while(queue.length&&seen.size<6){
  let current=allowed(queue.shift());if(seen.has(current.href))continue;seen.add(current.href);
  let body='';
  for(let hop=0;hop<4;hop++){
   const r=await fetch(current,{redirect:'manual',headers:{'User-Agent':UA,Referer:PAGE,Accept:'text/html',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},signal:AbortSignal.timeout(10000)});
   for(const cookie of r.headers.getSetCookie?.()||[]){const pair=cookie.split(';')[0],i=pair.indexOf('=');if(i>0)jar.set(pair.slice(0,i),pair.slice(i+1));}
   if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel();if(!next)break;current=allowed(new URL(next,current).href);continue;}
   diagnostics.push({stage:'page',status:r.status});if(!r.ok){await r.body?.cancel();break;}body=await readText(r);break;
  }
  if(!body)continue;
  for(const match of body.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)){
   let u;try{u=new URL(match[1].replaceAll('&amp;','&'),current);}catch{continue;}
   if(u.hostname==='akwam.ss'&&/^\/(watch|download|link)\//.test(u.pathname)&&!seen.has(u.href))queue.push(u.href);
   if(/^s[0-9a-z]+\.downet\.net$/.test(u.hostname)&&/\.(mp4|m3u8)$/i.test(u.pathname)&&!sources.some(s=>s.url===u.href)){
    allowed(u.href,true);sources.push({url:u.href,format:u.pathname.endsWith('.m3u8')?'hls':'mp4',provider:'akwam',workId:'conan28-2025',edition:'original-subtitled',headers:{Referer:current.href,'User-Agent':UA},quality:u.pathname.match(/(1080|720|480)p/i)?.[0]||'HD',expires_at:new Date(Date.now()+3600000).toISOString()});
   }
  }
  if(sources.length)break;
 }
 const verified=[];
 for(const s of sources.slice(0,4)){
  try{const r=await mediaFetch(s,'bytes=0-1023');const bytes=await prefix(r);const valid=[200,206].includes(r.status)&&(s.format==='hls'?new TextDecoder().decode(bytes).trimStart().startsWith('#EXTM3U'):new TextDecoder().decode(bytes.slice(4,8))==='ftyp');diagnostics.push({stage:'media',status:r.status,format:s.format,valid});if(valid)verified.push(s);}catch(e){diagnostics.push({stage:'media',error:e.name==='TimeoutError'?'TIMEOUT':'FETCH_FAILED'});}
 }
 return {sources:verified,candidateCount:sources.length,diagnostics};
}
export async function proxy(request,source){
 const range=request.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))return new Response('Invalid range',{status:416});
 const upstream=await mediaFetch(source,range,request.method);
 if(![200,206,416].includes(upstream.status)){await upstream.body?.cancel();return new Response('Video source unavailable',{status:502});}
 const headers=new Headers({'Content-Type':'video/mp4','Cache-Control':'private, no-store','Content-Disposition':'inline; filename="myte.mp4"','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges','X-Content-Type-Options':'nosniff'});
 for(const key of ['content-length','content-range','accept-ranges','etag','last-modified']){const value=upstream.headers.get(key);if(value)headers.set(key,value);}
 return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
}

export async function extractHls(){
 const page='https://fastvip.space/e/bxu0583zsvi4';
 const response=await fetch(page,{redirect:'manual',headers:{'User-Agent':UA,Referer:'https://fastvip.space/',Origin:'https://fastvip.space',Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8','Cache-Control':'no-cache','Accept-Language':'ar,en-US;q=0.9,en;q=0.8'},signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw Error('PLAYER_HTTP_'+response.status);}
 const body=await readText(response),plain=body+'\n'+unpackDeanEdwards(body);
 const diagnostics=[];
 const matches=plain.replaceAll('\\/','/').match(/https:\/\/[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?/g)||[];
 for(const value of [...new Set(matches)]){
  try{const u=allowed(value,true);if(!u.hostname.endsWith('.premilkyway.com'))continue;
   const source={url:u.href,format:'hls',provider:'mycima',workId:'conan28-2025',edition:'original-subtitled',headers:{Referer:'https://fastvip.space/',Origin:'https://fastvip.space','User-Agent':UA,Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8','Cache-Control':'no-cache','Accept-Language':'ar,en-US;q=0.9,en;q=0.8'},expires_at:new Date(Date.now()+3600000).toISOString()};
   const r=await mediaFetch(source);const bytes=await prefix(r);diagnostics.push({stage:'hls',status:r.status});
   if(r.ok&&new TextDecoder().decode(bytes).trimStart().startsWith('#EXTM3U'))return {sources:[source],candidateCount:matches.length,diagnostics:[{stage:'hls',status:r.status,validHls:true}]};
  }catch{}
 }const e=Error('NO_VERIFIED_HLS');e.diagnostics=diagnostics;e.candidateCount=matches.length;throw e;
}
export function rewritePlaylist(text,upstream,requestUrl,extraHosts=[]){
 const base=new URL(requestUrl);base.pathname=base.pathname.replace(/\/(?:index\.m3u8|variant|asset)$/,'/asset');const id=base.searchParams.get('id');base.search='';if(id)base.searchParams.set('id',id);
 const route=value=>{const target=allowed(new URL(value,upstream).href,true,extraHosts);const u=new URL(base);u.searchParams.set('u',target.href);return u.href;};
 return text.split(/\r?\n/).map(line=>{
  if(!line.trim())return line;
  if(line.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_,value)=>'URI="'+route(value)+'"');
  return route(line.trim());
 }).join('\n');
}
export async function proxyHls(request,source,asset=null){
 let target=source.url;
 if(asset){const candidate=allowed(asset,true,source.mediaHosts),original=new URL(source.url);
  if(candidate.origin!==original.origin||!candidate.pathname.startsWith(original.pathname.slice(0,original.pathname.lastIndexOf('/')+1)))return new Response('Invalid asset',{status:403});
  target=candidate.href;
 }
 const range=request.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))return new Response('Invalid range',{status:416});
 const response=await mediaFetch({...source,url:target},range,request.method);
 if(![200,206,416].includes(response.status)){await response.body?.cancel();return new Response('HLS source unavailable',{status:502});}
 const headers=new Headers({'Cache-Control':'private, no-store','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges','X-Content-Type-Options':'nosniff'});
 if(new URL(target).pathname.endsWith('.m3u8')){
  headers.set('Content-Type','application/vnd.apple.mpegurl');if(request.method==='HEAD')return new Response(null,{headers});
  const text=await readText(response);if(!text.trimStart().startsWith('#EXTM3U'))return new Response('Invalid playlist',{status:502});
  return new Response(rewritePlaylist(text,target,request.url,source.mediaHosts),{headers});
 }
 for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(key);if(value)headers.set(key,value);}
 return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
}
