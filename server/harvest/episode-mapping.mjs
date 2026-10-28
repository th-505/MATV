/** Keep both identities: source absolute numbering must never overwrite TMDB numbering. */
export function mapSourceEpisodes(rows,metadata){
 const seasons=(metadata.seasons||[]).filter(s=>Number(s.season_number)>0).sort((a,b)=>a.season_number-b.season_number);
 const unchanged=()=>rows.map(row=>({...row,source_season:row.season,source_episode:row.episode,numbering_basis:'source-season'}));
 if(seasons.length<2||seasons.some((s,i)=>Number(s.season_number)!==i+1||!Number.isSafeInteger(Number(s.episode_count))||Number(s.episode_count)<1))return unchanged();
 // Only a contiguous, work-verified catalog beginning at 1 and crossing the first
 // canonical season boundary establishes an absolute-numbered source index.
 // Mixed or independently numbered seasons stay untouched; partial tails are ambiguous.
 const numbers=[...new Set(rows.map(r=>r.episode))].sort((a,b)=>a-b);
 const first=Number(seasons[0].episode_count),total=seasons.reduce((n,s)=>n+Number(s.episode_count),0);
 if(rows.some(r=>r.season!==1)||numbers.length<=first||numbers[numbers.length-1]>total||numbers.some((n,i)=>n!==i+1))return unchanged();
 return rows.map(row=>{
  let offset=0;for(const s of seasons){const count=Number(s.episode_count);if(row.episode<=offset+count)return {...row,season:Number(s.season_number),episode:row.episode-offset,source_season:row.season,source_episode:row.episode,numbering_basis:'contiguous-source-canonical-season-counts',numbering_offset:offset};offset+=count;}
  return row;
 });
}

export function episodeMatchesMapping(identity,input){
 const mapping=input.payload?.observed_episode;
 if(mapping?.numbering_basis==='contiguous-source-canonical-season-counts'){
  return Number(mapping.season)===Number(input.season_number)&&Number(mapping.episode)===Number(input.episode_number)&&
   Number(identity.season_number)===Number(mapping.source_season)&&Number(identity.episode_number)===Number(mapping.source_episode)&&
   Number(mapping.source_episode)===Number(input.episode_number)+Number(mapping.numbering_offset);
 }
 return Number(identity.season_number)===Number(input.season_number)&&Number(identity.episode_number)===Number(input.episode_number);
}
