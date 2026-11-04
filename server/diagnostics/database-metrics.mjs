import {readBoundedText} from '../scrapers/shared/http.mjs';
/** Private, single-flight, once-per-minute metrics. No raw exporter output or credentials leave the server. */
export function createDatabaseMetrics({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,fetchImpl=globalThis.fetch,now=Date.now}={}){
 let previous=null,cached=null,pending=null,next=0;
 return async function read(){
  if(pending)return pending;
  if(now()<next)return cached;
  next=now()+60000;
  pending=(async()=>{
   try{
    if(!url||!key)throw Error('METRICS_NOT_CONFIGURED');
    const target=new URL(url);
    if(target.protocol!=='https:'||!target.hostname.endsWith('.supabase.co')||target.username||target.password||target.port||target.pathname!=='/'||target.search||target.hash)throw Error('METRICS_BAD_URL');
    target.pathname='/customer/v1/privileged/metrics';
    const response=await fetchImpl(target,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Basic '+Buffer.from('service_role:'+key).toString('base64')}});
    if(!response.ok){await response.body?.cancel();throw Error('METRICS_HTTP_'+response.status)}
    const text=await readBoundedText(response,2*1024*1024);
    let total=0,idle=0,count=0;
    for(const line of text.split('\n')){
     const m=line.match(/^node_cpu_seconds_total\{([^}]*)\}\s+([0-9.eE+-]+)(?:\s|$)/);if(!m)continue;
     const mode=m[1].match(/(?:^|,)\s*mode="([a-z_]+)"/)?.[1];const value=Number(m[2]);
     if(!mode||!Number.isFinite(value)||value<0||mode==='guest'||mode==='guest_nice')continue;
     total+=value;if(mode==='idle'||mode==='iowait')idle+=value;count++;
    }
    const at=now();let cpu=null,interval=null;
    if(count&&previous&&total>previous.total&&idle>=previous.idle){cpu=Math.round(Math.max(0,Math.min(100,100*(1-(idle-previous.idle)/(total-previous.total))))*10)/10;interval=Math.round((at-previous.at)/1000);}
    previous=count?{at,total,idle}:null;
    return cached={state:cpu===null?'awaiting_sample':cpu>=90?'high':'ok',measured_at:new Date(at).toISOString(),cpu_percent:cpu,sample_interval_seconds:interval,reason:count?null:'CPU_METRIC_UNAVAILABLE'};
   }catch(error){return cached={state:'unavailable',cpu_percent:null,reason:/^METRICS_[A-Z0-9_]+$/.test(error.message)?error.message:'METRICS_UNAVAILABLE'};}
  })();try{return await pending}finally{pending=null}
 };
}
