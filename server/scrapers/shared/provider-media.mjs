import {directCandidate} from './direct-candidate.mjs';
import {assertSafeScraperUrl} from './http.mjs';
/** Orchestrate one provider's own resolver; never mix provider/search state. */
export async function resolveProviderMedia(entry,source,{details={},network={},accept=async rows=>rows,maxResolverTargets=4}={}){
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
  const targets=[...new Set([source,...embedded].filter(Boolean))].slice(0,maxResolverTargets);
  for(const target of targets){try{
   const result=await module.resolveStream(target,network);
   const rows=(Array.isArray(result)?result:[...(result?.servers||[]),...(result?.sources||[]),result]).filter(Boolean).map(row=>({...row,url:row.url||row.streamUrl}));
   approved=await attempt(rows);if(approved.length)return approved;
  }catch(error){if(target===source||error.code!=='UNSAFE_URL')lastError=error}}
 }
 if(lastError)throw lastError;return[];
}
