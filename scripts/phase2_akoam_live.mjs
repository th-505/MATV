import assert from 'node:assert/strict';
import {createServer} from '../server/app.mjs';
let server;let base=process.argv[2];
if(!base){server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
async function json(path){const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(90_000)});const body=await response.json();assert.equal(response.status,200,body.message);return body;}
const rows=[];
try{
  for(const category of ['movie-indian','series-foreign']){
    const first=await json(`/api/v1/category?ref=${category}&p=1`);const second=await json(`/api/v1/category?ref=${category}&p=2`);
    assert(first.data.length);assert(second.data.some(row=>!first.data.some(item=>item.ref===row.ref)),'page 2 must contain new works');
    let ref=first.data[0].ref;
    const metadata=await json(`/api/cinema/metadata?ref=${encodeURIComponent(ref)}`);assert.equal(metadata.media_path,undefined);
    let details=await json(`/api/cinema/details?ref=${encodeURIComponent(ref)}`);
    if(details.episodes?.length){ref=details.episodes[0].ref || details.episodes[0].link;details=await json(`/api/cinema/details?ref=${encodeURIComponent(ref)}`);}
    assert(details.media_path);const media=await fetch(new URL(details.media_path,base),{headers:{...(details.playback_headers || {}),Range:'bytes=0-4095'},signal:AbortSignal.timeout(40_000)});
    const reader=media.body.getReader();const bytes=await reader.read();await reader.cancel();const mediaPassed=[200,206].includes(media.status)&&Boolean(bytes.value?.length);
    rows.push({category,title:first.data[0].title,page1:first.data.length,page2:second.data.length,pagination:true,metadata_only:true,media_type:details.media_type,sources:details.media_sources?.length||1,media_status:media.status,media_verified:mediaPassed,resolution_mode:details.playback_mode || 'proxy',server_probe_unavailable:details.server_probe_unavailable===true,bytes_received:bytes.value?.length || 0});
  }
  console.log(JSON.stringify({api:base,results:rows,extraction_passed:true,playback_passed:rows.every(row=>row.media_verified)}));
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
