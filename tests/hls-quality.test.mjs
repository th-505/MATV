import test from 'node:test';import assert from 'node:assert/strict';
import {observedHlsQualities} from '../server/harvest/hls-quality.mjs';
test('master quality metadata preserves observed levels and separate audio without publishing child URLs',()=>{
 const levels=observedHlsQualities('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/index.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"\n720/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080/index.m3u8\n','https://cdn.example/master.m3u8');
 assert.deepEqual(levels.map(x=>x.height),[720,1080]);assert.equal(levels[0].codecs,'avc1.64001f,mp4a.40.2');assert(!JSON.stringify(levels).includes('m3u8'));
});
test('media playlist has no invented quality; private targets and malformed resolutions are rejected',()=>{
 assert.deepEqual(observedHlsQualities('#EXTM3U\n#EXTINF:6\nsegment.ts','https://cdn.example/media.m3u8'),[]);
 assert.deepEqual(observedHlsQualities('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nhttps://127.0.0.1/private.m3u8\n','https://cdn.example/master.m3u8'),[]);
});
