import {referenceUrl} from '../../harvest/episode-index.mjs';
/** Evidence from a provider that follows an episode's observed parent before returning details. */
export function sourceEpisodeEvidence(details,source,domains){
 try{
  const same=(a,b)=>{const x=new URL(referenceUrl(a,domains)),y=new URL(referenceUrl(b,domains));return x.pathname===y.pathname&&x.search===y.search};
  if(!details.requested_source_ref||!details.observed_parent_ref||!details.sourceUrl||!same(source,details.requested_source_ref)||!same(details.sourceUrl,details.observed_parent_ref))return null;
  const row=(details.episodes||[]).find(e=>{try{return same(source,e.ref||e.url||e.source_ref)}catch{return false}});
  const episode=Number(row?.episode_number??row?.number),season=Number(row?.season_number??row?.season);
  if(!Number.isSafeInteger(episode)||episode<1||episode>100000||!Number.isSafeInteger(season)||season<1||season>100)return null;
  return{episode_number:episode,season_number:season};
 }catch{return null}
}
