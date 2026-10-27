import {identityTitle,titleIdentityMatches} from '../scrapers/content-discovery.mjs';
const normalize=x=>identityTitle(x).replace(/^(?:انمي|أنمي|anime)\s+/i,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/\s/g,'');
const tokens=x=>new Set(identityTitle(x).replace(/^(?:انمي|أنمي|anime)\s+/i,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').split(/\s+/).filter(x=>x.length>1));
function overlap(a,b){const x=tokens(a),y=tokens(b);if(!x.size||!y.size)return 0;return [...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size)}
function year(x){return String(x||'').match(/(?:18|19|20|21)\d{2}/)?.[0]||null}
function posterId(x){try{return new URL(x).pathname.split('/').pop()||''}catch{return ''}}
/** Observed evidence is provider metadata, never filled from the requested work. */
export function matchHarvestIdentity(expected,observed){
 const names=[expected.title,expected.original_title,...(expected.aliases||[])].filter(Boolean).slice(0,40);
 const titles=[observed.title,observed.original_title,observed.originalTitle].filter(Boolean);
 const exact=names.some(a=>titles.some(b=>normalize(a)&&normalize(a)===normalize(b)))||titles.some(b=>titleIdentityMatches(b,expected.title,names));
 const similarity=Math.max(0,...names.flatMap(a=>titles.map(b=>overlap(a,b))));
 const ey=year(expected.year),oy=year(observed.year||observed.title);
 const format=t=>t==='tv'?'series':t==='anime'?null:t;
 const et=format(expected.type),ot=format(observed.type);
 const reasons=[];if(ey&&oy&&ey!==oy)reasons.push('YEAR_CONFLICT');if(et&&ot&&et!==ot)reasons.push('TYPE_CONFLICT');
 const er=Number(expected.runtime_minutes||expected.runtime),or=Number(observed.runtime_minutes||observed.runtime);
 const runtime=er>0&&or>0&&Math.abs(er-or)<=Math.max(5,er*.07);
 const eg=new Set((expected.genres||[]).map(g=>normalize(g.name||g))),og=(observed.genres||[]).map(g=>normalize(g.name||g));
 const genres=og.filter(x=>eg.has(x)).length;
 const poster=Boolean(posterId(expected.poster)&&posterId(expected.poster)===posterId(observed.poster));
 const seasons=Number(expected.number_of_seasons)>0&&Number(observed.number_of_seasons)===Number(expected.number_of_seasons);
 const episodes=Number(expected.number_of_episodes)>0&&Number(observed.number_of_episodes)===Number(expected.number_of_episodes);
 const independent=[runtime,genres>=2,poster,seasons,episodes].filter(Boolean).length;
 const score=(exact?.60:similarity*.45)+(ey&&oy&&ey===oy?.20:0)+(runtime?.07:0)+(genres>=2?.04:0)+(poster?.08:0)+(seasons?.04:0)+(episodes?.04:0);
 const accepted=!reasons.length&&Boolean(ey&&oy&&ey===oy)&&(exact||(similarity>=.7&&independent>=2));
 return {accepted,score:Math.min(1,Math.round(score*1000)/1000),reasons:reasons.length?reasons:accepted?[]:['IDENTITY_UNCONFIRMED'],evidence:{title_exact:exact,title_similarity:similarity,year_agrees:Boolean(ey&&oy&&ey===oy),runtime_agrees:runtime,genres_overlap:genres,poster_agrees:poster,seasons_agree:seasons,episodes_agree:episodes}};
}
export function harvestQueryVariants(metadata){
 const all=[metadata.original_title,metadata.title,...(metadata.aliases||[])].filter(Boolean).map(x=>String(x).trim()).filter(x=>x.length>=2&&x.length<=120);
 return [...new Set(all)].slice(0,8);
}
/**7 days belongs to the work catalog, never to an expiring signed URL. */
export function mediaExpiry(source,now=Date.now()){
 let end=now+55*60_000;const given=Date.parse(source.expires_at||source.expiresAt||'');if(Number.isFinite(given))end=Math.min(end,given);
 try{const u=new URL(source.url);const epoch=n=>{n=Number(n);if(n>1_000_000_000)end=Math.min(end,n<1e12?n*1000:n)};
  for(const key of ['expires','expiry','exp','e'])epoch(u.searchParams.get(key));
  for(const key of ['hdnea','hdnts']){const m=u.searchParams.get(key)?.match(/(?:^|~)exp=(\d{10,13})(?:~|$)/);if(m)epoch(m[1]);}
  for(const prefix of ['X-Amz','X-Goog']){const date=u.searchParams.get(prefix+'-Date'),seconds=Number(u.searchParams.get(prefix+'-Expires'));if(/^\d{8}T\d{6}Z$/.test(date||'')&&seconds>0&&seconds<=604800){const iso=date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z');const expiry=Date.parse(iso)+seconds*1000;if(Number.isFinite(expiry))end=Math.min(end,expiry);}}
  for(const key of ['token','jwt','auth']){const value=u.searchParams.get(key);if(value&&value.length<4096&&value.split('.').length===3){try{epoch(JSON.parse(Buffer.from(value.split('.')[1],'base64url')).exp)}catch{}}}
 }catch{return null}
 return end>now+30_000?end:null;
}

export function containsWorkTitle(expected,observed){
 const names=[expected.title,expected.original_title,...(expected.aliases||[])].filter(Boolean);
 const text=' '+identityTitle(observed).replace(/^(?:انمي|أنمي|anime)\s+/i,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي')+' ';
 return names.some(name=>text.includes(' '+identityTitle(name).replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي')+' '));
}
