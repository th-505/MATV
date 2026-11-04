import {randomUUID} from 'node:crypto';
/** Atomic DB leases, bounded work, heartbeat and restart recovery. No in-memory-only queue. */
export function createHarvestWorker({store,handlers,concurrency=2,pollMs=3000,backgroundPollMs=30000,scanBacklog=true,now=Date.now,logger=()=>{}}={}){
 const worker=randomUUID();let active=0,polling=false,stopped=true,timer=null;const running=new Set();
 let lanes=typeof store?.claimLane==='function'?{search:20,index:4,media:2}:null;
 const nextSweep={search:0,index:0,media:0};const retryAt={search:0,index:0,media:0};const failures={search:0,index:0,media:0};
 const laneActive={search:0,index:0,media:0};const lanePolling=new Set();const known={search:new Set(),index:new Set(),media:new Set()};let knownSupported=typeof store?.claimKnown==='function';
 function remember(job){
  if(!knownSupported||!job?.job_key)return;
  const lane=job.stage==='episode'?'media':job.stage==='provider'&&job.payload?.phase==='search'?'search':'index';
  const keys=known[lane];keys.add(job.job_key);if(keys.size>1000)keys.delete(keys.values().next().value);
 }
 store?.onQueued?.(job=>{remember(job);if(!stopped)queueMicrotask(pulse)});
 const reason=e=>['AbortError','TimeoutError'].includes(e?.name)?'HARVEST_DB_TIMEOUT':/^[A-Z][A-Z0-9_]{2,79}$/.test(e?.code||e?.message)?e.code||e.message:'HARVEST_JOB_FAILED';
 async function run(job,lane=null){
  active++;if(lane)laneActive[lane]++;let heartbeat;
  const task=(async()=>{
   await Promise.resolve(); // Register the task before a synchronous failure can finalize it.
   logger({event:'najd_harvest_start',stage:job.stage,provider:job.provider||null,phase:job.payload?.phase||job.stage,lane,active:lane?laneActive[lane]:active});
   heartbeat=setInterval(()=>store.heartbeat(job.job_key,worker).catch(()=>{}),25000);heartbeat.unref?.();
   try{const handler=handlers[job.stage];if(!handler)throw Error('HARVEST_STAGE_NOT_SUPPORTED');
    const result=await handler(job);clearInterval(heartbeat);await store.complete(job,worker,result);
    logger({event:'najd_harvest',stage:job.stage,provider:job.provider||null,outcome:result?.progress?.outcome||'completed'});
   }catch(error){clearInterval(heartbeat);await store.fail(job,worker,reason(error)).catch(()=>{});logger({event:'najd_harvest',stage:job.stage,provider:job.provider||null,outcome:'failed',reason:reason(error)});}
   finally{active--;if(lane)laneActive[lane]--;running.delete(task);if(!stopped)queueMicrotask(pulse);}
  })();running.add(task);return task;
 }
 async function pulse(force=false){
  if(stopped||!store||(!lanes&&(polling||active>=concurrency)))return;
  polling=true;try{
   if(lanes){
    const claimed=await Promise.allSettled(Object.entries(lanes).map(async([lane,limit])=>{
     const capacity=limit-laneActive[lane];if(capacity<=0||lanePolling.has(lane))return;
     const keys=knownSupported?[...known[lane]].slice(0,capacity):[];
     if(!scanBacklog&&!keys.length)return;
     if(now()<retryAt[lane]||(!force&&!keys.length&&now()<nextSweep[lane]))return;
     lanePolling.add(lane);
     try{
      let jobs;
      if(keys.length){
       try{jobs=await store.claimKnown(worker,capacity,lane,keys);for(const key of keys)known[lane].delete(key)}
       catch(error){if(error?.message==='HARVEST_DB_HTTP_404'){knownSupported=false;jobs=await store.claimLane(worker,capacity,lane)}else throw error}
      }else jobs=await store.claimLane(worker,capacity,lane);
      failures[lane]=0;retryAt[lane]=0;nextSweep[lane]=now()+backgroundPollMs;
      for(const job of jobs||[])void run(job,lane);
     }catch(error){if(error?.message!=='HARVEST_DB_HTTP_404'){failures[lane]++;retryAt[lane]=now()+Math.min(120000,5000*2**Math.min(failures[lane]-1,5));}throw error;}finally{lanePolling.delete(lane)}
    }));
    for(const result of claimed)if(result.status==='rejected'){
     logger({event:'najd_harvest_poll',reason:reason(result.reason)});
     // A temporarily older DB schema keeps the compatible worker, never a dead queue.
     if(result.reason?.message==='HARVEST_DB_HTTP_404')lanes=null;
    }
   }else{if(!scanBacklog)return;const jobs=await store.claim(worker,concurrency-active);for(const job of jobs||[])void run(job)}
  }catch(e){logger({event:'najd_harvest_poll',reason:reason(e)})}finally{polling=lanePolling.size>0}
 }
 function start(){if(!stopped||!store)return;stopped=false;timer=setInterval(pulse,pollMs);timer.unref?.();void pulse()}
 async function stop(){stopped=true;clearInterval(timer);await Promise.allSettled([...running])}
 return {start,stop,wake:({jobs=[]}={})=>{for(const job of jobs)remember(job);start();void pulse(true);return {configured:Boolean(store),active,concurrency:lanes?26:concurrency,lanes:lanes?{...laneActive}:null}},metrics:()=>({configured:Boolean(store),active,concurrency:lanes?26:concurrency,lanes:lanes?{...laneActive}:null,polling,worker})};
}
