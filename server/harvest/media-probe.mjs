import {fetchSafeResponse} from '../scrapers/shared/http.mjs';
import {probePinnedMedia} from '../pinned-playback.mjs';
/** Header checks alone accept dead CDN placeholders. Require actual container bytes. */
export async function probeHarvestMedia(candidate,{platform='native',fetchImpl=fetchSafeResponse,headProbe=probePinnedMedia}={}){
 const head=await headProbe(candidate,{platform});
 if(![200,206].includes(head.statusCode))return head;
 const response=await fetchImpl(candidate.url,{method:'GET',headers:{...candidate.headers,Range:'bytes=0-32767'},responseType:'bytes',maxBytes:65536,prefixBytes:32768,allowHttp:false,maxRetries:0,maxRedirects:2,timeoutMs:8000});
 const bytes=response.bytes||Buffer.alloc(0);
 const mp4=bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp';
 const hls=bytes.subarray(0,256).toString('utf8').trimStart().startsWith('#EXTM3U');
 // Some real CDNs omit Content-Type even on successful HEAD and GET. Their
 // actual container signature is stronger evidence than the absent MIME label.
 const container=mp4?'mp4':hls?'hls':null;
 const playable=[200,206].includes(response.status)&&Boolean(container);
 return {...head,container,playable,statusCode:response.status,webPlayable:playable&&head.webPlayable===true,container_verified:playable,verification_basis:'bounded-container-bytes'};
}
