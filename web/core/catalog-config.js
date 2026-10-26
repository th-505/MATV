// Canonical TMDB browse sections; capability-specific source browsing lives in advanced search.
export const CinemaCategories = Object.freeze({
  movies:[['catalog:movie:all','الكل'],['catalog:movie:en','أجنبي'],['catalog:movie:ar','عربي'],['catalog:movie:hi','هندي'],['catalog:movie:ko','آسيوي'],['catalog:movie:tr','تركي']],
  series:[['catalog:tv:all','الكل'],['catalog:tv:en','أجنبي'],['catalog:tv:ar','عربي'],['catalog:tv:tr','تركي'],['catalog:tv:ko','آسيوي']],
  anime:[['catalog:anime:movie','أفلام أنمي'],['catalog:anime:tv','مسلسلات أنمي']],
  turkish:[['catalog:turkish:tv','مسلسلات تركية'],['catalog:turkish:movie','أفلام تركية']],
});
for(const key of Object.keys(CinemaCategories))CinemaCategories[key].splice(0,CinemaCategories[key].length,...CinemaCategories[key].map(([url,title])=>Object.freeze({url,title})));
