import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBrstejCatalog,parseBrstejDetails,decodeProviderRef,BRSTEJ_CONFIG,scrapeServers,resolveStream} from '../server/scrapers/sites/brstej.mjs';
import {HOME_HTML,SEARCH_HTML,MOVIES_HTML,SERIES_CATALOG_HTML,SERIES_HTML,MOVIE_HTML,PLAY_HTML} from '../scripts/fixtures/providers/brstej.fixture.mjs';
test('Brstej parses observed home/search/movie cards without footer contamination',()=>{
  for(const html of [HOME_HTML,SEARCH_HTML,MOVIES_HTML,SERIES_CATALOG_HTML]){
    const rows=parseBrstejCatalog(html,'https://brstejj.beer/home03');assert.equal(rows.length,4);
    assert.ok(rows.every(r=>r.source==='brstej'&&r.ref.startsWith('brstej:')&&r.title));
  }
});
test('Brstej keeps all observed episode references, season partitions and number 351',()=>{
  const details=parseBrstejDetails(SERIES_HTML,'https://brstejj.beer/series1.php?id=e83835a07');
  assert.equal(details.episodes.length,352,'retain alternative observed references; no arbitrary 60-item cap');
  assert.deepEqual([...new Set(details.episodes.map(e=>e.season))],[1,2,3]);
  assert.equal(Math.max(...details.episodes.map(e=>e.number)),351);
  assert.equal(new Set(details.episodes.map(e=>e.ref)).size,352);
  const movie=parseBrstejDetails(MOVIE_HTML,'https://brstejj.beer/video.php?vid=d637eef16');
  assert.equal(movie.type,'movie');assert.equal(movie.episodes.length,0);
});
test('Brstej embed servers remain non-playable until a direct stream is extracted',async()=>{
  const ref='https://brstejj.beer/play.php?vid=6e07b148f';
  const servers=await scrapeServers(ref,{fixtureHtml:PLAY_HTML});assert.equal(servers.length,4);
  assert.ok(servers.every(s=>s.type==='embed'&&!s.verified));
  const resolved=await resolveStream(ref,{fixtureHtml:PLAY_HTML});assert.equal(resolved.ok,false);assert.equal(resolved.url,null);
});
test('Brstej source refs reject other hosts, unsafe URLs and unrelated pages',()=>{
  for(const url of ['http://127.0.0.1/video.php?vid=1','https://evil.example/video.php?vid=1','https://brstejj.beer/login.php','https://user:secret@brstejj.beer/video.php?vid=1'])assert.throws(()=>decodeProviderRef('brstej:'+Buffer.from(url).toString('base64url')));
  assert.equal(decodeProviderRef('brstej:'+Buffer.from('https://brstejj.beer/series1.php?id=e83835a07').toString('base64url')),'https://brstejj.beer/series1.php?id=e83835a07');
});

test('Brstej accepts its observed new primary and preserves legacy references without opening arbitrary hosts',()=>{
 assert.equal(BRSTEJ_CONFIG.baseUrl,'https://su.brstej.com');
 for(const host of ['su.brstej.com','brstejj.pics','brstejj.beer']) assert.equal(new URL(decodeProviderRef('https://'+host+'/video.php?vid=abc123')).hostname,host);
 assert.throws(()=>decodeProviderRef('https://unrelated.example/video.php?vid=abc123'));
 assert.throws(()=>decodeProviderRef('https://127.0.0.1/video.php?vid=abc123'));
});
