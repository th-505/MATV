// Network audit. Run with NODE_USE_ENV_PROXY=1 behind the managed session proxy.
// A blocked catalogue is an unverified search, never a passing/no-result check.
import { writeFile } from 'node:fs/promises';
import { SOURCE_REGISTRY, createSourceSearch } from '../server/scrapers/source-registry.mjs';
import { getProvider } from '../server/scrapers/registry.mjs';
import { createSearchTraces } from '../server/diagnostics/search-trace.mjs';
const output=process.argv[2]||'/tmp/matv-search-audit.json';
const traces=createSearchTraces();const rows=[];let cursor=0;
const sources=process.env.AUDIT_PROVIDERS?SOURCE_REGISTRY.filter(s=>process.env.AUDIT_PROVIDERS.split(',').includes(s.id)):SOURCE_REGISTRY;
async function bounded(work,ms=65000){let timer;try{return await Promise.race([work(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('AUDIT_DEADLINE')),ms))])}finally{clearTimeout(timer)}}
async function worker(){while(cursor<sources.length){const source=sources[cursor++],entry=getProvider(source.id),mod=entry.module;const row={provider:source.id,domains:entry.meta.domains,declared_search:entry.meta.searchSpec};
 const trace=traces.start({provider:source.id,query:'catalogue-known-title audit'});
 try {await traces.run(trace,async()=>{
  let catalog=[];try{catalog=await bounded(()=>mod.scrapeCatalog(undefined,1,{strict:true}),45000)}catch(e){row.catalog_error=e.code||e.message}
  row.catalog_count=catalog.length||0;row.catalog_meta=catalog?._meta?.errorCode||null;
  const item=catalog.find(x=>x.title&&x.title.length>=3);
  const sample=item?.title || ({'3cktv':'مرعشلي',witanime:'Naruto',laroza:'مرعشلي'}[source.id] || 'Interstellar');
  const query=sample.replace(/\([^)]*\)/g,' ').replace(/الحلقة\s*\d+|الموسم\s*\d+|مترجم|مدبلج|مشاهدة|تحميل|فيلم|مسلسل|\b(?:HD|1080p|720p)\b/gi,' ').replace(/\s+/g,' ').trim().slice(0,100);
  row.query=query;row.known_title=item?.title||null;
  const search=createSourceSearch();const items=await bounded(()=>search(query,source.id));
  row.count=items.length;row.outcome=items.length?(item?'RESULTS_FOR_KNOWN_TITLE':'RESULTS_WITHOUT_CATALOG_SAMPLE'):(item?'KNOWN_TITLE_NOT_RETURNED':'EMPTY_WITHOUT_KNOWN_POSITIVE');return items;
 })}catch(e){row.outcome='SEARCH_ERROR';row.reason=e.code||e.message}
 row.events=trace.events;rows.push(row);await writeFile(output,JSON.stringify({at:new Date().toISOString(),kind:'live catalogue-to-search audit; not a device/playback certification',rows},null,2));
 console.log(JSON.stringify({provider:source.id,outcome:row.outcome,catalog:row.catalog_count,query:row.query,count:row.count,reason:row.reason}));
}}
await Promise.all([worker(),worker(),worker()]);
// Provider code can continue unwinding bounded outstanding requests; the complete report is already written.
process.exit(rows.length===sources.length?0:1);
