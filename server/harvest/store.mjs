import {readBoundedText} from '../scrapers/shared/http.mjs';
const TABLES=new Set(['matv_discovery_jobs','najd_work_catalog','najd_season_catalog','najd_source_catalog','najd_episode_cache','najd_provider_config','najd_harvest_events']);
/** Private PostgREST store; never expose this key to a browser or a worker report. */
export function createHarvestStore({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,fetchImpl=globalThis.fetch}={}){
 if(!url||!key)return null;
 const base=new URL(url);if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')||base.username||base.password||base.port||base.pathname!=='/')throw Error('SUPABASE_BAD_URL');
 if(key.startsWith('sb_publishable_'))throw Error('SUPABASE_SERVER_KEY_REQUIRED');
 const headers={apikey:key,'Content-Type':'application/json',...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
 async function request(table,params={},method='GET',body,prefer='return=representation'){
  if(!TABLES.has(table)&&!['rpc/najd_claim_jobs','rpc/najd_hourly_refresh','rpc/najd_upsert_episodes','rpc/najd_enqueue_jobs','rpc/najd_apply_provider_config'].includes(table))throw Error('HARVEST_TABLE_REJECTED');
  const target=new URL('/rest/v1/'+table,base);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null)target.searchParams.set(k,String(v));
  const r=await fetchImpl(target,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{...headers,Prefer:prefer},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){await r.body?.cancel();throw Error('HARVEST_DB_HTTP_'+r.status)}
  if(r.status===204){await r.body?.cancel();return null}
  const text=await readBoundedText(r,2*1024*1024);return text?JSON.parse(text):null;
 }
 const upsert=(table,conflict,row)=>request(table,{on_conflict:conflict},'POST',row,'resolution=merge-duplicates,return=representation');
 return {
  request,
  claim:(worker,limit)=>request('rpc/najd_claim_jobs',{},'POST',{p_worker:worker,p_limit:limit}),
  heartbeat:(key,worker)=>request('matv_discovery_jobs',{job_key:'eq.'+key,worker_id:'eq.'+worker,status:'eq.running'},'PATCH',{lease_until:new Date(Date.now()+90000).toISOString()}),
  async complete(job,worker,result={}){
   const now=Date.now();return request('matv_discovery_jobs',{job_key:'eq.'+job.job_key,worker_id:'eq.'+worker,status:'eq.running'},'PATCH',{
    status:result.continuation?'queued':'ready',attempts:0,worker_id:null,lease_until:null,finished_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),
    refresh_after:new Date(result.continuation?now:(result.refreshAt||now+3600000)).toISOString(),...(result.continuation?{payload:result.continuation,attempts:0}:{}),progress:result.progress||{},error_code:null});
  },
  fail:(job,worker,reason)=>request('matv_discovery_jobs',{job_key:'eq.'+job.job_key,worker_id:'eq.'+worker,status:'eq.running'},'PATCH',{
   status:job.attempts<5?'queued':'failed',worker_id:null,lease_until:null,error_code:reason,refresh_after:new Date(Date.now()+Math.min(3600000,30000*2**job.attempts)).toISOString(),updated_at:new Date().toISOString()}),
  async enqueue(row,{refresh=false}={}){
   // Ignore a duplicate queued/running/completed child; hourly work refresh opts in.
   if(refresh){
    const previous=(await request('matv_discovery_jobs',{job_key:'eq.'+row.job_key,select:'status,refresh_after,payload',limit:1}))?.[0];
    if(previous&&(previous.status==='queued'||previous.status==='running'||previous.payload?.cycle===row.payload?.cycle))return previous;
    return upsert('matv_discovery_jobs','job_key',{...row,status:'queued',attempts:0,last_activity_at:new Date().toISOString(),refresh_after:new Date().toISOString()});
   }
   return request('matv_discovery_jobs',{on_conflict:'job_key'},'POST',row,'resolution=ignore-duplicates,return=representation');
  },
  async enqueueMany(rows){for(let i=0;i<rows.length;i+=80)await request('rpc/najd_enqueue_jobs',{},'POST',{p_rows:rows.slice(i,i+80)});},
  putSeason:row=>upsert('najd_season_catalog','work_ref,season',row),
  getSeason:async(ref,season)=>(await request('najd_season_catalog',{work_ref:'eq.'+ref,season:'eq.'+season,expires_at:'gt.'+new Date().toISOString(),limit:1}))?.[0]||null,
  getWork:async ref=>(await request('najd_work_catalog',{ref:'eq.'+ref,limit:1}))?.[0]||null,
  putWork:row=>upsert('najd_work_catalog','ref',row),
  putSource:row=>upsert('najd_source_catalog','work_ref,provider,source_ref',row),
  async putEpisodes(rows){for(let i=0;i<rows.length;i+=80)await request('rpc/najd_upsert_episodes',{},'POST',{p_rows:rows.slice(i,i+80)});},
  async getEpisode(ref,provider,source){return(await request('najd_episode_cache',{work_ref:'eq.'+ref,provider:'eq.'+provider,source_ref:'eq.'+source,limit:1}))?.[0]||null},
  episodes:(ref,{season,episode,limit=1000,offset=0,playable=false}={})=>request('najd_episode_cache',{work_ref:'eq.'+ref,...(season===undefined?{}:{season:'eq.'+season}),...(episode===undefined?{}:{episode:'eq.'+episode}),...(playable?{state:'eq.playable',media_expires_at:'gt.'+new Date(Date.now()+30000).toISOString()}:{}),order:'season.asc,episode.asc,provider.asc',limit:Math.min(1000,limit),offset}),
  setEpisode:(ref,provider,source,patch)=>request('najd_episode_cache',{work_ref:'eq.'+ref,provider:'eq.'+provider,source_ref:'eq.'+source},'PATCH',{...patch,updated_at:new Date().toISOString()}),
  event:row=>request('najd_harvest_events',{},'POST',row,'return=minimal'),
  hourly:()=>request('rpc/najd_hourly_refresh',{},'POST',{}),
  config:()=>request('najd_provider_config',{select:'provider,revision,enabled,config',limit:100}),
 };
}
