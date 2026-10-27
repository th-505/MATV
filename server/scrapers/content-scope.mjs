/** Restrict only proven specialist sources. Unknown language never excludes a source. */
const specialist=Object.freeze({
 '3isk':{languages:['tr'],kinds:['movie','series']},
 '3cktv':{languages:['tr'],kinds:['movie','series']},
 anime4up:{animation:true},anime4up_rest:{animation:true},witanime:{animation:true},ristoanime:{animation:true},
 egydead_live:{live:true},yallashoot:{live:true},
});
export function providerScope(id){return specialist[id]||{general:true}}
export function supportsContent(id,{original_language,originalLanguage,type,genres}={}){
 const scope=providerScope(id);const language=original_language||originalLanguage;
 if(scope.live&&type&&type!=='live')return false;
 if(scope.languages&&language&&!scope.languages.includes(language))return false;
 if(scope.animation&&type&&type!=='anime'&&Array.isArray(genres)&&genres.length){
  const animation=genres.some(g=>Number(g.id||g)===16||/animation|أنمي|رسوم/i.test(g.name||g));
  if(!animation)return false;
 }
 return true;
}
