export const BROWSE_SECTIONS = Object.freeze({
 movies:[['catalog:movie:all','الكل'],['catalog:movie:en','أجنبي'],['catalog:movie:ar','عربي'],['catalog:movie:hi','هندي'],['catalog:movie:ko','آسيوي'],['catalog:movie:tr','تركي']],
 series:[['catalog:tv:all','الكل'],['catalog:tv:en','أجنبي'],['catalog:tv:ar','عربي'],['catalog:tv:tr','تركي'],['catalog:tv:ko','آسيوي']],
 anime:[['catalog:anime:movie','أفلام أنمي'],['catalog:anime:tv','مسلسلات أنمي']],
 turkish:[['catalog:turkish:tv','مسلسلات تركية'],['catalog:turkish:movie','أفلام تركية']],
});
export function browseRequest(ref,page=1){
 const known=Object.values(BROWSE_SECTIONS).flat().some(row=>row[0]===ref);
 const number=Number(page);if(!known || !Number.isInteger(number)||number<1||number>500)throw Error('INVALID_CATALOG_SECTION');
 const [,group,value]=ref.split(':');
 const type=group==='movie'||group==='tv'?group:value;
 const language=group==='anime'?'ja':group==='turkish'?'tr':value==='all'?null:value;
 return {path:`/discover/${type}`,type,params:{page:String(number),sort_by:'popularity.desc',
   ...(language?{with_original_language:language}:{}),...(group==='anime'?{with_genres:'16'}:{})}};
}
export async function browseCatalog(runtime,ref,page){
 const request=browseRequest(ref,page);const body=await runtime.catalog(request.path,request.params);
 const data=(body.results || []).map(item=>{
  const id=Number(item.id);if(!Number.isSafeInteger(id)||id<=0)return null;
  const title=item.title||item.name;if(!title)return null;
  return {id:`tmdb:${request.type}:${id}`,ref:`tmdb:${request.type}:${id}`,tmdbId:String(id),title,
    originalTitle:item.original_title||item.original_name||title,type:request.type==='tv'?'series':'movie',mediaType:request.type,
    year:String(item.release_date||item.first_air_date||'').slice(0,4)||null,rating:item.vote_count>0?item.vote_average:null,
    poster:item.poster_path?`https://image.tmdb.org/t/p/w500${item.poster_path}`:'',
    overview:item.overview||'',source:'tmdb',genre_ids:item.genre_ids||[],original_language:item.original_language||'',category:ref};
 }).filter(Boolean);
 return {status:'success',source:'tmdb',data,has_more:Number(body.page||page)<Number(body.total_pages||1),page:Number(body.page||page)};
}
