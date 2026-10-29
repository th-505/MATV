import test from 'node:test';import assert from 'node:assert/strict';import {createCipheriv} from 'node:crypto';
import {verifyMedia} from '../server/media-pipeline/verification/media.mjs';
const base='https://cdn.example/master.m3u8',candidate={url:base,headers:{Referer:'https://source.example/',Cookie:'private-cookie'}};
const ts=Buffer.alloc(752);for(let i=0;i<ts.length;i+=188)ts[i]=0x47;
async function check(routes,extra={}){const requests=[];const result=await verifyMedia(candidate,{fetchImpl:async(url,options)=>{requests.push({url,options});const row=routes[url];if(!row)throw Error('Unexpected URL');return{status:200,url,...row,bytes:Buffer.isBuffer(row.bytes)?row.bytes:Buffer.from(row.bytes||'')};},...extra});return{result,requests};}
test('a playlist is not playable if its actual segment is HTML or unavailable',async()=>{
 for(const segment of [{status:403,bytes:'blocked'},{bytes:'<html>login</html>'}]){
 const{result}=await check({[base]:{bytes:'#EXTM3U\n#EXTINF:5,\none.ts\n'},'https://cdn.example/one.ts':segment});assert.equal(result.playable,false);assert.match(result.reason,/HLS_SEGMENT_/);}
});
test('master to media to transport stream verifies bytes without claiming full decoding',async()=>{
 const{result,requests}=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlow/index.m3u8\n'},'https://cdn.example/low/index.m3u8':{bytes:'#EXTM3U\n#EXTINF:5,\npart.ts\n'},'https://cdn.example/low/part.ts':{bytes:ts}});
 assert.equal(result.playable,true);assert.equal(result.segment_verified,true);assert.equal(result.sample_only,true);assert.equal(result.webPlayable,false);assert.equal(requests.length,3);
});
test('an observed second variant can work when the first is dead',async()=>{
 const{result}=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000\nb.m3u8\n'},'https://cdn.example/a.m3u8':{status:404},'https://cdn.example/b.m3u8':{bytes:'#EXTM3U\n#EXTINF:5,\na.ts\n'},'https://cdn.example/a.ts':{bytes:ts}});assert.equal(result.playable,true);
});
test('nested private segment is rejected before requesting it and cycles are bounded',async()=>{
 const{result,requests}=await check({[base]:{bytes:'#EXTM3U\n#EXTINF:5,\nhttps://127.0.0.1/private\n'}});assert.equal(result.playable,false);assert.equal(requests.length,1);
 const cycle=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmaster.m3u8\n'}});assert.equal(cycle.result.reason,'HLS_PLAYLIST_CYCLE');assert(cycle.requests.length<=2);
});
test('AES-128 verifies decrypted sample with the observed key and media-sequence IV',async()=>{
 const key=Buffer.alloc(16,7),iv=Buffer.alloc(16);iv[15]=2;const cipher=createCipheriv('aes-128-cbc',key,iv);const encrypted=Buffer.concat([cipher.update(ts),cipher.final()]);
 const{result}=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:2\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:5,\none.ts\n'},'https://cdn.example/key.bin':{bytes:key},'https://cdn.example/one.ts':{bytes:encrypted}});assert.equal(result.playable,true);assert.equal(result.encrypted,true);
});
test('key errors and unsupported encryption remain explicit unavailable outcomes',async()=>{
 for(const [method,key,reason]of [['AES-128',Buffer.alloc(5),'HLS_KEY_UNAVAILABLE'],['SAMPLE-AES',Buffer.alloc(16),'HLS_ENCRYPTION_UNSUPPORTED']]){
 const{result}=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-KEY:METHOD='+method+',URI="key.bin"\n#EXTINF:5,\none.ts\n'},'https://cdn.example/key.bin':{bytes:key}});assert.equal(result.reason,reason);assert.equal(result.playable,false);}
});
test('fMP4 requires its observed initialization map, and cross-origin children never receive cookies',async()=>{
 const{result,requests}=await check({[base]:{bytes:'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nhttps://other.example/one.m4s\n'},'https://cdn.example/init.mp4':{bytes:Buffer.from('000000186674797069736f6d00000001','hex')},'https://other.example/one.m4s':{bytes:Buffer.from('000000186d6f6f660000000000000000','hex')}});assert.equal(result.playable,true);assert.equal(requests.at(-1).options.headers.Cookie,undefined);assert.equal(requests[1].options.headers.Cookie,'private-cookie');
});
test('a nonzero byte range cannot be certified when the server ignores Range',async()=>{
 const{result}=await check({[base]:{bytes:'#EXTM3U\n#EXTINF:5,\n#EXT-X-BYTERANGE:752@1000\none.ts\n'},'https://cdn.example/one.ts':{bytes:ts}});assert.equal(result.reason,'HLS_BYTERANGE_IGNORED');
});
