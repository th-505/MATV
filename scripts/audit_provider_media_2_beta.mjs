// Private, bounded live audit. Reports container evidence, never decoded playback.
import {writeFile, mkdir, readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomInt} from 'node:crypto';
import {getProvider,listIndependentProviders} from '../server/scrapers/registry.mjs';
import {contentIdentity} from '../shared/content-identity.js';
import {isValidDirectMediaUrl} from '../server/scrapers/stream-unwrapper.mjs';
import {probeHarvestMedia} from '../server/harvest/media-probe.mjs';
const root='/workspace/artifacts/najd-beta2-live-media-private';
await mkdir(root,{recursive:true});
const provider=process.argv.find(x=>x.startsWith('--provider='))?.split('=')[1];
if(provider){
 const entry=getProvider(provider),mod=entry.module;
 const result={provider,domain:new URL(entry.meta.domains[0]).hostname,at:new Date().toISOString(),stage:'catalog',cases:[]};
 const save=()=>writeFile(root+'/'+provider+'.json',JSON.stringify(result,null,2));
 const options={strict:true,allowHttp:false,timeoutMs:6500,maxRetries:0};
 const categories=Object.values(mod).find(v=>v&&typeof v==='object'&&v.categories)?.categories||{};
 const cached=new Map();
 for(const kind of entry.meta.capabilities.live?['live']:['movie','series']){
  const row={kind,stage:'catalog'};result.cases.push(row);await save();
  try{
   const keys=Object.keys(categories);
   const category=kind==='live'?keys.find(x=>/today|live/i.test(x)):keys.find(x=>kind==='movie'?/movie|film|aflam/i.test(x):/series|tv|moslslat/i.test(x)&&!/movies|films/i.test(x));
   const cacheKey=category||'default';
   let catalog=cached.get(cacheKey);
   if(!catalog){catalog=await mod.scrapeCatalog(category,1,options);cached.set(cacheKey,catalog);}
   row.catalog_count=Array.isArray(catalog)?catalog.length:0;
   row.catalog_error=catalog?._meta?.errorCode||null;
   let matching=(Array.isArray(catalog)?catalog:[]).filter(i=>kind==='live'||contentIdentity(i).type===kind);
   if(!matching.length && category){
    let fallback=cached.get('default');
    if(!fallback){fallback=await mod.scrapeCatalog(undefined,1,options);cached.set('default',fallback);}
    const observed=(Array.isArray(fallback)?fallback:[]).filter(i=>kind==='live'||contentIdentity(i).type===kind);
    if(observed.length){matching=observed;row.sample_basis='same-provider-default-catalog';}
   }
   const sample=matching.length?matching[randomInt(matching.length)]:null;
   if(!sample){row.outcome='NO_OBSERVED_SAMPLE';await save();continue;}
   row.observed_title=sample.title;
   row.stage='details';await save();
   const details=await mod.scrapeDetails(sample.ref||sample.url,options);
   if(!details?.title||details?._meta?.ok===false){row.outcome='DETAILS_UNAVAILABLE';row.reason=details?._meta?.errorCode;await save();continue;}
   row.detail_title=details.title;
   const episodes=(details.episodes||[]).filter(e=>Number(e.number??e.episode_number)>0&&e.watch_available!==false);
   row.episode_count=episodes.length;
   row.seasons=[...new Set(episodes.map(e=>e.season??e.season_number).filter(Boolean))];
   let target=sample.ref||sample.url;
   if(kind==='series'){
    if(!episodes.length){row.outcome='SOURCE_INDEX_UNAVAILABLE';await save();continue;}
    const episode=episodes[randomInt(episodes.length)];target=episode.ref||episode.url;
    row.selected_episode={season:episode.season??episode.season_number,number:episode.number??episode.episode_number};
   }
   row.stage='servers';await save();
   let servers=await mod.scrapeServers(target,options);
   row.server_count=Array.isArray(servers)?servers.length:0;
   let direct=(Array.isArray(servers)?servers:[]).filter(s=>s.type!=='embed'&&s.streamType!=='embed'&&isValidDirectMediaUrl(s.url));
   if(!direct.length){
    row.stage='resolve';await save();const resolved=await mod.resolveStream(target,options);
    direct=[...(resolved.servers||[]),resolved].filter(s=>isValidDirectMediaUrl(s.url||s.streamUrl)).map(s=>({...s,url:s.url||s.streamUrl}));
   }
   const seen=new Set();direct=direct.filter(c=>seen.has(c.url)?false:(seen.add(c.url),true));
   if(!direct.length){row.outcome='DIRECT_MEDIA_NOT_EXTRACTED';await save();continue;}
   row.stage='container';row.probes=[];await save();
   for(const candidate of direct.slice(0,4)){
    const evidence={host:new URL(candidate.url).hostname};
    try {
     const probe=await probeHarvestMedia(candidate,{platform:'native'});
     Object.assign(evidence,{status:probe.statusCode,container:probe.container||null,container_verified:probe.container_verified===true});
    } catch(error) { evidence.reason=error.code||'PROBE_UNAVAILABLE'; }
    row.probes.push(evidence);await save();
    if(evidence.container_verified){row.probe=evidence;row.media_host=evidence.host;break;}
   }
   row.outcome=row.probe?.container_verified?'CONTAINER_VERIFIED_NOT_DEVICE_DECODED':'NO_VERIFIED_CONTAINER_IN_TESTED_CANDIDATES';
  }catch(error){row.outcome='FAILED';row.reason=error.code||error.message?.slice(0,100)||'UNKNOWN';}
  await save();
 }
 result.stage='complete';await save();
 console.log(JSON.stringify({provider,cases:result.cases.map(c=>({kind:c.kind,outcome:c.outcome,reason:c.reason,episodes:c.episode_count,probe:c.probe}))}));
 process.exit(0);
}else{
 const providers=listIndependentProviders();let cursor=0;
 async function worker(){while(cursor<providers.length){const meta=providers[cursor++];
  await new Promise(resolve=>{
   const child=spawn(process.execPath,[process.argv[1],'--provider='+meta.id],{env:process.env,stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',data=>process.stdout.write(data));
   let error='';child.stderr.on('data',data=>error+=data.toString().slice(0,1000));
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},150000);
   child.on('exit',async code=>{clearTimeout(timer);if(timedOut||code){
    let report;try{report=JSON.parse(await readFile(root+'/'+meta.id+'.json','utf8'))}catch{report={provider:meta.id,cases:[]}}
    report.terminated=timedOut?'AUDIT_PROCESS_DEADLINE':'AUDIT_PROCESS_ERROR';await writeFile(root+'/'+meta.id+'.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify({provider:meta.id,terminated:report.terminated,stage:report.cases?.at(-1)?.stage}));
   }resolve();});
  });
 }}
 await Promise.all([worker(),worker(),worker()]);
 console.log('Independent provider media audit completed; results remain private and are not device certification.');
}
