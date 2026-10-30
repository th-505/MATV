import http from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {discoverProviders,registerObservedWork,matchesFilm} from './providers.mjs';
import {scanAllSearches} from './pagination.mjs';
import {loadTsBackups,tsPlaylist,serveTsAsset} from './single-ts.mjs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {extractHls,proxyHls,extract,proxy} from './media.mjs';
import {inspectSource,mergeVariants,masterPlaylist,publicQualities,serveVariant} from './qualities.mjs';
const access=process.env.RELAY_ACCESS_TOKEN;
if(!access || !/^[A-Za-z0-9_-]{24,128}$/.test(access))throw Error('Set RELAY_ACCESS_TOKEN through hosting secrets');
let scanCursors={};try{scanCursors=JSON.parse(await readFile('/tmp/matv-conan-search-cursors.json','utf8'));}catch{}
let cursorWrite=Promise.resolve();
function persistCursors(){const snapshot=JSON.stringify(scanCursors);cursorWrite=cursorWrite.then(async()=>{await writeFile('/tmp/matv-conan-search-cursors.next',snapshot,{mode:0o600});await rename('/tmp/matv-conan-search-cursors.next','/tmp/matv-conan-search-cursors.json');}).catch(()=>{});return cursorWrite;}
let state={state:'pending',sources:[],variants:[],diagnostics:[]},pending,enrichment;
const publicState=()=>({...state,variants:undefined,sources:state.sources.map(s=>({provider:s.provider,format:s.format,quality:s.quality})),qualities:publicQualities(state.variants||[])});
async function addCandidates(candidates,generation){
 const variants=[],diagnostics=[];
 for(const source of candidates){try{variants.push(...await inspectSource(source));}catch(e){diagnostics.push({provider:source.provider||'unknown',reason:e.message==='MP4_REQUIRES_HLS_PACKAGING'?'MP4_REQUIRES_HLS_PACKAGING':'VARIANT_UNAVAILABLE'});}}
 if(state.generation!==generation)return;
 const merged=mergeVariants(state.variants,variants);
 state={...state,state:merged.variants.length?'ready':state.state,variants:merged.variants,sources:[...state.sources,...candidates],diagnostics:[...state.diagnostics,...diagnostics,...merged.rejected]};
}
async function refresh(){
 if(pending)return pending;
 if(enrichment)return publicState();
 pending=(async()=>{
  const generation=crypto.randomUUID();
  let result;
  try{result=await extractHls();}catch{try{result=await extract();}catch{result={sources:[],diagnostics:[]};}}
  const baseline=[];
  for(const source of result.sources){try{baseline.push(...await inspectSource(source));}catch{}}
  if(!baseline.length&&state.variants?.length){state={...state,diagnostics:[{reason:'REFRESH_FAILED_RETAINED_PREVIOUS'}],nextRefresh:Date.now()+60000};return publicState();}
  state={state:baseline.length?'ready':'unavailable',...result,variants:baseline,generation,collecting:true,checkedAt:new Date().toISOString(),nextRefresh:Date.now()+3600000};
  if(!enrichment){enrichment=(async()=>{
   const checkAkwam=(async()=>{try{const extra=await extract();await addCandidates(extra.sources,generation);if(state.generation===generation)state.diagnostics.push(...extra.diagnostics.map(d=>({provider:'akwam',...d})));}catch{if(state.generation===generation)state.diagnostics.push({provider:'akwam',reason:'SOURCE_UNAVAILABLE'});}})();
   const scan=(async()=>{const scans=await scanAllSearches({resume:scanCursors,onProgress:async result=>{scanCursors[result.provider+':'+result.query]=result;await persistCursors();},onResult:async result=>{if(result.status==='complete')delete scanCursors[result.provider+':'+result.query];else scanCursors[result.provider+':'+result.query]=result;await persistCursors();if(state.generation!==generation)return;state.searchPages||=[];state.searchPages.push({provider:result.provider,query:result.query,pages:result.pages.length,advertisedLastPage:result.declaredLast,status:result.status,reason:result.reason||null,remaining:result.queue.length,scope:result.scope||'advertised-search-pages'});const matched=result.matches.find(matchesFilm);if(matched&&registerObservedWork(result.provider,matched)){const update=await discoverProviders({providerIds:[result.provider],onCandidate:async candidate=>{if(state.generation===generation)await addCandidates([candidate],generation);}});if(state.generation===generation)state.diagnostics.push(...update.diagnostics);}}});return scans;})();
   const tsTask=(async()=>{const variants=await loadTsBackups(event=>{if(state.generation===generation)state.diagnostics.push(event);});if(state.generation===generation){const merged=mergeVariants(state.variants,variants);state.variants=merged.variants;state.diagnostics.push(...merged.rejected);if(merged.variants.length)state.state='ready';}})();
   const more=await discoverProviders({onCandidate:async candidate=>{if(state.generation===generation)await addCandidates([candidate],generation);},onProgress:progress=>{if(state.generation===generation)state.discovery=progress;}});
   await Promise.all([checkAkwam,scan,tsTask]);
   if(state.generation===generation){state.diagnostics.push(...more.diagnostics);state.discovery=more.discovery;state.collecting=false;}
  })().catch(()=>{if(state.generation===generation){state.collecting=false;state.discovery={...state.discovery,partial:true};}}).finally(()=>{enrichment=null;});}else state.collecting=false;
  return publicState();
 })().finally(()=>{pending=null;});return pending;
}
async function handle(request){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({ok:true,service:'conan-relay-test',release:'players-pagination-v3-ts'});
 if(!url.pathname.startsWith('/'+access+'/'))return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const route=url.pathname.slice(access.length+2);
 if(route==='watch')return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تجربة كونان 28</title><style>body{background:#111;color:#fff;font-family:system-ui;margin:24px}video{width:100%;max-height:85vh}p{font-size:16px}</style><select id="quality" hidden><option value="-1">الجودة التلقائية</option></select><video controls playsinline></video><p id="status">جارٍ تحميل الفيديو…</p><script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script><script>const v=document.querySelector('video'),s=document.querySelector('#status');if(v.canPlayType('application/vnd.apple.mpegurl')){v.src='index.m3u8'}else if(window.Hls&&Hls.isSupported()){const h=new Hls();h.loadSource('index.m3u8');h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{const q=document.querySelector('#quality');q.hidden=false;h.levels.forEach((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent=l.height+'p'+(l.attrs?.NAME?' — '+l.attrs.NAME:'');q.append(o)});q.onchange=()=>h.currentLevel=Number(q.value)});h.on(Hls.Events.ERROR,(_,e)=>{if(e.fatal)s.textContent='تعذّر تحميل الفيديو من المصدر.'})}else{s.textContent='افتح رابط M3U8 في مشغل يدعم HLS.'}v.addEventListener('loadeddata',()=>s.textContent='الفيديو جاهز للتشغيل');</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(route==='diagnostics')return Response.json({checkedAt:state.checkedAt,discovery:state.discovery,searchPages:state.searchPages||[],providers:state.diagnostics},{headers:{'Cache-Control':'no-store'}});
 if(route==='refresh'){await refresh();return Response.json(publicState(),{headers:{'Cache-Control':'no-store'}});}
 if(!['status','index.m3u8','variant','asset','ts-asset','myte.mp4'].includes(route))return new Response('Not found',{status:404});
 if(state.state==='pending'||state.nextRefresh<Date.now())await refresh();
 if(route==='status')return Response.json(publicState(),{headers:{'Cache-Control':'no-store'}});
 if(route==='index.m3u8'){
  if(!state.variants.length)return Response.json({error:'NO_VERIFIED_HLS_QUALITIES'},{status:503});
  return new Response(request.method==='HEAD'?null:masterPlaylist(state.variants,request.url),{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
 if(route==='ts-asset'){const variant=state.variants.find(v=>v.id===url.searchParams.get('id')&&v.tsIndex);if(!variant)return new Response('Not found',{status:404});return serveTsAsset(request,variant);}
 if(route==='variant'||(route==='asset'&&url.searchParams.has('id'))){
  const variant=state.variants.find(v=>v.id===url.searchParams.get('id'));
  if(!variant)return Response.json({error:'QUALITY_NOT_AVAILABLE'},{status:404});
  if(variant.tsIndex){return new Response(request.method==='HEAD'?null:tsPlaylist(variant.tsIndex,request.url),{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});}
  return serveVariant(request,variant,route==='asset'?url.searchParams.get('u'):null);
 }
 const source=state.sources.find(s=>route==='myte.mp4'?s.format==='mp4':s.format==='hls');
 if(!source)return Response.json({error:'SOURCE_UNAVAILABLE',diagnostics:state.diagnostics},{status:503,headers:{'Cache-Control':'no-store'}});
 return route==='myte.mp4'?proxy(request,source):proxyHls(request,source,route==='asset'?url.searchParams.get('u'):null);
}
const server=http.createServer(async(req,res)=>{
 const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
  const forwarded=req.headers['x-forwarded-proto'];const scheme=forwarded==='https'?'https':'http';
  const request=new Request(scheme+'://'+req.headers.host+req.url,{method:req.method,headers:req.headers,signal:controller.signal});
  const response=await handle(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body&&req.method!=='HEAD')await pipeline(Readable.fromWeb(response.body),res,{signal:controller.signal});else{await response.body?.cancel();res.end();}
 }catch{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"UPSTREAM_UNAVAILABLE"}');}else res.destroy();}
});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0');
const timer=setInterval(()=>{void refresh().catch(()=>{});},3600000);timer.unref();
process.on('SIGTERM',()=>{clearInterval(timer);server.close();});
