import {assertPublicHttpsUrl} from '../transport/https.mjs';
import {createDecipheriv} from 'node:crypto';
const ok=r=>[200,206].includes(r.status);
const attr=(line,key)=>line.match(new RegExp('(?:^|,)'+key+'=(?:"([^"]*)"|([^,]*))'))?.slice(1).find(x=>x!==undefined);
const error=code=>Object.assign(Error(code),{code});
function url(raw,base){if(!raw||raw.length>4096)throw error('HLS_INVALID_URI');return assertPublicHttpsUrl(new URL(raw,base).href).href;}
function signature(bytes){
 if(bytes.length>=376&&bytes[0]===0x47&&bytes[188]===0x47)return 'mpegts';
 if(bytes.length>=12&&['ftyp','styp','moof'].includes(bytes.subarray(4,8).toString('ascii')))return 'fmp4';
 return null;
}
/** Bounded sample verification, not full decoding or device certification. */
export async function probeHlsSample(initial,{baseUrl,candidate,read,maxDepth=2,maxVariants=3}){
 const visited=new Set();let requests=0;
 async function fetchBytes(target,options={}){
  if(++requests>8)throw error('HLS_REQUEST_LIMIT');
  return read(target,{...options,headers:Object.fromEntries(Object.entries(candidate.headers||{}).filter(([k])=>! /^(cookie|authorization)$/i.test(k)||new URL(target).origin===new URL(candidate.url).origin))});
 }
 async function inspect(response,base,depth){
  if(depth>maxDepth||visited.has(base))throw error('HLS_PLAYLIST_CYCLE');visited.add(base);
  if(!ok(response))throw error('HLS_PLAYLIST_UNAVAILABLE');
  const text=(response.bytes||Buffer.alloc(0)).toString('utf8').replace(/^\uFEFF/,'');
  if(!text.trimStart().startsWith('#EXTM3U'))throw error('HLS_INVALID_PLAYLIST');
  const lines=text.split(/\r?\n/).map(x=>x.trim());if(lines.length>10000||lines.some(x=>x.length>8192))throw error('HLS_PLAYLIST_LIMIT');
  const variants=[];let awaiting=false;
  for(const line of lines){if(line.startsWith('#EXT-X-STREAM-INF:'))awaiting=true;else if(line&&!line.startsWith('#')&&awaiting){variants.push(line);awaiting=false;}}
  if(variants.length){
   let last=error('HLS_NO_VALID_VARIANT');
   for(const raw of variants.slice(0,maxVariants)){try{const target=url(raw,base),r=await fetchBytes(target,{playlist:true});return await inspect(r,r.url||target,depth+1);}catch(e){last=e;}}
   throw last;
  }
  let sequence=0n,key=null,map=null,segment=null,range=null;
  for(const line of lines){
   if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:')){const n=line.split(':')[1];if(!/^\d{1,20}$/.test(n))throw error('HLS_INVALID_SEQUENCE');sequence=BigInt(n);}
   else if(line.startsWith('#EXT-X-KEY:')){const a=line.slice(11);key={method:attr(a,'METHOD'),uri:attr(a,'URI'),iv:attr(a,'IV')};if(key.method==='NONE')key=null;}
   else if(line.startsWith('#EXT-X-MAP:'))map=attr(line.slice(11),'URI');
   else if(line.startsWith('#EXT-X-BYTERANGE:'))range=line.slice(17);
   else if(line&&!line.startsWith('#')){segment=line;break;}
  }
  if(!segment)throw error('HLS_NO_SEGMENTS');
  let keyBytes,iv;
  if(key){
   if(key.method!=='AES-128')throw error('HLS_ENCRYPTION_UNSUPPORTED');
   const kr=await fetchBytes(url(key.uri,base),{key:true});keyBytes=kr.bytes;
   if(!ok(kr)||keyBytes?.length!==16)throw error('HLS_KEY_UNAVAILABLE');
   const raw=key.iv?key.iv.replace(/^0x/i,''):sequence.toString(16);if(!/^[a-f0-9]{1,32}$/i.test(raw))throw error('HLS_INVALID_IV');iv=Buffer.from(raw.padStart(32,'0'),'hex');
  }
  const decode=bytes=>{if(!key)return bytes;const length=bytes.length-bytes.length%16;if(length<16)throw error('HLS_SEGMENT_EMPTY');const cipher=createDecipheriv('aes-128-cbc',keyBytes,iv);cipher.setAutoPadding(false);return Buffer.concat([cipher.update(bytes.subarray(0,length)),cipher.final()]);};
  let initVerified=false;
  if(map){if(key&&!key.iv)throw error('HLS_MAP_IV_REQUIRED');const ir=await fetchBytes(url(map,base));if(!ok(ir)||signature(decode(ir.bytes||Buffer.alloc(0)))!=='fmp4')throw error('HLS_INIT_UNAVAILABLE');initVerified=true;}
  let offset=0,length=32768;
  if(range){const match=range.match(/^(\d{1,12})(?:@(\d{1,12}))?$/);if(!match)throw error('HLS_INVALID_BYTERANGE');length=Math.min(Number(match[1]),32768);offset=Number(match[2]||0);if(!length)throw error('HLS_INVALID_BYTERANGE');}
  const sr=await fetchBytes(url(segment,base),{offset,length});if(!ok(sr))throw error('HLS_SEGMENT_UNAVAILABLE');if(offset>0&&sr.status!==206)throw error('HLS_BYTERANGE_IGNORED');
  const bytes=decode(sr.bytes||Buffer.alloc(0)),container=signature(bytes);
  if(!container||container==='fmp4'&&!initVerified&&bytes.subarray(4,8).toString('ascii')==='moof')throw error('HLS_SEGMENT_INVALID');
  return{segment_verified:true,segment_container:container,encrypted:key?.method==='AES-128',verification_basis:'hls-playlist-and-segment-bytes',sample_only:true};
 }
 return inspect(initial,baseUrl,0);
}
