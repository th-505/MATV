import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStream} from '../server/scrapers/sites/mewsry.mjs';
test('Syria Live resolver decodes its own references before validating the URL', async () => {
 const url='https://media.example.com/channel.m3u8';
 const ref='mewsry:'+Buffer.from(url).toString('base64url');
 const result=await resolveStream(ref,{skipProbe:true});
 assert.equal(result.streamUrl,url);
 assert.equal(result.type,'m3u8');
 assert.equal(result.verified,false,'a skipped network probe is not playback verification');
});
test('Syria Live encoded private-address references remain blocked', async () => {
 const ref='mewsry:'+Buffer.from('http://127.0.0.1/channel.m3u8').toString('base64url');
 await assert.rejects(resolveStream(ref,{skipProbe:true}));
});
