import {createHash} from 'node:crypto';
import {allowed,mediaFetch,prefix,readText,proxyHls} from './media.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,20);
export function attributes(line){return Object.fromEntries([...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));}
export function parseMaster(text,url){
 if(!text.trimStart().startsWith('#EXTM3U'))throw Error('INVALID_HLS');
 const lines=text.split(/\r?\n/),variants=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
  const a=attributes(lines[i]);let j=i+1;while(j<lines.length&&(!lines[j].trim()||lines[j].startsWith('#')))j++;
  if(!lines[j]||a.AUDIO||a.VIDEO||a.SUBTITLES)continue;
  const target=new URL(lines[j].trim(),url);allowed(target.href,true);
  const bandwidth=Number(a.BANDWIDTH),resolution=(a.RESOLUTION||'').match(/^(\d+)x(\d+)$/);
  if(!Number.isSafeInteger(bandwidth)||bandwidth<=0||!resolution)continue;
  if(a.CODECS&&!/^[a-zA-Z0-9., -]+$/.test(a.CODECS))continue;
  variants.push({url:target.href,bandwidth,width:Number(resolution[1]),height:Number(resolution[2]),codecs:a.CODECS||'',frameRate:Number(a['FRAME-RATE'])||null});
 }
 return variants;
}
export function timeline(text){
 if(!text.trimStart().startsWith('#EXTM3U')||!text.includes('#EXT-X-ENDLIST'))throw Error('NOT_VOD_HLS');
 if(/#EXT-X-KEY:(?![^\r\n]*METHOD=NONE)/.test(text))throw Error('ENCRYPTED_TIMELINE_UNVERIFIED');
 const durations=[...text.matchAll(/^#EXTINF:([\d.]+)/gm)].map(m=>Number(m[1]));
 if(!durations.length||durations.some(n=>!Number.isFinite(n)||n<=0))throw Error('INVALID_TIMELINE');
 const sequence=Number(text.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/m)?.[1]||0);
 let count=0;const discontinuities=[];for(const line of text.split(/\r?\n/)){if(line.startsWith('#EXTINF:'))count++;if(line==='#EXT-X-DISCONTINUITY')discontinuities.push(count);}
 return {fingerprint:digest(JSON.stringify({sequence,durations:durations.map(n=>Math.round(n*1000)),discontinuities})),duration:durations.reduce((a,b)=>a+b,0),segments:durations.length};
}
export function compatible(a,b){return a.workId===b.workId&&a.edition===b.edition&&a.timeline.fingerprint===b.timeline.fingerprint&&a.codecs===b.codecs;}
function assetWithin(value,source){const u=allowed(value,true),base=new URL(source.url);if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname.slice(0,base.pathname.lastIndexOf('/')+1)))throw Error('OUTSIDE_SOURCE_DIRECTORY');return u.href;}
async function playlist(source,url=source.url){assetWithin(url,source);const r=await mediaFetch({...source,url});if(!r.ok){await r.body?.cancel();throw Error('PLAYLIST_UNAVAILABLE');}return readText(r);}
export async function inspectSource(source){
 if(source.format!=='hls')throw Error('MP4_REQUIRES_HLS_PACKAGING');
 const master=await playlist(source),raw=parseMaster(master,source.url),result=[];
 if(!raw.length)throw Error('NO_DECLARED_VARIANTS');
 for(const variant of raw.slice(0,8)){
  const text=await playlist(source,variant.url),timing=timeline(text);
  const line=text.split(/\r?\n/).find(x=>x.trim()&&!x.startsWith('#'));
  if(!line)continue;const segment=assetWithin(new URL(line.trim(),variant.url).href,source);
  const r=await mediaFetch({...source,url:segment},'bytes=0-1023');const bytes=await prefix(r);
  const container=bytes[0]===0x47||['ftyp','styp','moof'].includes(new TextDecoder().decode(bytes.slice(4,8)));
  if(![200,206].includes(r.status)||!container)continue;
  const id=digest([source.provider||'mycima',new URL(source.url).pathname,new URL(variant.url).pathname].join(':'));
  result.push({...variant,id,source,timeline:timing,workId:source.workId||'conan28-2025',edition:source.edition||'original-subtitled'});
 }
 return result;
}
export function mergeVariants(baseline,candidates){
 const accepted=[...baseline],rejected=[];
 for(const candidate of candidates){
  if(!baseline.some(base=>compatible(base,candidate))){rejected.push({provider:candidate.source.provider,quality:candidate.height+'p',reason:'TIMELINE_OR_EDITION_MISMATCH'});continue;}
  if(accepted.some(v=>v.height===candidate.height&&v.codecs===candidate.codecs))continue;
  accepted.push(candidate);
 }
 return {variants:accepted.sort((a,b)=>b.height-a.height||b.bandwidth-a.bandwidth),rejected};
}
export function masterPlaylist(variants,requestUrl){
 const base=new URL(requestUrl);base.pathname=base.pathname.replace(/index\.m3u8$/,'variant');base.search='';
 const lines=['#EXTM3U','#EXT-X-VERSION:3'];
 for(const v of variants){const u=new URL(base);u.searchParams.set('id',v.id);lines.push('#EXT-X-STREAM-INF:BANDWIDTH='+v.bandwidth+',RESOLUTION='+v.width+'x'+v.height+(v.codecs?',CODECS="'+v.codecs+'"':''),u.href);}
 return lines.join('\n')+'\n';
}
export function publicQualities(variants){return variants.map(v=>({id:v.id,quality:v.height+'p',width:v.width,height:v.height,provider:v.source.provider||'mycima',bandwidth:v.bandwidth}));}
export async function serveVariant(request,variant,asset=null){
 const requestUrl=new URL(request.url);requestUrl.searchParams.set('id',variant.id);
 return proxyHls(new Request(requestUrl,request),variant.source,asset||variant.url);
}
