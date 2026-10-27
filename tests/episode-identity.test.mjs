import {sanitizeDetailsPayload} from '../server/scrapers/index.mjs';
import {isCinemaPayload} from '../web/core/contracts.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contentIdentity,explicitEpisode,normalizeEpisodeEntries} from '../shared/content-identity.js';
import {normalizeDetailsResult} from '../server/scrapers/shared/normalize.mjs';
import {scrapeDetails,extractShahid4uStreamsAndEpisodes,extractShahid4uCardsFromHtml} from '../server/scrapers/sites/shahid4u.mjs';
test('Conan episode1217, season numbers, Arabic digits and film sequel numbers remain distinct',()=>{
 assert.equal(explicitEpisode('الموسم 1 الحلقة 1217'),1217);
 assert.equal(explicitEpisode('الموسم ١ الحلقة ١٢١٧'),1217);
 assert.equal(explicitEpisode('Detective Conan Movie 12'),null);
 assert.equal(explicitEpisode('Film 2007 1080p'),null);
 assert.equal(contentIdentity({title:'فيلم انمي Detective Conan Movie 12',type:'anime'}).type,'movie');
 assert.equal(contentIdentity({title:'انمي المحقق كونان Detective Conan الحلقة 1217 مترجمة',type:'movie'}).type,'series');
 assert.equal(contentIdentity({title:'انمي المحقق كونان Detective Conan الحلقة 1217 مترجمة',type:'movie'}).episode_number,1217);
 assert.equal(normalizeEpisodeEntries([{title:'الموسم 1 الحلقة 1217',number:1}])[0].number,1217);
 assert.equal(normalizeEpisodeEntries([{title:'حلقة غير مرقمة'}])[0].number,null);
 assert.equal(normalizeEpisodeEntries([]).length,0);
});
test('real observed same-series markup preserves1207..1217 and excludes unrelated episodes',async()=>{
 const html=await readFile(new URL('./fixtures/conan-1217.html',import.meta.url),'utf8');
 const d=await scrapeDetails('https://shahidfu.cam/episode-almhqq-kwnan-detective-conan-e1217/',{fixtureHtml:html});
 assert.equal(d.episode_number,1217);assert.equal(d.type,'series');
 assert.deepEqual(d.episodes.map(e=>e.number),[1207,1208,1209,1210,1211,1212,1213,1214,1215,1216,1216,1217]);
 assert(d.episodes.every(e=>e.ref&&e.season===1));
 assert(!d.episodes.some(e=>e.number===1||e.number===4));
 const own=d.episodes.find(e=>e.number===1217);assert(own.url.includes('e1217'));
});
test('an explicit film cannot acquire a made-up series list from related data',()=>{
 const d=normalizeDetailsResult({title:'فيلم Detective Conan Movie 12',type:'movie',url:'https://shahidfu.cam/film-conan/',episodes:[{number:1,url:'https://shahidfu.cam/episode-related-e1/'}]},{providerId:'shahid4u'});
 assert.equal(d.type,'movie');assert.equal(d.is_series,false);assert.equal(d.episode_number,null);assert.deepEqual(d.episodes,[]);
});

test('public details wrapper retains source identity and satisfies the real browser contract',async()=>{
 const html=await readFile(new URL('./fixtures/conan-1217.html',import.meta.url),'utf8');
 const raw=await extractShahid4uStreamsAndEpisodes('https://shahidfu.cam/episode-almhqq-kwnan-detective-conan-e1217/',{fixtureHtml:html});
 const actual=sanitizeDetailsPayload(raw,'shahid4u');
 assert(isCinemaPayload(actual));assert.equal(actual.status,'success');assert.equal(actual.episode_number,1217);assert.equal(actual.type,'series');assert.equal(actual.episodes.at(-1).number,1217);
});
