// An old or expired cloud reference never revives an upstream stream.
import assert from 'node:assert/strict';
import { directSource } from '../server/direct-media.mjs';
const stale='https://video.downet.net/master.m3u8?expires='+Math.floor((Date.now()-1000)/1000);
assert.throws(()=>directSource(stale,{}),/STREAM_EXPIRED/);
const source=directSource('https://video.downet.net/video.mp4',{'User-Agent':'fixture'});
assert(Date.parse(source.expires_at)>Date.now()+30000);
assert(Date.parse(source.expires_at)<=Date.now()+240000);
assert.equal(source.playback_mode,'direct');assert.equal(source.media_path,source.stream_url);
console.log('Direct media expiry: expired tokens rejected; unknown lifetimes bounded to four minutes');
