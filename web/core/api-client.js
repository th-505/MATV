import { ProviderKind, fetchJsonWithHealth } from "./providers.js";
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
  document.title='MITV | 4BA';
  document.documentElement.style.colorScheme='dark';
}
installBrandTheme();

function isRuntimeList(value,kind){return Boolean(value&&value.status==="success"&&value.version&&value.kind===kind&&Array.isArray(value.data))}
function isRuntimeObject(value,kind){return Boolean(value&&value.status==="success"&&value.version&&value.kind===kind&&value.data&&typeof value.data==="object"&&!Array.isArray(value.data))}

export async function getMatches(){return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches",{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeList(value,"matches")})}
export async function getMatchServers(ref){if(!ref)return{health:"invalid_payload",data:null};return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches/servers?ref="+encodeURIComponent(ref),{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeList(value,"match-servers")})}
export async function getMatchPlayback(ref){if(!ref)return{health:"invalid_payload",data:null};return fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/matches/playback?ref="+encodeURIComponent(ref),{kind:ProviderKind.MATCHES,timeoutMs:MATCH_TIMEOUT_MS,validate:value=>isRuntimeObject(value,"match-playback")})}
export async function getNewsList(){return {health:"retired",data:{status:"error",code:"NEWS_RETIRED",data:[]}};}
export async function getNewsArticle(url){return {health:"retired",data:{status:"error",code:"NEWS_RETIRED",data:null}};}
function isRuntimeCatalogPayload(value){return Boolean(value&&value.status==="success"&&value.version&&value.kind==="category"&&Array.isArray(value.data))}
function adaptRuntimeCatalogEnvelope(value){return{status:"success",source:value.source||"basri-original",version:value.version,kind:value.kind,cached:Boolean(value.cached),health:value.health||null,data:(value.data||[]).map(item=>({title:item.title||"بدون عنوان",img:item.poster||item.img||item.image||"",is_series:item.type!=="movie",href:item.ref||item.id||"",year:item.year??null})).filter(item=>item.href)}}
export async function getCinemaCategory(type,name,categoryId="",page=1){const p=Math.max(1,Number(page)||1);const result=await fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/category?ref="+encodeURIComponent(String(categoryId||"").trim())+"&p="+encodeURIComponent(String(p)),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,validate:isRuntimeCatalogPayload});if(result?.data)result.data=adaptRuntimeCatalogEnvelope(result.data);return result}
export async function searchCinema(query){const result=await fetchJsonWithHealth(ENDPOINTS.backend+"/api/v1/search?q="+encodeURIComponent(String(query||"").trim()),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,validate:value=>isRuntimeList(value,"search")});if(result?.data)result.data=adaptRuntimeCatalogEnvelope(result.data);return result}
export async function getCinemaDetails(ref){return fetchJsonWithHealth(ENDPOINTS.backend+"/api/cinema/details?ref="+encodeURIComponent(ref),{kind:ProviderKind.CINEMA,timeoutMs:BACKEND_TIMEOUT_MS,validate:isCinemaPayload})}
export const ProviderEndpoints=ENDPOINTS;
