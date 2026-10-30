import {createHash} from 'node:crypto';
import {getProvider,fetchProviderHtml,fetchSafeResponse,loadHtml} from './provider-runtime.mjs';
export const SEARCH_PROVIDERS=['shahid4u','moviztime','ristoanime','alooy','3isk','mewsry'];
export const SEARCH_QUERIES=['كونان','Detective Conan','One-Eyed Flashback'];
export function pageLinks(html,pageUrl){
 const $=loadHtml(html||''),origin=new URL(pageUrl).origin,links=new Set();let declaredLast=null;
 const add=value=>{try{const u=new URL(value.replaceAll('&amp;','&'),pageUrl);if(u.origin!==origin||u.username||u.password||u.hash||u.protocol!=='https:')return;links.add(u.href);const number=Number(u.searchParams.get('page')||u.searchParams.get('paged')||u.searchParams.get('p'))||Number(u.pathname.match(/\/page\/(\d+)/)?.[1]);if(number>0)declaredLast=Math.max(declaredLast||1,number);}catch{}};
 $('a[rel=next],link[rel=next],a.next,.pagination a[href],.pagenavi a[href],.wp-pagenavi a[href],a.page-numbers,.nav-links a[href],[data-next-url],[data-next-page-url]').each((_,e)=>{const node=$(e),value=node.attr('href')||node.attr('data-next-url')||node.attr('data-next-page-url');if(value)add(value);});
 for(const match of String(html).matchAll(/"next_page_url"\s*:\s*"([^"\r\n]+)"/g)){try{add(JSON.parse('"'+match[1]+'"'));}catch{}}
 const hasControls=$('.pagination,.pagenavi,.wp-pagenavi,.nav-links').length>0;
 return {links:[...links],declaredLast,hasControls};
}
function pageIdentity(items,html){return createHash('sha256').update(JSON.stringify(items.map(x=>x.ref||x.url||x.title).sort())).digest('hex');}
export async function scanSearchPages({provider,query,onProgress=()=>{},cursor=null,loadProvider=getProvider,request=fetchProviderHtml}={}){
 const adapter=loadProvider(provider).module;
 const state=cursor||{provider,query,pages:[],queue:[],seen:[],matches:[],status:'running',declaredLast:null};
 state.status='running';delete state.reason;
 const seen=new Set(state.seen),fingerprints=new Set(state.pages.map(p=>p.fingerprint));
 const options={strict:true,timeoutMs:20000,maxRetries:0};
 const inspect=async(items,page)=>{
  const code=items?._meta?.errorCode;if(code&&code!=='EMPTY_RESULT')throw Object.assign(Error(code),{code});
  const metadata=pageLinks(page.html||'',page.url),fingerprint=pageIdentity(items,page.html||'');
  if(metadata.declaredLast)state.declaredLast=Math.max(state.declaredLast||1,metadata.declaredLast);
  state.pages.push({url:page.url,status:page.status||200,itemCount:items.length,fingerprint,links:metadata.links.length});
  for(const item of items)if(/conan|كونان/i.test(item.title||''))state.matches.push(item);
  if(fingerprints.has(fingerprint)&&metadata.links.some(url=>!seen.has(url))){state.status='partial';state.reason='REPEATED_PAGE_WITH_UNVISITED_LINKS';return;}
  fingerprints.add(fingerprint);for(const url of metadata.links)if(!seen.has(url)&&!state.queue.includes(url))state.queue.push(url);
  await onProgress({...state,seen:[...seen]});
 };
 try{
  if(!state.pages.length){
   const captured=[];const items=await adapter.scrapeSearch(query,1,{...options,onProviderPage:p=>captured.push(p)});
   const page=captured.find(p=>new URL(p.url).searchParams.has('s')||new URL(p.url).pathname.includes('search'))||captured[0];
   if(page){seen.add(page.url);await inspect(items,page);}
   else if(items._meta?.url){const response=await fetchSafeResponse(items._meta.url,{...options,allowHttp:false});seen.add(response.url);state.pages.push({url:response.url,status:response.status,itemCount:items.length,kind:'json-autocomplete',fingerprint:pageIdentity(items,'')});state.matches.push(...items.filter(x=>/conan|كونان/i.test(x.title||'')));state.scope='autocomplete-response-no-advertised-pagination';}
   else{const error=items._meta?.errorCode||'PAGE_NOT_OBSERVED';throw Object.assign(Error(error),{code:error});}
  }
  while(state.queue.length&&state.status!=='partial'){
   const url=state.queue.shift();if(seen.has(url))continue;seen.add(url);
   let response;try{response=await request(url,{...options,allowHttp:false,referer:state.pages[0].url});}catch(e){state.queue.unshift(url);seen.delete(url);throw e;}
   const items=await adapter.scrapeSearch(query,state.pages.length+1,{...options,fixtureHtml:response.html,fixtureStatus:response.status});
   await inspect(items,response);
  }
  if(state.status!=='partial')state.status='complete';
 }catch(e){state.status='partial';state.reason=e.code||e.name||'NETWORK_FAILURE';}
 state.seen=[...seen];state.completedAt=new Date().toISOString();return state;
}
export async function scanAllSearches({onResult=async()=>{},onProgress=()=>{},resume={}}={}){
 const jobs=SEARCH_PROVIDERS.flatMap(provider=>SEARCH_QUERIES.map(query=>({provider,query}))),results=[];let cursor=0;
 async function worker(){while(cursor<jobs.length){const job=jobs[cursor++],key=job.provider+':'+job.query;const result=await scanSearchPages({...job,cursor:resume[key]||null,onProgress:p=>onProgress(p)});results.push(result);await onResult(result);}}
 await Promise.all(Array.from({length:3},worker));return results;
}
