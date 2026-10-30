import {test} from 'node:test';import assert from 'node:assert/strict';import {matchesFilm,normalizeCandidate} from './providers.mjs';
test('film matching rejects wrong year, sequel, series and dubbed edition',()=>{
 assert.ok(matchesFilm({title:'Detective Conan Movie 28: One-Eyed Flashback 2025'}));
 assert.ok(matchesFilm({title:'فيلم المحقق كونان 28 (2025) مترجم'}));
 for(const title of ['فيلم كونان 29 2025','فيلم كونان 280 2025','فيلم كونان ٢٨٠ 2025','One-Eyed Flashback 2024','One-Eyed Flashback 2025 مدبلج'])assert.equal(matchesFilm({title}),false,title);
 assert.equal(matchesFilm({title:'One-Eyed Flashback',type:'series'}),false);
});
test('new provider media rejects private/credentialed/insecure endpoints before playback',async()=>{
 for(const url of ['http://cdn.example.com/film.m3u8','https://127.0.0.1/film.m3u8','https://user:pass@cdn.example.com/film.m3u8'])await assert.rejects(()=>normalizeCandidate({url},'test'));
});
import {getProvider as bundledProvider} from './provider-runtime.mjs';
import {getProvider as sourceProvider} from '../../server/scrapers/registry.mjs';
for(const provider of ['mycima','cimanow','qfilm'])test('vendored '+provider+' parser preserves captured search fixture results',async()=>{
 const fixture=await import('../../scripts/fixtures/providers/'+provider+'.fixture.mjs');
 const options={fixtureHtml:fixture.SEARCH_HTML,fixtureStatus:200};
 const [actual,expected]=await Promise.all([bundledProvider(provider).module.scrapeSearch('test',1,options),sourceProvider(provider).module.scrapeSearch('test',1,options)]);
 assert.deepEqual(actual.map(x=>x.title),expected.map(x=>x.title));assert.ok(actual.length>0);
});
