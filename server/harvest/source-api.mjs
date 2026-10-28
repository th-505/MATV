import {workReference,canonicalWorkRef,sourceWorkRef,providerForReference} from './work-reference.mjs';
import {shortHash} from './episode-index.mjs';
import {listSourceCapabilities} from '../scrapers/source-registry.mjs';
import {directCandidate} from '../scrapers/content-discovery.mjs';

export function createSourceApi({store,worker,now=Date.now}){
 const requests=new Map(),playbackRetries=new Map();
 const labels=new Map(listSourceCapabilities().map(s=>[s.id,{provider_name:s.name_ar,domain:s.domain}]));
 const stamp=()=>new Date(now()).toISOString();
 async function request(ref,{reason='card_open'}={}){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');const key=workReference(ref);
  const existing=(await store.request('matv_discovery_jobs',{job_key:'eq.'+key+':work',select:'status,refresh_after,payload',limit:1}))?.[0];
  if(existing&&(existing.status==='queued'||existing.status==='running'||(reason!=='retry'&&Date.parse(existing.refresh_after)>now()))) {worker.wake();return{ref:key,state:existing.status,poll_after_ms:1500};}
  if(now()-(requests.get(key)||0)<10000)return{ref:key,state:existing?.status||'queued',poll_after_ms:3000};
  const work=await store.getWork(key),original=sourceWorkRef(key)?(sourceWorkRef(ref)?work?.metadata?.source_ref:ref):null;
  if(sourceWorkRef(key)&&(!original||workReference(original)!==key))throw Error('SOURCE_REFERENCE_MISSING');
  requests.set(key,now());if(requests.size>256)requests.delete(requests.keys().next().value);
  await store.enqueue({job_key:key+':work',content_ref:key,title:work?.title||'قيد التعرف على العمل',provider:original?providerForReference(original):'tmdb',stage:'work',priority:10,status:'queued',payload:{cycle:Math.floor(now()/10000),...(original?{source_ref:original}:{}),reason},last_activity_at:stamp(),refresh_after:stamp()},{refresh:true});
  worker.wake();return{ref:key,state:'queued',poll_after_ms:1500};
 }
 async function status(ref){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');const key=workReference(ref);
  const [work,jobs,sources]=await Promise.all([store.getWork(key),store.request('matv_discovery_jobs',{content_ref:'eq.'+key,select:'provider,stage,status,error_code,progress,updated_at',order:'updated_at.desc',limit:1000}),store.request('najd_source_catalog',{work_ref:'eq.'+key,select:'provider,source_ref,state,progress,updated_at',order:'updated_at.desc',limit:1000})]);
  const counts={queued:0,running:0,ready:0,failed:0};for(const row of jobs||[])if(row.status in counts)counts[row.status]++;
  const source_editions=(sources||[]).filter(row=>sourceWorkRef(row.progress?.source_work_ref)).map(row=>({ref:row.progress.source_work_ref,source_ref:row.source_ref,provider:row.provider,...(labels.get(row.provider)||{}),...(row.progress.domain?{domain:row.progress.domain}:{}),title:row.progress.title||work?.title||'نسخة المصدر',edition:row.progress.edition||'unknown',seasons:(row.progress.catalog_decision?.index?.seasons||[]).map(s=>({season:s.season,episode_count:s.distinct_episodes})),available:Boolean(row.progress.catalog_decision),reason:row.state==='identity_unconfirmed'?'CANONICAL_IDENTITY_UNCONFIRMED':null}));
  return{ref:key,state:counts.running||counts.queued?'running':work?'ready':counts.failed?'failed':'missing',phase:work?'source_indexing':'work',counts,source_editions,issues:(jobs||[]).filter(row=>row.error_code).map(row=>({provider:row.provider||null,reason:row.error_code})),updated_at:jobs?.[0]?.updated_at||work?.updated_at||null,poll_after_ms:3000,sample_limit:1000,sample_truncated:jobs?.length===1000};
 }
 async function details(ref,{season,offset=0}={}){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');const key=workReference(ref);if(!sourceWorkRef(key))throw Error('SOURCE_WORK_REQUIRED');
  const work=await store.getWork(key);if(!work)throw Error('SOURCE_INDEX_PENDING');
  const metadata=work.metadata||{},seasons=metadata.seasons||[];let selected=Number(season);
  if(work.type==='movie')selected=0;else if(!seasons.some(s=>Number(s.season_number)===selected))selected=Number(seasons[0]?.season_number)||1;
  const rows=work.type==='movie'?[]:await store.episodes(key,{season:selected,limit:100,offset,indexedSince:metadata.index_started_at});
  return{...metadata,ref:key,source_title:metadata.title,title:metadata.catalog_metadata?.title||metadata.title,poster:metadata.catalog_metadata?.poster||metadata.poster||'',year:metadata.catalog_metadata?.year||metadata.year||null,observed_year:metadata.year||null,observed_overview:metadata.overview||'',overview:metadata.catalog_metadata?.overview||metadata.overview||'',plot:metadata.catalog_metadata?.overview||metadata.overview||'',available_seasons:seasons.map(s=>s.season_number),season_number:selected,episodes:(rows||[]).map(row=>({id:shortHash(row.source_ref),ref:key+':s'+row.season+':e'+row.episode,title:String(row.title||'الحلقة '+row.episode).slice(0,200),episode_number:row.episode,season_number:row.season,watch_available:row.episode>0})),episode_pagination:{has_more:rows?.length===100,next_offset:rows?.length===100?offset+100:null}};
 }
 async function playback(ref,{season=1,episode=1,platform='native',refresh=false}={}){
  if(!store)throw Error('HARVEST_NOT_CONFIGURED');const key=workReference(ref);if(!sourceWorkRef(key))throw Error('SOURCE_WORK_REQUIRED');
  const work=await store.getWork(key);if(!work)return{state:'unavailable',reason:'SOURCE_INDEX_PENDING'};
  if(work.type==='movie'){season=0;episode=0;}
  if(![season,episode].every(Number.isSafeInteger)||season<0||season>100||episode<0||episode>100000)throw Error('HARVEST_BAD_EPISODE');
  const rows=await store.episodes(key,{season,episode,limit:100,indexedSince:work.metadata.index_started_at});if(!rows?.length)return{state:'unavailable',reason:'SOURCE_EPISODE_NOT_FOUND'};
  const matching=await store.request('matv_discovery_jobs',{content_ref:'eq.'+key,stage:'eq.episode',season_number:'eq.'+season,episode_number:'eq.'+episode,select:'job_key,status,error_code,payload,updated_at',limit:100});
  const forcing=(matching||[]).find(j=>['queued','running'].includes(j.status)&&j.payload?.force_refresh===true);
  if(forcing){worker.wake();return{state:forcing.status,poll_after_ms:1500};}
  const servers=[],seen=new Set();
  for(const row of rows)for(const media of row.media||[]){
   if(refresh||row.state!=='playable'||!directCandidate(media)||media.identity_verified!==true||Date.parse(media.expires_at)<=now()+30000||(platform==='web'&&media.web_playable!==true)||Number(media.observed_identity?.season)!==season||Number(media.observed_identity?.episode)!==episode||seen.has(media.url))continue;
   seen.add(media.url);servers.push({...media,provider_id:row.provider,source_ref:row.source_ref,edition:work.metadata.edition,label:work.metadata.source_edition==='dubbed'?'مدبلج':work.metadata.source_edition==='subtitled'?'مترجم':media.quality||'المصدر'});
  }
  if(platform==='web'&&!servers.length&&rows.some(r=>r.state==='playable'&&r.media?.some(m=>m.identity_verified&&Date.parse(m.expires_at)>now()+30000)))return{state:'unavailable',reason:'PINNED_DIRECT_WEB_UNAVAILABLE'};
  if(servers.length)return{state:'ready',servers,cache_hit:true,source:'najd-source-edition-cache'};
  const row=rows.find(r=>r.state!=='unavailable')||rows[0];const jobKey=[key,'episode',row.provider,shortHash(row.source_ref)].join(':');
  const current=(await store.request('matv_discovery_jobs',{job_key:'eq.'+jobKey,select:'status,error_code,payload',limit:1}))?.[0];
  if(current?.status==='failed'&&(!refresh||now()-(playbackRetries.get(jobKey)||0)<10000))return{state:'failed',reason:current.error_code||'DIRECT_MEDIA_NOT_FOUND'};
  if(refresh){playbackRetries.set(jobKey,now());if(playbackRetries.size>256)playbackRetries.delete(playbackRetries.keys().next().value);}
  if(current?.status==='queued')await store.request('matv_discovery_jobs',{job_key:'eq.'+jobKey,status:'eq.queued'},'PATCH',{priority:10,refresh_after:stamp(),updated_at:stamp(),...(refresh?{payload:{...current.payload,force_refresh:true}}:{})});
  if(!refresh&&row.state==='unavailable'&&Date.parse(row.last_checked_at)>now()-60000)return{state:'unavailable',reason:'DIRECT_MEDIA_NOT_FOUND'};
  if(!current||!['queued','running'].includes(current.status))await store.enqueue({job_key:jobKey,content_ref:key,title:work.title.length>=2?work.title:'عمل '+work.title,provider:row.provider,stage:'episode',priority:10,status:'queued',season_number:season,episode_number:episode,payload:{source_ref:row.source_ref,cycle:Math.floor(now()/10000),force_refresh:refresh,identity_scope:'source',observed_identity:{title:work.title,year:work.year||null},observed_episode:{season,episode,source_season:season,source_episode:episode,numbering_basis:'source-season'}},last_activity_at:stamp(),refresh_after:stamp()},{refresh:true});
  worker.wake();return{state:current?.status==='running'?'running':'queued',poll_after_ms:1500};
 }
 return{requestWork:request,workStatus:status,sourceDetails:details,sourcePlayback:playback};
}
