// Descriptive media identity only: never infer episode numbers from array indexes,
// source IDs, film sequel numbers, years, or resolution labels.
export function identityDigits(value) {
  return String(value ?? '').replace(/[\u0660-\u0669\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)>=0x6f0?0x6f0:0x660)));
}
const positive=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=100000?n:null;};
export function explicitEpisode(title='',url='') {
  const text=identityDigits(title);
  const pattern=/(?:الحلقة|الحلقه|حلقة|حلقه)\s*[:#_-]?\s*(\d{1,5})\b|\b(?:episode|ep|e)\s*[:#_-]?\s*(\d{1,5})\b|\bS\d{1,3}E(\d{1,5})\b/i;
  let m=text.match(pattern);
  if(m)return positive(m[1]||m[2]||m[3]);
  let path=identityDigits(url);try{path=decodeURIComponent(path)}catch{}
  m=path.match(/(?:الحلقة|الحلقه|حلقة|حلقه|\bepisode|\bep)[-_/\s:]*(\d{1,5})\b|(?:^|[-_/])e(\d{1,5})(?:[-_/.]|$)/i);
  return m?positive(m[1]||m[2]):null;
}
export function explicitSeason(title='',url='') {
  const parse=value=>{
    const text=identityDigits(value).replace(/[أإآٱ]/g,'ا');
    let m=text.match(/(?:الموسم|موسم)\s*[:#_-]?\s*(\d{1,3})|(?:^|[\s_-])ج\s*(\d{1,3})(?=$|[\s_-])|\b(?:season|s)\s*[-_:]?\s*(\d{1,3})(?:e\d+)?\b/i);
    if(m)return positive(m[1]||m[2]||m[3]);
    const words=['الاول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر'];
    for(let i=0;i<words.length;i++)if(new RegExp('(?:الموسم|موسم)\\s+'+words[i]+'(?=$|[\\s_\\-])','i').test(text))return i+1;
    return null;
  };
  let decoded=String(url||'');try{decoded=decodeURIComponent(decoded)}catch{}
  return parse(title)||parse(decoded);
}
export function contentIdentity(item={}) {
  const title=identityDigits(item.title||item.name||'');
  const url=String(item.url||item.sourceUrl||item.link||item.ref||item.id||'');
  const movie=/(?:^|\s)(?:فيلم|فلم)(?=\s|$)|\b(?:movie|film)\b/i.test(title)||/\/(?:movie|film)(?:[-/])/i.test(url);
  const episode=movie?null:explicitEpisode(title,url)||positive(item.episode_number??item.episodeNumber??item.episode);
  const series=!movie&&(episode!==null||item.mediaType==='tv'||['tv','series','episode','anime'].includes(item.type)||item.is_series===true||/مسلسل|الحلقة|series|season/i.test(title));
  const season=series?(positive(item.season_number??item.season)||explicitSeason(title,url)||(episode?1:null)):null;
  return {type:series?'series':'movie',mediaType:series?'tv':'movie',is_series:series,episode_number:episode,season_number:season};
}
export function normalizeEpisodeEntries(rawEpisodes=[],fallbackTitle='الحلقة') {
  if(!Array.isArray(rawEpisodes))return [];
  return rawEpisodes.filter(ep=>ep&&typeof ep==='object').map(ep=>{
    const text=String(ep.title||ep.name||ep.label||ep.ep||'');
    const field=positive(ep.episode_number??ep.episodeNumber??ep.number??ep.episode??ep.num);
    const sole=identityDigits(text).trim();
    const number=explicitEpisode(text,ep.url||ep.ref||ep.link||'')||field||(/^\d{1,5}$/.test(sole)?positive(sole):null);
    const title=text&&!text.includes('undefined')?text:(number?`${fallbackTitle} ${number}`:'حلقة غير مرقمة');
    return {...ep,id:ep.id||ep.ref||ep.url||(number?`ep-${number}`:''),number,episode_number:number,episodeNumber:number,title,label:number?`${fallbackTitle} ${number}`:title,url:ep.url||ep.ref||ep.link||'',watch_available:number!==null&&ep.watch_available!==false};
  });
}
