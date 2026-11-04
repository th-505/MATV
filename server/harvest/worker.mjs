import {randomUUID} from 'node:crypto';
/** Atomic DB leases, bounded work, heartbeat and restart recovery. No in-memory-only queue. */
export function createHarvestWorker({store,handlers,concurrency=2,pollMs=3000,logger=()=>{}}={}){
 const worker=randomUUID();let active=0,polling=false,stopped=true,timer=null;const running=new Set();
 const lanes=typeof store?.claimLane==='function'?{search:20,index:4,media:2}:null;
 const laneActive={search:0,index:0,media:0};
 const reason=e=>/^[A-Z][A-Z0-9_]{2,79}$/.test(e?.code||e?.message)?e.code||e.message:'HARVEST_JOB_FAILED';
 async function run(job,lane=null){
  active++;if(lane)laneActive[lane]++;let heartbeat;
  const task=(async()=>{
   await Promise.resolve(); // Register the task before a synchronous failure can finalize it.
   heartbeat=setInterval(()=>store.heartbeat(job.job_key,worker).catch(()=>{}),25000);heartbeat.unref?.();
   try{const handler=handlers[job.stage];if(!handler)throw Error('HARVEST_STAGE_NOT_SUPPORTED');
    const result=await handler(job);clearInterval(heartbeat);await store.complete(job,worker,result);
    logger({event:'najd_harvest',stage:job.stage,provider:job.provider||null,outcome:result?.progress?.outcome||'completed'});
   }catch(error){clearInterval(heartbeat);await store.fail(job,worker,reason(error)).catch(()=>{});logger({event:'najd_harvest',stage:job.stage,provider:job.provider||null,outcome:'failed',reason:reason(error)});}
   finally{active--;if(lane)laneActive[lane]--;running.delete(task);if(!stopped)queueMicrotask(pulse);}
  })();running.add(task);return task;
 }
 async function pulse(){
  if(stopped||polling||!store||(!lanes&&active>=concurrency))return;
  polling=true;try{
   if(lanes){
    const claimed=await Promise.allSettled(Object.entries(lanes).map(async([lane,limit])=>{
     const capacity=limit-laneActive[lane];if(capacity<=0)return;
     const jobs=await store.claimLane(worker,capacity,lane);
     for(const job of jobs||[])void run(job,lane);
    }));
    for(const result of claimed)if(result.status==='rejected')logger({event:'najd_harvest_poll',reason:reason(result.reason)});
   }else{const jobs=await store.claim(worker,concurrency-active);for(const job of jobs||[])void run(job)}
  }catch(e){logger({event:'najd_harvest_poll',reason:reason(e)})}finally{polling=false}
 }
 function start(){if(!stopped||!store)return;stopped=false;timer=setInterval(pulse,pollMs);timer.unref?.();void pulse()}
 async function stop(){stopped=true;clearInterval(timer);await Promise.allSettled([...running])}
 return {start,stop,wake:()=>{start();void pulse();return {configured:Boolean(store),active,concurrency:lanes?26:concurrency,lanes:lanes?{...laneActive}:null}},metrics:()=>({configured:Boolean(store),active,concurrency:lanes?26:concurrency,lanes:lanes?{...laneActive}:null,polling,worker})};
}
