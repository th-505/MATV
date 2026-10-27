import {supportsContent} from '../scrapers/content-scope.mjs';
import {shortHash,referenceUrl,scanEpisodeIndex} from './episode-index.mjs';
import {matchHarvestIdentity,harvestQueryVariants,mediaExpiry} from './identity.mjs';
import {fetchProviderHtml} from '../scrapers/shared/http.mjs';
import {directCandidate} from '../scrapers/content-discovery.mjs';
import {probePinnedMedia} from '../pinned-playback.mjs';
import {unwrapEmbedToDirectStreams} from '../scrapers/stream-unwrapper.mjs';
import {contentIdentity} from '../../shared/content-identity.js';

export function createHarvestPipeline({store,metadata,entries,now=Date.now,probe=probePinnedMedia,fetchPage=fetchProviderHtml}={}){
 const byId=new Map(entries.filter(e=>!e.meta.mirrorOf&&e.meta.capabilities?.search&&e.meta.capabilities?.details).map(e=>[e.meta.id,e]));
 const network={strict:true,timeoutMs:8000,maxRetries:0};
 const domains=entry=>entry.meta.domains.map(u=>{try{return new URL(u).hostname}catch{return u}});
 const job=(ref,provider,stage,suffix,payload,title,season=0,episode=0)=>({job_key:[ref,stage,provider,shortHash(suffix)].join(':'),content_ref:ref,title:String(title||'قيد التعرف على العمل').slice(0,250),provider,stage,payload,season_number:season,episode_number:episode,priority:stage==='episode'?4:7,status:'queued'});
 async function event(work_ref,provider,stage,outcome,reason,details={}){await store.event({work_ref,provider,stage,outcome,reason,details}).catch(()=>{})}
 async function work(input){
  const ref=input.content_ref;const m=(await metadata.details(ref)).data;
  if(!m?.title)throw Error('HARVEST_CANONICAL_IDENTITY_UNAVAILABLE');
  const series=ref.startsWith('tmdb:tv:');
  await store.putWork({ref,tmdb_id:Number(m.id||ref.split(':').pop()),type:series?'series':'movie',title:m.title,original_title:m.original_title||'',aliases:m.aliases||[],year:m.year||null,runtime_minutes:m.runtime_minutes||null,genres:m.genres||[],poster:m.poster||'',season_count:m.number_of_seasons||null,episode_count:m.number_of_episodes||null,metadata:m,state:'harvesting',last_checked_at:new Date(now()).toISOString(),last_requested_at:new Date(now()).toISOString(),expires_at:new Date(now()+7*86400000).toISOString(),updated_at:new Date(now()).toISOString()});
  const cycle=Math.floor(now()/3600000);
  const children=[...byId.values()].filter(e=>e.meta.enabled!==false&&supportsContent(e.meta.id,m)).map(entry=>job(ref,entry.meta.id,'provider','search',{phase:'search',query_index:0,page:1,cycle},m.title));
  for(const row of m.seasons||[])children.push(job(ref,'tmdb','season',String(row.season_number),{cycle},m.title,row.season_number,0));
  await store.enqueueMany(children);
  await event(ref,null,'work','indexed',null,{providers:byId.size,declared_episodes:m.number_of_episodes||null});
  return {progress:{outcome:'canonical_indexed',providers:byId.size}};
 }
 async function provider(input){
  const entry=byId.get(input.provider);if(!entry)throw Error('HARVEST_PROVIDER_UNAVAILABLE');
  const cached=await store.getWork(input.content_ref);if(!cached)throw Error('HARVEST_WORK_MISSING');
  const expected=cached.metadata;const payload=input.payload||{};const allowed=domains(entry);const ref=input.content_ref;
  if(payload.phase==='search'){
   const queries=harvestQueryVariants(expected);const query=queries[payload.query_index||0];if(!query)return {progress:{outcome:'no_verified_match'}};
   const response=await entry.module.scrapeSearch(query,payload.page||1,{...network,searchPageUrl:payload.next_url});
   if(response?._meta?.errorCode)throw Error(response._meta.errorCode);
   const hits=Array.isArray(response)?response:response?.data||[];
   let accepted=0;let examined=0;const jobs=[];
   // A search page is bounded by its actual server response. Each candidate is its own resumable DB job.
   for(const hit of hits){
    const target=hit.ref||hit.url||hit.id;if(!target)continue;
    const preliminary=matchHarvestIdentity(expected,{...hit,type:contentIdentity(hit).type});
    if(preliminary.reasons.includes('YEAR_CONFLICT')&&!hit.episode_number)continue;
    if(preliminary.evidence.title_similarity<.35&&!preliminary.evidence.title_exact)continue;
    const safeUrl=referenceUrl(target,allowed);examined++;
    jobs.push(job(ref,entry.meta.id,'provider','catalog:'+safeUrl,{phase:'catalog',cycle:payload.cycle,source_ref:target,url:safeUrl,hit:{title:hit.title,year:hit.year||null,type:hit.type,poster:hit.poster||null},page:1},expected.title));accepted++;
   }
   await store.enqueueMany(jobs);
   const next=response?._meta?.next_page||response?.pagination?.next_page;
   if(next&&(Number(next)>Number(payload.page||1)))return {continuation:{...payload,page:Number(next),next_url:response?._meta?.next_url||null},progress:{outcome:'search_paginating',examined,queued_catalogs:accepted}};
   if((payload.query_index||0)+1<queries.length)return {continuation:{phase:'search',query_index:(payload.query_index||0)+1,page:1,cycle:payload.cycle},progress:{outcome:'searching_aliases',examined,queued_catalogs:accepted}};
   await event(ref,entry.meta.id,'search',accepted?'candidates':'empty_unconfirmed',null,{examined,queued_catalogs:accepted});
   return {progress:{outcome:accepted?'candidates_queued':'empty_unconfirmed',queued_catalogs:accepted}};
  }
  const target=payload.url||referenceUrl(payload.source_ref,allowed);
  const details=await entry.module.scrapeDetails(payload.source_ref||target,network);
  const observed={...(payload.hit||{}),...details};
  const identity=matchHarvestIdentity(expected,observed);
  if(!identity.accepted){await event(ref,entry.meta.id,'identity','quarantined',identity.reasons[0],{score:identity.score,evidence:identity.evidence});return {progress:{outcome:'identity_unconfirmed',reason:identity.reasons[0]}};}
  const html=(await fetchPage(target,{...network,providerId:entry.meta.id,allowedHosts:allowed})).html;
  const index=scanEpisodeIndex(html,target,{provider:entry.meta.id,domains:allowed,title:details.title||expected.title,episodes:details.episodes||[]});
  const sourceRef=payload.source_ref||entry.meta.id+':'+Buffer.from(target).toString('base64url');
  const declared=Number(expected.number_of_episodes)||null;
  const partial=index.pages.length>0||Boolean(declared&&index.episodes.length<declared);
  await store.putSource({work_ref:ref,provider:entry.meta.id,source_ref:sourceRef,identity_score:identity.score,evidence:identity.evidence,state:partial?'partial':'indexed',progress:{observed_episodes:index.episodes.length,additional_pages:index.pages.length,parent_pages:index.parents.length},updated_at:new Date(now()).toISOString()});
  const series=cached.type==='series';const rows=series?index.episodes:[{source_ref:sourceRef,season:0,episode:0,title:details.title||expected.title}];
  // All observed rows are retained; batching is transport sizing, never an episode cap.
  await store.putEpisodes(rows.map(({url,...row})=>({...row,work_ref:ref,provider:entry.meta.id})));
  const children=rows.map(row=>job(ref,entry.meta.id,'episode',row.source_ref,{source_ref:row.source_ref,cycle:payload.cycle,identity_evidence:identity.evidence},expected.title,row.season,row.episode));
  for(const page of [...index.parents,...index.pages])children.push(job(ref,entry.meta.id,'provider','catalog:'+page,{...payload,phase:'catalog',url:page,source_ref:entry.meta.id+':'+Buffer.from(page).toString('base64url'),hit:payload.hit||{},page:(payload.page||1)+1},expected.title));
  await store.enqueueMany(children);
  await event(ref,entry.meta.id,'catalog',partial?'partial':'indexed',null,{observed_episodes:rows.length,more_pages:index.pages.length,declared_episodes:expected.number_of_episodes||null});
  return {progress:{outcome:rows.length?'episode_jobs_queued':'no_observed_episodes',observed_episodes:rows.length,more_pages:index.pages.length}};
 }
 async function episode(input){
  const entry=byId.get(input.provider);if(!entry)throw Error('HARVEST_PROVIDER_UNAVAILABLE');
  const ref=input.content_ref,source=input.payload.source_ref;
  const current=await store.getEpisode(ref,entry.meta.id,source);
  if(current?.state==='playable'&&Date.parse(current.media_expires_at)>now()+65*60000)return {progress:{outcome:'valid_cached_media'}};
  await store.setEpisode(ref,entry.meta.id,source,{state:'resolving'});
  const d=await entry.module.scrapeDetails(source,network);
  const identity=contentIdentity(d);
  if(input.episode_number&&identity.episode_number&&identity.episode_number!==input.episode_number)throw Error('HARVEST_EPISODE_IDENTITY_CONFLICT');
  let candidates=[...(d?.media_sources||[]),...(d?.servers||[])].filter(directCandidate);
  if(!candidates.length&&typeof entry.module.scrapeServers==='function')candidates=(await entry.module.scrapeServers(source,network)).filter(directCandidate);
  if(!candidates.length){const target=referenceUrl(source,domains(entry));candidates=await unwrapEmbedToDirectStreams(target,target);}
  const media=[];
  for(const candidate of candidates){
   if(!directCandidate(candidate))continue;const expires=mediaExpiry(candidate,now());if(!expires)continue;
   let technical;try{technical=await probe(candidate,{platform:'native'})}catch{continue}
   if(!technical.playable)continue;
   const publicHeaders={};for(const[k,v]of Object.entries(candidate.headers||{}))if(['referer','origin','user-agent','cookie'].includes(k.toLowerCase())&&typeof v==='string'&&!/[\r\n]/.test(v))publicHeaders[k]=v;
   media.push({...candidate,provider:entry.meta.id,kind:'direct',headers:publicHeaders,expires_at:new Date(expires).toISOString(),identity_verified:true,verification_basis:'canonical-work-source-metadata-and-probe',web_playable:technical.webPlayable===true,season:input.season_number,episode:input.episode_number});
  }
  const expiry=media.length?Math.min(...media.map(x=>Date.parse(x.expires_at))):null;
  await store.setEpisode(ref,entry.meta.id,source,{state:media.length?'playable':'unavailable',media,media_expires_at:expiry?new Date(expiry).toISOString():null,last_checked_at:new Date(now()).toISOString()});
  await store.request('najd_work_catalog',{ref:'eq.'+ref},'PATCH',{state:media.length?'playable':'partial',updated_at:new Date(now()).toISOString()});
  await event(ref,entry.meta.id,'episode',media.length?'playable':'unavailable',media.length?null:'DIRECT_MEDIA_NOT_FOUND',{season:input.season_number,episode:input.episode_number,media_count:media.length});
  return {refreshAt:expiry?Math.max(now()+60000,expiry-5*60000):now()+3600000,progress:{outcome:media.length?'playable':'unavailable',media_count:media.length}};
 }
 async function season(input){
  const response=await metadata.season(input.content_ref,input.season_number);
  if(!response.data)throw Error('TMDB_SEASON_UNAVAILABLE');
  await store.putSeason({work_ref:input.content_ref,season:input.season_number,metadata:response.data,expires_at:new Date(now()+7*86400000).toISOString(),updated_at:new Date(now()).toISOString()});
  return {progress:{outcome:'canonical_season_indexed',episodes:response.data.episodes?.length||0}};
 }
 return {work,provider,episode,season};
}
