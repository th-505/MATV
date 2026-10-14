import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const {__extractDownloadCandidatesForTest}=await import('../server/app.mjs');
const candidates=__extractDownloadCandidatesForTest('<a href="https://video.downet.net/hls/master.m3u8">HLS</a><a href="https://files.downet.net/download/direct.mp4">MP4</a><a href="https://files.downet.net/ads/redirect">Unsafe HTML</a>','https://akwam.ss/download/example');
assert(candidates.includes('https://files.downet.net/download/direct.mp4'));
assert(candidates.includes('https://video.downet.net/hls/master.m3u8'));
assert(!candidates.some(url=>url.includes('/ads/redirect')));
assert(candidates.every(url=>/\.(mp4|m3u8)(?:$|\?)/.test(url)));
console.log('Independent direct watch/download discovery: media URLs only; no proxy references');
