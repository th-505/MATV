import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAhwakCatalog,parseAhwakDetails,scrapeServers,resolveStream,decodeProviderRef} from '../server/scrapers/sites/ahwak.mjs';
import {CATALOG_HTML,SEARCH_HTML,SERIES_HTML,MOVIE_HTML,PLAY_HTML} from '../scripts/fixtures/providers/ahwak.fixture.mjs';
test('Ahwak observed catalogue and search parse independently',()=>{
  for(const html of [CATALOG_HTML,SEARCH_HTML]){
    const rows=parseAhwakCatalog(html,'https://yam.ahwaktv.net/');
    assert.equal(rows.length,3);assert(rows.every(r=>r.source==='ahwak'&&r.ref.startsWith('ahwak:')));
  }
});
test('Ahwak keeps its actual 15-episode first season and films have no synthetic episodes',()=>{
  const d=parseAhwakDetails(SERIES_HTML,'https://yam.ahwaktv.net/view-serie.php?name=khamsin-khamsin-series');
  assert.equal(d.episodes.length,15);assert.deepEqual(d.episodes.map(e=>e.number),Array.from({length:15},(_,i)=>i+1));
  assert(d.episodes.every(e=>e.season===1));
  assert.equal(parseAhwakDetails(MOVIE_HTML,'https://yam.ahwaktv.net/watch.php?vid=22D4b7cbb').episodes.length,0);
});
test('Ahwak uses observed see.php route but never returns an embed as direct playback',async()=>{
  const ref='https://yam.ahwaktv.net/see.php?vid=762766648';
  const servers=await scrapeServers(ref,{fixtureHtml:PLAY_HTML});assert(servers.length>0);assert(servers.every(s=>s.type==='embed'));
  assert.equal((await resolveStream(ref,{fixtureHtml:PLAY_HTML})).ok,false);
  assert.throws(()=>decodeProviderRef('https://127.0.0.1/see.php?vid=1'));
  assert.throws(()=>decodeProviderRef('https://evil.example/see.php?vid=1'));
});
