import {directCandidate} from './direct-candidate.mjs';
import {assertSafeScraperUrl} from './http.mjs';
/** Orchestrate one provider's own resolver; never mix provider/search state. */
export async function resolveProviderMedia(entry,source,{details={},network={},accept=async rows=>rows,maxResolverTargets=32,resolverConcurrency=2,resolverBudgetMs=40000,now=Date.now}={}){
 const module=entry.module,seen=new Set(),raw=[...(details.media_sources||[]),...(details.servers||[])];let lastError=null;
 async function attempt(rows){
  const candidates=(Array.isArray(rows)?rows:[]).filter(directCandidate).filter(row=>{const key=JSON.stringify([row.url,Object.entries(row.headers||{}).map(([k,v])=>[k.toLowerCase(),v]).sort(([a],[b])=>a.localeCompare(b))]);if(seen.has(key))return false;seen.add(key);return true});
  if(!candidates.length)return[];
  try{return await accept(candidates)||[]}catch(error){lastError=error;return[]}
 }
 let approved=await attempt(raw);if(approved.length)return approved;
 if(typeof module.scrapeServers==='function'){
  try{const servers=await module.scrapeServers(source,network);if(Array.isArray(servers))raw.push(...servers);if(servers?._meta?.errorCode&&servers._meta.errorCode!=='EMPTY_RESULT')lastError=Object.assign(Error(servers._meta.errorCode),{code:servers._meta.errorCode});approved=await attempt(servers);if(approved.length)return approved}catch(error){lastError=error}
 }
 if(typeof module.resolveStream==='function'){
  const embedded=raw.filter(row=>row?.url&&!directCandidate(row)).map(row=>row.url).filter(url=>{try{assertSafeScraperUrl(url,{allowHttp:false});return true}catch{return false}});
  let sourceOrigin=null;try{let raw=String(details.sourceUrl||source);if(!raw.startsWith('https://')){raw=raw.replace(/^[a-z0-9_-]+:/i,'');if(!raw.startsWith('https://'))raw=Buffer.from(raw,'base64url').toString('utf8');}sourceOrigin=new URL(raw).origin;}catch{}
  function contextHeaders(target){
   let targetOrigin=null;try{targetOrigin=target===source?sourceOrigin:new URL(target).origin;}catch{}
   const sameOrigin=sourceOrigin&&targetOrigin===sourceOrigin;
   const row=raw.find(row=>row?.url===target),headers={...(network.headers||{})};
   for(const [key,value] of Object.entries(row?.headers||{})){
    if(typeof value!=='string'||value.length>8192||/[\r\n]/.test(value))continue;
    const name=key.toLowerCase();
    if(['referer','origin','user-agent','x-requested-with'].includes(name)||sameOrigin&&['cookie','x-csrf-token','x-xsrf-token','authorization'].includes(name))headers[key]=value;
   }
   if(!sameOrigin)for(const key of Object.keys(headers))if(['cookie','authorization','x-csrf-token','x-xsrf-token'].includes(key.toLowerCase()))delete headers[key];
   return headers;
  }
  const observed=[...new Set([source,...embedded].filter(Boolean))];
  const targets=observed.slice(0,Math.min(64,Math.max(1,maxResolverTargets)));
  const deadline=now()+Math.max(1000,Math.min(60000,resolverBudgetMs));
  let cursor=0,winning=null,attempted=0;
  async function resolve(target){
   attempted++;
   try{
    const remaining=Math.max(250,deadline-now());
    const result=await module.resolveStream(target,{...network,headers:contextHeaders(target),timeoutMs:Math.min(network.timeoutMs||8000,remaining)});
    if(winning)return;
    const rows=(Array.isArray(result)?result:[...(result?.servers||[]),...(result?.sources||[]),result]).filter(Boolean).map(row=>({...row,url:row.url||row.streamUrl}));
    const accepted=await attempt(rows);if(accepted.length&&!winning)winning=accepted;
   }catch(error){if(target===source||error.code!=='UNSAFE_URL')lastError=error}
  }
  // The source page owns headers/context. Only then fan out its observed mirrors.
  if(targets.length){cursor=1;await resolve(targets[0]);}
  async function worker(){while(!winning&&cursor<targets.length&&now()<deadline){const target=targets[cursor++];await resolve(target);}}
  if(!winning)await Promise.all(Array.from({length:Math.min(4,Math.max(1,resolverConcurrency))},()=>worker()));
  if(winning)return winning;
  if(attempted<observed.length)throw Object.assign(Error('MEDIA_SERVER_SCAN_PARTIAL'),{code:'MEDIA_SERVER_SCAN_PARTIAL',observed_targets:observed.length,attempted_targets:attempted});

 }
 if(lastError)throw lastError;return[];
}
