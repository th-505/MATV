import {verifyProviderConfiguration} from '../maintenance/verify-config.mjs';
import {createHarvestStore} from './store.mjs';
import {createHarvestWorker} from './worker.mjs';
import {createHarvestPipeline} from './pipeline.mjs';
import {installProviderConfigs,validateProviderConfig} from '../scrapers/shared/provider-config.mjs';
import {listProviders,getProvider} from '../scrapers/registry.mjs';
import {createTmdbRuntime} from '../tmdb-runtime.mjs';
import {createSourceApi} from './source-api.mjs';

const canonical=ref=>/^tmdb:(movie|tv):[1-9]\d{0,9}$/.test(String(ref));
export function createHarvestService({store=process.env.NAJD_HARVEST_ENABLED==='1'?createHarvestStore():null,metadata=createTmdbRuntime(),logger=()=>{},now=Date.now}={}){
 const entries=listProviders().map(meta=>getProvider(meta.id));
 const worker=createHarvestWorker({store,handlers:store?createHarvestPipeline({store,metadata,entries,now}):{},logger});
 let configTimer=null,hourlyTimer=null,lastWake=0;
 async function refreshConfig(){if(store)installProviderConfigs(await store.config())}
 function start(){
  if(!store||configTimer)return;
  void refreshConfig().catch(()=>logger({event:'najd_config_refresh',reason:'CONFIG_UNAVAILABLE'}));
  worker.start();
  configTimer=setInterval(()=>void refreshConfig().catch(()=>{}),30000);configTimer.unref?.();
  hourlyTimer=setInterval(()=>void store.hourly().then(()=>worker.wake()).catch(()=>{}),3600000);hourlyTimer.unref?.();
 }
 async function stop(){clearInterval(configTimer);clearInterval(hourlyTimer);configTimer=null;await worker.stop()}
 async function cachedWork(ref){
  if(!store||!canonical(ref))return null;
  try{const work=await store.getWork(ref);return work&&Date.parse(work.expires_at)>now()?{status:'success',source:'najd-private-cache',data:work.metadata}:null}catch{return null}
 }
 async function cachedSeason(ref,season){
  if(!store||!canonical(ref)||!Number.isInteger(Number(season))||Number(season)<0||Number(season)>100)return null;
  try{const row=await store.getSeason(ref,Number(season));return row?{status:'success',source:'najd-private-cache',data:row.metadata}:null}catch{return null}
 }
 async function media(ref,{season=0,episode=0,platform='native'}={}){
  if(!store||!canonical(ref))return null;
  try{const rows=await store.episodes(ref,{season,episode,playable:true,limit:100});
   const media=rows.flatMap(row=>(row.media||[]).filter(source=>Date.parse(source.expires_at)>now()+30000&&source.identity_verified===true&&(platform!=='web'||source.web_playable===true)));
   return media.length?media:null;
  }catch{return null}
 }
 async function summary(){
  if(!store)return {configured:false,worker:worker.metrics()};
  const settled=await Promise.allSettled([
   store.request('matv_discovery_jobs',{select:'job_key,stage,provider,status,attempts,progress,error_code,updated_at',order:'updated_at.desc',limit:100}),
   store.request('najd_work_catalog',{select:'ref,title,type,state,episode_count,last_checked_at,expires_at',order:'updated_at.desc',limit:100}),
   store.request('najd_source_catalog',{select:'work_ref,provider,identity_score,state,progress,updated_at',order:'updated_at.desc',limit:100}),
   store.request('najd_harvest_events',{select:'id,provider,stage,outcome,reason,details,created_at',order:'created_at.desc',limit:100}),
   store.config(),
   store.request('rpc/najd_harvest_counts',{},'POST',{}),
  ]);
  const names=['jobs','works','sources','events','providers','totals'];
  const result={configured:true,worker:worker.metrics(),recent_limit:100,unavailable:[]};
  settled.forEach((item,i)=>{result[names[i]]=item.status==='fulfilled'?item.value:[];if(item.status!=='fulfilled')result.unavailable.push(names[i]);});
  return result;
 }
 async function setConfig(provider,config){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');
  if(!getProvider(provider))throw Error('SOURCE_NOT_SUPPORTED');
  const safe=validateProviderConfig(config);
  // Human-admin edits only. Automated proposals use a separate verified path.
  const current=(await store.config()).find(row=>row.provider===provider);
  await store.request('najd_provider_config',{on_conflict:'provider'},'POST',{provider,config:safe,enabled:true,revision:(Number(current?.revision)||0)+1,updated_at:new Date(now()).toISOString()},'resolution=merge-duplicates,return=minimal');
  await refreshConfig();return {provider,applied:true};
 }
 async function applyVerified(provider,config,expectedRevision){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');
  const verified=await verifyProviderConfiguration(getProvider(provider),config);
  const result=await store.request('rpc/najd_apply_provider_config',{},'POST',{p_provider:provider,p_config:verified.config,p_expected:expectedRevision});
  await refreshConfig();
  return {...result,evidence:verified.evidence,config:verified.config};
 }
 return {...createSourceApi({store,worker,now}),start,stop,cachedWork,cachedSeason,media,summary,setConfig,applyVerified,metrics:worker.metrics,
  recordClientFeedback:async row=>store?store.event(row):null,
  wake(){if(now()-lastWake>=15000){lastWake=now();start();return worker.wake()}return worker.metrics()},
 };
}
