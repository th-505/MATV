import {getProvider,listProviders} from './scrapers/registry.mjs';

export function createLiveCatalog({providers=()=>listProviders().map(meta=>getProvider(meta.id)),now=Date.now,timeoutMs=7000}={}) {
  let cached=null,pending=null;
  async function read() {
    if(cached && cached.expires>now())return {...cached.value,cached:true};
    if(pending)return pending;
    pending=(async()=>{
      const entries=providers().filter(entry=>entry?.meta.capabilities?.live && typeof entry.module.scrapeLive==='function');
      const results=await Promise.all(entries.map(async entry=>{
        const controller=new AbortController();let timer;
        try {
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('LIVE_TIMEOUT'));},timeoutMs);});
          const rows=await Promise.race([Promise.resolve().then(()=>entry.module.scrapeLive({signal:controller.signal,timeoutMs,strict:true})),timeout]);
          if(rows?._meta?.ok===false && rows._meta.errorCode!=='EMPTY_RESULT')throw Error(rows._meta.errorCode || 'LIVE_UNAVAILABLE');
          const data=(Array.isArray(rows)?rows:[]).filter(row=>row.type==='live' && row.category!=='match' && !row.homeTeam && !row.team1).slice(0,120).map(row=>({
            id:row.id || row.ref,ref:row.ref || row.id,title:String(row.title || row.name || '').slice(0,512),
            poster:row.poster || row.image || '',type:'live',source:entry.meta.id,
          })).filter(row=>row.ref && row.title);
          return {provider_id:entry.meta.id,state:data.length?'success':'no_results',data};
        } catch(error){return {provider_id:entry.meta.id,state:'error',code:String(error.message),data:[]};}
        finally{clearTimeout(timer);}
      }));
      const seen=new Set();
      const data=results.flatMap(result=>result.data).filter(row=>{if(seen.has(row.ref))return false;seen.add(row.ref);return true;});
      const value={status:data.length?'success':results.length && results.every(row=>row.state==='error')?'error':'no_results',data,
        diagnostics:{sources:results.map(({data,...rest})=>rest)},cached:false};
      if(value.status!=='error')cached={expires:now()+30000,value};
      return value;
    })().finally(()=>{pending=null;});
    return pending;
  }
  return {read};
}
