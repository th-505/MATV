import {readFile} from 'node:fs/promises';
import {getProvider} from './provider-runtime.mjs';
import {normalizeCandidate} from './providers.mjs';
import {resolvePlayer,probePlayerMedia} from './players.mjs';
import {inspectSource,mergeVariants,masterPlaylist,publicQualities,serveVariant} from './qualities.mjs';
import {proxy} from './media.mjs';
const works=JSON.parse(await readFile(new URL('./abu-works.json',import.meta.url),'utf8'));
export function matchesAbu(item){const t=String(item?.title||'').normalize('NFKC').replace(/[\u064B-\u065F]/g,'').replace(/[أإآٱ]/g,'ا');return !/series|episode|tv/i.test(item?.type||'')&&!/(?:19|20)\d{2}/g.test(t.replaceAll('2023',''))&&(!item.year||String(item.year)==='2023')&&(/ابو\s*نسب/.test(t)||/\b(?:abu|abo)\s*nas{1,2}ab\b/i.test(t));}
const identity={workId:'abu-nasab-2023',edition:'original-arabic'};
let state={state:'pending',variants:[],sources:[],diagnostics:[]},pending;
const status=()=>({state:state.state,workId:identity.workId,title:'أبو نسب (2023)',checkedAt:state.checkedAt,nextRefresh:state.nextRefresh,collecting:Boolean(pending),qualities:publicQualities(state.variants),formats:[...new Set(state.sources.map(s=>s.format))],diagnostics:state.diagnostics});
export function refreshAbu(){
 if(pending)return pending;
 pending=(async()=>{const variants=[],sources=[],diagnostics=[];const publish=async(raw,provider)=>{try{const candidate=await normalizeCandidate(raw,provider,identity);if(!candidate)return;sources.push(candidate);if(candidate.format==='hls')variants.push(...await inspectSource(candidate));const merged=mergeVariants(state.variants,variants);state={...state,state:merged.variants.length||sources.some(s=>s.format==='mp4')?'ready':state.state,variants:merged.variants,sources:[...sources],diagnostics};}catch{diagnostics.push({provider,reason:'MEDIA_UNAVAILABLE'});}};
 let cached=[];try{cached=JSON.parse(process.env.RELAY_ABU_OBSERVED_BACKUPS||'[]');}catch{}
 await Promise.all(cached.filter(s=>s.workId===identity.workId&&s.edition===identity.edition).map(s=>publish(s,s.provider)));
 await Promise.all(works.filter(x=>matchesAbu(x.work)).map(async({provider,work})=>{try{const a=getProvider(provider).module;const results=await Promise.allSettled([a.scrapeDetails(work.ref,{timeoutMs:15000,maxRetries:0}),a.scrapeServers(work.ref,{timeoutMs:15000,maxRetries:0,unwrap:false})]);const all=results.flatMap(r=>r.status==='fulfilled'?(Array.isArray(r.value)?r.value:r.value?.servers||[]):[]);const servers=[...new Map(all.filter(x=>x.url).map(x=>[x.url,x])).values()];let cursor=0;async function worker(){while(cursor<servers.length){const s=servers[cursor++];try{if(['mp4','m3u8'].includes(s.streamType||s.type)&&await probePlayerMedia(s))await publish(s,provider);else for(const raw of await resolvePlayer(s.url,work.url,{deadline:Date.now()+30000}))await publish(raw,provider);}catch{}}}await Promise.all([worker(),worker()]);diagnostics.push({provider,servers:servers.length,reason:'CHECKED'});}catch{diagnostics.push({provider,reason:'SOURCE_UNAVAILABLE'});}}));
 const merged=mergeVariants([],variants);if(sources.length)state={...state,sources,variants:merged.variants};state={...state,state:state.variants.length||state.sources.some(s=>s.format==='mp4')?'ready':'unavailable',diagnostics,checkedAt:new Date().toISOString(),nextRefresh:Date.now()+3600000};return status();})().finally(()=>{pending=null;});return pending;
}
export async function handleAbu(request,route){
 const url=new URL(request.url);
 if(route==='watch')return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>أبو نسب (2023)</title><style>body{background:#111;color:white;font-family:system-ui;margin:24px}video{width:100%;max-height:85vh}</style><h1>أبو نسب (2023)</h1><video controls playsinline></video><p id="s">جارٍ تجهيز الفيديو…</p><script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script><script>const v=document.querySelector('video'),s=document.querySelector('#s');async function start(){const r=await fetch('status'),j=await r.json();if(j.state!=='ready'){if(j.collecting){setTimeout(start,3000);return}s.textContent='المصدر غير متاح حاليًا';return}if(j.qualities.length){if(v.canPlayType('application/vnd.apple.mpegurl'))v.src='index.m3u8';else if(window.Hls&&Hls.isSupported()){const h=new Hls();h.loadSource('index.m3u8');h.attachMedia(v)}}else v.src='myte.mp4';v.onloadeddata=()=>s.textContent='الفيديو جاهز';v.onerror=()=>s.textContent='تعذر تحميل الفيديو';}start();</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(!['status','refresh','index.m3u8','variant','asset','myte.mp4'].includes(route))return new Response('Not found',{status:404});
 if(state.state==='pending'||state.nextRefresh<Date.now()||route==='refresh')void refreshAbu().catch(()=>{});
 if(route==='status'||route==='refresh')return Response.json(status(),{headers:{'Cache-Control':'no-store'}});
 if(route==='index.m3u8')return state.variants.length?new Response(masterPlaylist(state.variants,request.url),{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}}):Response.json({error:'NO_VERIFIED_HLS_QUALITIES'},{status:503});
 if(route==='myte.mp4'){const s=state.sources.find(s=>s.format==='mp4');return s?proxy(request,s):new Response('Source unavailable',{status:503});}
 const v=state.variants.find(v=>v.id===url.searchParams.get('id'));return v?serveVariant(request,v,route==='asset'?url.searchParams.get('u'):null):new Response('Not found',{status:404});
}
