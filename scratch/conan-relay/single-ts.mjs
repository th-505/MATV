import {createHash} from 'node:crypto';
import {fetchSafeResponse,assertSafeScraperUrl} from './provider-runtime.mjs';
import {mediaFetch} from './media.mjs';
import {timeline} from './qualities.mjs';
export function validateTsIndex(config){
 if(config.workId!=='conan28-2025'||config.edition!=='original-subtitled'||!/^[-a-zA-Z0-9_]{1,100}$/.test(config.id||''))throw Error('INVALID_TS_IDENTITY');
 assertSafeScraperUrl(config.url,{allowHttp:false});
 if(!Array.isArray(config.segments)||!config.segments.length||config.segments.length>20000)throw Error('INVALID_TS_INDEX');
 let offset=0;for(const [duration,length]of config.segments){if(!Number.isFinite(duration)||duration<=0||!Number.isSafeInteger(length)||length<=0||length%188!==0)throw Error('INVALID_TS_SEGMENT');offset+=length;}
 if(!Number.isSafeInteger(config.total)||config.total!==offset)throw Error('INVALID_TS_TOTAL');
 if(!Number.isSafeInteger(config.width)||!Number.isSafeInteger(config.height)||config.width<=0||config.height<=0||!Number.isSafeInteger(config.bandwidth)||config.bandwidth<=0||!/^[a-zA-Z0-9., -]+$/.test(config.codecs||''))throw Error('INVALID_TS_PROFILE');
 if(!Array.isArray(config.proofs)||config.proofs.length<3||config.proofs.length>32||config.proofs.some(p=>!Number.isSafeInteger(p.offset)||p.offset<0||!Number.isSafeInteger(p.length)||p.length<1||p.length>65536||p.offset+p.length>offset||!/^[0-9a-f]{64}$/.test(p.sha256)))throw Error('INVALID_TS_PROOFS');
 if(!Number.isSafeInteger(config.mediaSequence||0)||(config.mediaSequence||0)<0||(config.discontinuities||[]).some(i=>!Number.isInteger(i)||i<0||i>=config.segments.length))throw Error('INVALID_TS_TIMELINE');
 return config;
}
export function tsPlaylist(config,requestUrl){
 validateTsIndex(config);const asset=new URL(requestUrl);asset.pathname=asset.pathname.replace(/\/variant$/,'/ts-asset');asset.search='';asset.searchParams.set('id',config.id);
 const discontinuities=new Set(config.discontinuities||[]);const lines=['#EXTM3U','#EXT-X-VERSION:4','#EXT-X-TARGETDURATION:'+Math.ceil(Math.max(...config.segments.map(s=>s[0]))),'#EXT-X-MEDIA-SEQUENCE:'+(config.mediaSequence||0)];let offset=0;
 let segmentIndex=0;for(const [duration,length]of config.segments){if(discontinuities.has(segmentIndex))lines.push('#EXT-X-DISCONTINUITY');segmentIndex++;lines.push('#EXTINF:'+duration+',','#EXT-X-BYTERANGE:'+length+'@'+offset,asset.href);offset+=length;}
 lines.push('#EXT-X-ENDLIST');return lines.join('\n')+'\n';
}
export async function verifyTsIndex(config,{request=fetchSafeResponse}={}){
 validateTsIndex(config);let finalUrl=config.url;
 for(const proof of config.proofs){const r=await request(config.url,{allowHttp:false,timeoutMs:15000,maxRetries:0,responseType:'bytes',prefixBytes:proof.length,headers:{...config.headers,Range:`bytes=${proof.offset}-${proof.offset+proof.length-1}`}});
  const expected=`bytes ${proof.offset}-${proof.offset+proof.length-1}/${config.total}`;
  if(r.status!==206||r.headers.get('content-range')!==expected||createHash('sha256').update(r.bytes||[]).digest('hex')!==proof.sha256)throw Error('TS_CONTENT_CHANGED');finalUrl=r.url;
 }
 const host=new URL(finalUrl).hostname;const source={url:finalUrl,format:'single-ts-hls',provider:config.provider||'mycima',player:'download-bridge',provenance:'byte-index-verified',headers:config.headers||{},mediaHosts:[host],workId:config.workId,edition:config.edition,expires_at:new Date(Date.now()+3600000).toISOString()};
 return {id:config.id,source,tsIndex:config,width:config.width,height:config.height,bandwidth:config.bandwidth,codecs:config.codecs,workId:config.workId,edition:config.edition,timeline:timeline(tsPlaylist(config,'https://relay.invalid/variant'))};
}
export async function loadTsBackups(onEvent=()=>{}){
 let configs;try{configs=JSON.parse(process.env.RELAY_TS_BACKUPS||'[]');}catch{onEvent({stage:'ts-index',reason:'INVALID_PRIVATE_INDEX_CONFIG'});return [];}
 const variants=[];
 for(const config of Array.isArray(configs)?configs:[]){try{variants.push(await verifyTsIndex(config));onEvent({provider:config.provider||'mycima',stage:'ts-index',reason:'VERIFIED_BYTE_RANGE_HLS'});}catch(e){onEvent({provider:config.provider||'mycima',stage:'ts-index',reason:e.message==='TS_CONTENT_CHANGED'?'TS_CONTENT_CHANGED':'TS_SOURCE_UNAVAILABLE'});}}
 return variants;
}
export async function serveTsAsset(request,variant){
 const range=request.headers.get('range');const match=range?.match(/^bytes=(\d+)-(\d+)$/);if(!match||Number(match[1])>Number(match[2])||Number(match[2])>=variant.tsIndex.total)return new Response('Invalid range',{status:416});
 const r=await mediaFetch(variant.source,range,request.method);
 const expected=`bytes ${match[1]}-${match[2]}/${variant.tsIndex.total}`;
 if(r.status!==206||r.headers.get('content-range')!==expected){await r.body?.cancel();return new Response('Upstream byte range mismatch',{status:502});}
 const headers=new Headers({'Content-Type':'video/mp2t','Accept-Ranges':'bytes','Content-Range':expected,'Content-Length':String(Number(match[2])-Number(match[1])+1),'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges','Cache-Control':'private, no-store'});
 return new Response(request.method==='HEAD'?null:r.body,{status:206,headers});
}
