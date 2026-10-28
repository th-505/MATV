import {identityDigits} from '../../../shared/content-identity.js';

/** Observed duration only. Never turn upload dates or the first page number into runtime. */
export function observedRuntimeMinutes(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>0&&value<=1440?value:null;
 const text=identityDigits(String(value||'')).trim().toLowerCase();if(!text)return null;
 const clock=text.match(/^(\d{1,2}):(\d{2})$/);if(clock&&Number(clock[2])<60)return Number(clock[1])*60+Number(clock[2])||null;
 const hours=Number(text.match(/(\d+)\s*(?:ساعات|ساعة|ساعه|hours?|h\b)/)?.[1])||(/ساعتين|ساعتان/.test(text)?2:/ساعة|ساعه|\bhour\b/.test(text)?1:0);
 const minutes=Number(text.match(/(\d+)\s*(?:دقيقة|دقيقه|دقائق|minutes?|mins?\b)/)?.[1])||0;
 const total=hours*60+minutes;return total>0&&total<=1440?total:null;
}
export function observedEdition(title=''){
 const text=String(title).normalize('NFKC');const dubbed=/مدبلج|دبلجة|\bdubbed\b/i.test(text),subtitled=/مترجم|ترجمة|\bsubtitled\b|\bsubbed\b/i.test(text);
 return dubbed&&subtitled?'ambiguous':dubbed?'dubbed':subtitled?'subtitled':'unknown';
}
const valid=n=>Number.isSafeInteger(n)&&n>0&&n<=100000;
export function summarizeObservedEpisodes(episodes=[]){
 const groups=new Map(),references=new Set(),owners=new Map();let unnumbered=0,conflicts=0;
 for(const row of episodes){
  const season=Number(row.season_number??row.season),number=Number(row.episode_number??row.episodeNumber??row.episode??row.number??row.num);
  const ref=String(row.source_ref||row.ref||row.url||row.link||row.id||'');
  if(!valid(season)||season>100||!valid(number)){unnumbered++;continue;}
  const key=season+':'+number;if(ref&&owners.has(ref)&&owners.get(ref)!==key){conflicts++;continue;}if(ref)owners.set(ref,key);
  if(!groups.has(season))groups.set(season,new Map());const entries=groups.get(season);if(!entries.has(number))entries.set(number,new Set());entries.get(number).add(ref||key);references.add(ref||key);
 }
 const seasons=[...groups].sort(([a],[b])=>a-b).map(([season,entries])=>{
  const numbers=[...entries.keys()].sort((a,b)=>a-b),gaps=[];let previous=0;
  for(const number of numbers){if(number>previous+1)gaps.push({from:previous+1,to:number-1});previous=number;}
  return {season,distinct_episodes:numbers.length,first:numbers[0],last:numbers.at(-1),gap_ranges:gaps,contiguous_from_one:gaps.length===0,alternative_references:[...entries.values()].reduce((n,refs)=>n+Math.max(0,refs.size-1),0)};
 });
 return {observed_references:references.size,distinct_episodes:seasons.reduce((n,s)=>n+s.distinct_episodes,0),unnumbered_references:unnumbered,conflicting_references:conflicts,seasons};
}
/** A deterministic report, never a model verdict or an invented canonical identity. */
export function decideSourceCatalog(observed,{canonical=null,identity=null,mappedEpisodes=null,pendingPages=0}={}){
 const edition=observedEdition(observed.title),runtime=observedRuntimeMinutes(observed.runtime_minutes??observed.duration),index=summarizeObservedEpisodes(observed.episodes||[]);
 const canonicalSeasons=(canonical?.seasons||[]).filter(s=>Number(s.season_number)>0);
 const canonicalIndex=mappedEpisodes?summarizeObservedEpisodes(mappedEpisodes):index;
 const complete=identity?.accepted===true&&canonicalSeasons.length>0&&canonicalIndex.seasons.length===canonicalSeasons.length&&canonicalSeasons.every(s=>{
  const actual=canonicalIndex.seasons.find(row=>row.season===Number(s.season_number));return actual?.contiguous_from_one&&actual.distinct_episodes===Number(s.episode_count);
 })&&!pendingPages&&!index.unnumbered_references&&!index.conflicting_references;
 const reasons=[];if(edition==='ambiguous')reasons.push('EDITION_AMBIGUOUS');if(index.unnumbered_references)reasons.push('UNNUMBERED_EPISODES');if(index.conflicting_references)reasons.push('SOURCE_REFERENCE_CONFLICT');if(index.seasons.some(s=>s.gap_ranges.length))reasons.push('OBSERVED_EPISODE_GAPS');if(pendingPages)reasons.push('MORE_SOURCE_PAGES');
 if(canonical&&identity?.accepted!==true)reasons.push(...(identity?.reasons||['IDENTITY_UNCONFIRMED']));
 if(canonical?.year&&!observed.year)reasons.push('RELEASE_YEAR_MISSING');
 const decision=identity?.accepted===false?'identity_unconfirmed':reasons.some(r=>['EDITION_AMBIGUOUS','SOURCE_REFERENCE_CONFLICT'].includes(r))?'ambiguous':!index.distinct_episodes?'no_observed_episodes':canonical&&!complete?'partial':'source_indexed';
 return {schema_version:1,decision,edition,runtime_minutes:runtime,index,canonical_identity_verified:identity?.accepted===true,canonical_complete:complete,completeness:complete?'canonical_complete':pendingPages||index.seasons.some(s=>s.gap_ranges.length)?'partial':'unconfirmed',reasons:[...new Set(reasons)],next_actions:[...new Set([...(pendingPages?['follow_observed_pagination']:[]),...(reasons.includes('RELEASE_YEAR_MISSING')?['inspect_release_metadata']:[]),...(identity?.accepted===true&&index.distinct_episodes?['resolve_observed_episodes']:[])])],playback_verified:false};
}
/** Only diagnostics are shortened; the real episode rows and source seasons are retained. */
export function compactCatalogDecision(decision){return{...decision,index:{...decision.index,season_rows_truncated:decision.index.seasons.length>16,seasons:decision.index.seasons.slice(0,16).map(row=>({...row,gap_range_count:row.gap_ranges.length,gap_ranges_truncated:row.gap_ranges.length>2,gap_ranges:row.gap_ranges.slice(0,2)}))}};}
