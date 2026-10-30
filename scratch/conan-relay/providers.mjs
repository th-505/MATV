import {readFile} from 'node:fs/promises';
import {listProviders,getProvider,unwrapEmbedToDirectStreams,fetchSafeResponse,fetchProviderHtml,assertSafeScraperUrl,assertSafeResolvedHost} from './provider-runtime.mjs';
const known=JSON.parse(await readFile(new URL('./known-works.json',import.meta.url),'utf8'));
export function matchesFilm(item){
 const text=String(item?.title||'');
 if(/مدبلج|dubbed/i.test(text)||/^(series|episode|tv)$/i.test(item?.type||''))return false;
 const years=text.match(/(?:19|20)\d{2}/g)||[];if(years.some(y=>y!=='2025'))return false;
 return /one[\s-]*eyed[\s-]*flashback/i.test(text)||(/كونان\s*(?:28|٢٨)(?![\p{N}])/u.test(text)&&/(2025|٢٠٢٥)/u.test(text));
}
const safeError=e=>/^[A-Z][A-Z0-9_]{1,60}$/.test(e?.code||'')?e.code:'SOURCE_UNAVAILABLE';
export async function resolveCimanowVirtual(value){
 const params=new URLSearchParams(new URL(value).hash.slice(1));
 const watch=params.get('watchUrl');const target=assertSafeScraperUrl(watch,{allowHttp:false,allowedHosts:['cimanow.me']});
 const page=await fetchProviderHtml(target.href,{allowHttp:false,allowedHosts:['cimanow.me'],timeoutMs:7000,maxRetries:0});
 const key=page.html.match(/const\s+watchResolveKey\s*=\s*"([^"]+)"/)?.[1];
 const csrf=page.html.match(/const\s+csrfToken\s*=\s*"([^"]+)"/)?.[1];
 if(!key||!csrf)return [];
 const cookies=(page.headers?.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ');
 const response=await fetchSafeResponse(new URL('/watch/resolve',target).href,{allowHttp:false,allowedHosts:['cimanow.me'],method:'POST',body:JSON.stringify({key,index:Number(params.get('index'))}),headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','X-CSRF-TOKEN':csrf},referer:target.href,cookies,timeoutMs:7000,maxRetries:0});
 if(!response.ok)return [];const json=JSON.parse(response.html);if(json?.ok&&typeof json.url==='string')return unwrapEmbedToDirectStreams(json.url,target.href);return [];
}
export async function normalizeCandidate(raw,provider){
 const url=assertSafeScraperUrl(raw.url||raw.streamUrl,{allowHttp:false});
 await assertSafeResolvedHost(url.hostname);
 const hls=/\.m3u8$/i.test(url.pathname)||raw.streamType==='m3u8'||raw.type==='m3u8';
 if(!hls&&!/\.mp4$/i.test(url.pathname))return null;
 const headers=Object.fromEntries(Object.entries(raw.headers||{}).filter(([key,value])=>['referer','origin','user-agent','accept','accept-language','cookie'].includes(key.toLowerCase())&&typeof value==='string'&&!/[\r\n]/.test(value)));
 return {url:url.href,format:hls?'hls':'mp4',provider,workId:'conan28-2025',edition:'original-subtitled',headers,mediaHosts:[url.hostname],expires_at:new Date(Date.now()+3600000).toISOString()};
}
export async function discoverProviders({onCandidate=async()=>{},onProgress=()=>{},budgetMs=120000}={}){
 const entries=listProviders().filter(p=>!p.mirrorOf&&p.capabilities?.search&&p.id!=='akwam');
 const diagnostics=[],deadline=Date.now()+budgetMs;let cursor=0,checked=0;
 const progress=()=>onProgress({checked,total:entries.length,partial:checked<entries.length});
 async function worker(){while(cursor<entries.length&&Date.now()<deadline){const meta=entries[cursor++],adapter=getProvider(meta.id).module;const row={provider:meta.id,stage:'search',testedPages:1,partial:false};try{
  let work=known[meta.id];
  if(!work){const items=await adapter.scrapeSearch('One-Eyed Flashback',1,{strict:true,timeoutMs:6000,maxRetries:0});if(items._meta?.errorCode&&items._meta.errorCode!=='EMPTY_RESULT'){row.reason=items._meta.errorCode;continue;}const matches=items.filter(matchesFilm);work=matches[0];row.partial=Boolean(items._meta?.next_page||matches.length>1);}
  if(!work){row.reason='NO_MATCH_ON_TESTED_PAGE';continue;}
  if(!matchesFilm(work)){row.reason='WORK_IDENTITY_UNCONFIRMED';continue;}
  row.stage='extract';const ref=work.ref||work.url;
  const results=await Promise.allSettled([adapter.scrapeDetails?.(ref,{timeoutMs:7000,maxRetries:0}),adapter.scrapeServers?.(ref,{timeoutMs:7000,maxRetries:0,unwrap:false})]);
  const extractionFailure=results.find(r=>r.status==='fulfilled'&&r.value?._meta?.errorCode&&r.value._meta.errorCode!=='EMPTY_RESULT')?.value?._meta?.errorCode;
  const servers=results.flatMap(r=>r.status==='fulfilled'?(Array.isArray(r.value)?r.value:r.value?.servers||[]):[]);
  const seen=new Set(),unique=servers.filter(s=>{if(!s?.url||seen.has(s.url))return false;seen.add(s.url);return true;});
  const direct=unique.filter(s=>['mp4','m3u8'].includes(s.streamType||s.type)&&/\.(mp4|m3u8)(?:\?|$)/i.test(s.url));
  const embeds=unique.filter(s=>!direct.includes(s)&&!s.url.includes('/m/'));row.partial ||= embeds.length>8;
  row.candidates=0;
  const publish=async(raw)=>{if(Date.now()>=deadline){row.partial=true;return;}try{const candidate=await normalizeCandidate(raw,meta.id);if(candidate){row.candidates++;await onCandidate(candidate);}}catch{row.rejectedCandidates=(row.rejectedCandidates||0)+1;}};
  for(const candidate of direct.slice(0,8)){if(Date.now()>=deadline){row.partial=true;break;}await publish(candidate);}
  for(const embed of embeds.slice(0,8)){if(Date.now()>=deadline){row.partial=true;break;}try{const streams=meta.id==='cimanow'&&embed.url.includes('/watch/resolve#')?await resolveCimanowVirtual(embed.url):await unwrapEmbedToDirectStreams(embed.url,work.url);for(const candidate of streams)await publish(candidate);}catch{row.embedFailures=(row.embedFailures||0)+1;}}
  row.stage='done';row.reason=row.candidates?'CANDIDATES_PROBED':extractionFailure||'NO_DIRECT_MEDIA_FROM_TESTED_SERVERS';
 }catch(e){row.reason=safeError(e);}finally{diagnostics.push(row);checked++;progress();}}}
 await Promise.all(Array.from({length:6},worker));return {diagnostics,discovery:{checked,total:entries.length,partial:checked<entries.length||diagnostics.some(d=>d.partial),completedAt:new Date().toISOString()}};
}
