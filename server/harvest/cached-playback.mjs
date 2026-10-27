import{directCandidate,matchesIdentity}from'../scrapers/content-discovery.mjs';
/** Private verified media only; this path never fetches a source page, TMDB or Gemini. */
export async function readCachedPlayback(harvest,{ref,season=1,episode=1,platform='native'}={},now=Date.now){
 if(!/^tmdb:(?:movie|tv):[1-9]\d{0,9}$/.test(String(ref)))return null;
 const work=await harvest.cachedWork(ref);if(!work?.data?.title||!work.data.year)return null;
 const series=ref.startsWith('tmdb:tv:');season=series?Number(season):0;episode=series?Number(episode):0;
 if(series){if(!Number.isSafeInteger(season)||season<1||season>100||!Number.isSafeInteger(episode)||episode<1||episode>100000)return null;
  const index=await harvest.cachedSeason(ref,season);
  if(!index?.data?.episodes?.some(row=>Number(row.episode_number)===episode))return null;
 }
 const sources=await harvest.media(ref,{season,episode,platform});
 const servers=(sources||[]).filter(source=>{
  const observed=source.observed_identity||{};
  return source.identity_verified===true&&directCandidate(source)&&Date.parse(source.expires_at)>now()+120000&&
   matchesIdentity(observed,work.data.title,{year:work.data.year,aliases:[work.data.original_title,...(work.data.aliases||[])]})&&
   (!series||(Number(observed.season)===season&&Number(observed.episode)===episode));
 }).map(source=>({provider:source.provider,quality:source.quality||null,kind:'direct',url:source.url,headers:source.headers||{},identity_verified:true,verification_basis:source.verification_basis,expires_at:source.expires_at}));
 return servers.length?{servers,reason:null,cache_hit:true,source:'najd-private-cache'}:null;
}
