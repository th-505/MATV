import { ProviderKind, fetchJsonWithHealth } from "./providers.js?v=1.0.45-build45";
import { isNewsPayload, isCinemaPayload } from "./contracts.js";

const configuredBackend=typeof document!=='undefined'?document.querySelector('meta[name="matv-api-base"]')?.content:'';
const localBackend=typeof location!=='undefined'&&['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3000':'';
const ENDPOINTS=Object.freeze({backend:configuredBackend||localBackend||"https://matv.onrender.com",news:"https://news.albesriali03.workers.dev/"});
const BACKEND_TIMEOUT_MS=90000;
const MATCH_TIMEOUT_MS=25000;

function installBrandTheme(){
  if(typeof document==='undefined')return;
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content','#07090b');
  document.title='MA TV OFFICIAL • LUXURY CINEMA';
  document.documentElement.style.colorScheme='dark';
}
installBrandTheme();

function isRuntimeList(value,kind){return Boolean(value&&["success","no_results","unsupported","error"].includes(value.status)&&value.version&&value.kind===kind&&Array.isArray(value.data))}
function isRuntimeObject(value,kind){return Boolean(value&&value.status==="success"&&value.version&&value.kind===kind&&value.data&&typeof value.data==="object"&&!Array.isArray(value.data))}

export async function getMatches(){return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches",{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeList(value,"matches")})}
export async function getMatchServers(ref){if(!ref)return{health:"invalid_payload",data:null};return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches/servers?ref="+encodeURIComponent(ref),{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeList(value,"match-servers")})}
export async function getMatchPlayback(ref){if(!ref)return{health:"invalid_payload",data:null};return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches/playback?ref="+encodeURIComponent(ref),{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeObject(value,"match-playback")})}
export async function getNewsList(){return {health:"retired",data:{status:"error",code:"NEWS_RETIRED",data:[]}};}
export async function getNewsArticle(url){return {health:"retired",data:{status:"error",code:"NEWS_RETIRED",data:null}};}
function isRuntimeCatalogPayload(value){return Boolean(value&&value.status==="success"&&value.version&&value.kind==="category"&&Array.isArray(value.data))}
function adaptRuntimeCatalogEnvelope(value){return{status:value.status||"success",source:value.source||"basri-original",version:value.version,kind:value.kind,cached:Boolean(value.cached),health:value.health||null,provider_id:value.provider_id||null,error:value.error||null,data:(value.data||[]).map(item=>({id:item.id||item.ref||"",title:item.title||"بدون عنوان",img:item.poster||item.img||item.image||"",type:item.type||"unknown",is_series:item.type==="series"||item.type==="episode",href:item.ref||item.id||"",year:item.year??null,runtime:item.runtime_minutes??item.runtime??null,season_number:item.season_number??null,episode_number:item.episode_number??null,episode_count:item.episode_count??null,source:item.source||item.providerId||null,providerId:item.providerId||item.source||null})).filter(item=>item.href)}}
export async function getCinemaCategory(type,name,categoryId="",page=1){const p=Math.max(1,Number(page)||1);const result=await fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/category?ref="+encodeURIComponent(String(categoryId||"").trim())+"&p="+encodeURIComponent(String(p)),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,validate:isRuntimeCatalogPayload});if(result?.data)result.data=adaptRuntimeCatalogEnvelope(result.data);return result}
export async function searchCinema(query,providerId="",{signal}={}){const params=new URLSearchParams({q:String(query||"").trim()});if(providerId)params.set("provider",String(providerId).trim());const result=await fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/search?"+params.toString(),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,acceptErrorResponse:true,init:{signal},validate:value=>isRuntimeList(value,"search")});if(result?.data)result.data=adaptRuntimeCatalogEnvelope(result.data);return result}
const workOpenAttempts=new Map();
export async function recordWorkOpen(ref){
  const stamp=Date.now();if(stamp-(workOpenAttempts.get(ref)||0)<120000)return;
  workOpenAttempts.set(ref,stamp);while(workOpenAttempts.size>128)workOpenAttempts.delete(workOpenAttempts.keys().next().value);
  try{await fetch(ENDPOINTS.backend+'/api/cinema/open?ref='+encodeURIComponent(ref),{method:'POST',signal:AbortSignal.timeout(5000)});}catch{}
}
export async function getCinemaDetails(ref){const response=await fetchJsonWithHealth(ENDPOINTS.backend+"/api/cinema/details?ref="+encodeURIComponent(ref),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,validate:isCinemaPayload});if(response?.data?.status==='success')void recordWorkOpen(ref);return response}
export const ProviderEndpoints=ENDPOINTS;

let sourceCatalogPromise;
let sourceCatalog = [];
export function getSearchProviders() {
  if (!sourceCatalogPromise) sourceCatalogPromise = fetchJsonWithHealth(ENDPOINTS.backend + '/api/v1/search/providers', {
    kind: ProviderKind.CINEMA, timeoutMs: BACKEND_TIMEOUT_MS,
    validate: value => value?.status === 'success' && Array.isArray(value.data)
  }).then(result => {
    if (!result.data) { sourceCatalogPromise = null; throw new Error('SOURCES_UNAVAILABLE'); }
    sourceCatalog = result.data.data;
    return sourceCatalog;
  });
  return sourceCatalogPromise;
}
export function sourceLabel(item) {
  const id = item?.providerId || item?.source || String(item?.ref || item?.href || '').split(':')[0];
  const match = sourceCatalog.find(p => p.id === id || p.aliases.includes(id) || p.domains.some(domain => {
    try { return new URL(item?.ref || item?.href).hostname === new URL(domain).hostname; } catch { return false; }
  }));
  return match?.displayName || '';
}
