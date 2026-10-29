import {readHttps,assertPublicHttpsUrl} from '../transport/https.mjs';
import {probeHlsSample} from './hls.mjs';
/** New implementation, intentionally not connected to the legacy runtime. */
export async function verifyMedia(candidate,{fetchImpl=readHttps}={}){
 assertPublicHttpsUrl(candidate.url);
 const deadline=Date.now()+15000;
 const read=async(url,options={})=>{
  if(Date.now()>=deadline)throw Object.assign(Error('MEDIA_PROBE_TIMEOUT'),{code:'MEDIA_PROBE_TIMEOUT'});
  return fetchImpl(url,{...options,timeoutMs:Math.min(8000,deadline-Date.now()),maxRedirects:2});
 };
 let first;try{first=await read(candidate.url,{headers:{...candidate.headers,Range:'bytes=0-32767'},maxBytes:65536,prefixBytes:32768});}catch(e){return{playable:false,phase:'transport',reason:/^[A-Z][A-Z0-9_]{2,79}$/.test(e.code||'')?e.code:'MEDIA_NETWORK_FAILED'};}
 const bytes=first.bytes||Buffer.alloc(0),successful=[200,206].includes(first.status);
 if(!successful)return{playable:false,reason:'MEDIA_HTTP_UNAVAILABLE',statusCode:first.status};
 if(bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp')return{playable:true,container:'mp4',container_verified:true,sample_only:true,verification_basis:'mp4-prefix-bytes',webPlayable:false};
 if(!bytes.subarray(0,256).toString('utf8').replace(/^\uFEFF/,'').trimStart().startsWith('#EXTM3U'))return{playable:false,reason:'MEDIA_CONTAINER_INVALID'};
 try{
  const evidence=await probeHlsSample(first,{baseUrl:first.url||candidate.url,candidate,read:async(url,{headers,playlist=false,key=false,offset=0,length=32768}={})=>read(url,{headers:{...headers,...(!playlist&&!key?{Range:'bytes='+offset+'-'+(offset+length-1)}:{})},maxBytes:key?32:playlist?262144:65536,prefixBytes:key||playlist?0:length})});
  return{...evidence,playable:true,container:'hls',container_verified:true,webPlayable:false};
 }catch(e){return{playable:false,container:'hls',container_verified:false,reason:/^[A-Z][A-Z0-9_]{2,79}$/.test(e.code||'')?e.code:'HLS_PROBE_FAILED',sample_only:true};}
}
