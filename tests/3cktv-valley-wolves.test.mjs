import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PROVIDER_META,THREE_CKTV_CONFIG,encode3cktvRef,decode3cktvRef,scrapeSearch,scrapeDetails,extractEpisodesFromHtml} from '../server/scrapers/sites/3cktv.mjs';
import {BROWSER_USER_AGENTS} from '../server/scrapers/anti-ban.mjs';
const fixture=name=>readFile(new URL('./fixtures/valley-wolves/'+name,import.meta.url),'utf8');
test('observed cam search keeps 21 unique results and real next-page URL',async()=>{
 const rows=await scrapeSearch('وادي الذئاب',1,{fixtureHtml:await fixture('3cktv-search.html')});
 assert.equal(rows.length,21);assert.equal(new Set(rows.map(r=>r.ref)).size,21);assert.equal(rows._meta.next_page,2);
 assert.equal(new URL(rows._meta.next_url).hostname,'e.3cktv.cam');assert(rows.some(r=>r.title==='مسلسل وادي الذئاب مترجم'));assert(rows.some(r=>r.title==='مسلسل وادي الذئاب الكمين مترجم'));
});
test('observed original and Pusu source editions retain their own 97/93 continuous indexes and casts',async()=>{
 for(const[name,path,count]of[['original','kurtlar-vadisi',97],['pusu','kurtlar-vadisi-pusu',93]]){
  const d=await scrapeDetails('https://e.3cktv.cam/video/series/'+path+'/',{fixtureHtml:await fixture('3cktv-'+name+'-index.html')});
  assert.equal(d.episodes.length,count);assert.deepEqual(d.episodes.map(e=>e.number),Array.from({length:count},(_,i)=>i+1));assert(d.episodes.every(e=>e.season===1));
  assert.equal(d.year,'');assert.equal(d.observed_language,'Turkish');assert.equal(d.observed_cast.length,4);assert.equal(d.cast.length,4);
  assert.equal(d.title.includes('الكمين'),name==='pusu');
 }
});
test('missing source numbers are omitted and duplicate alternatives do not invent another episode',()=>{
 const html='<ul class="eplist"><a class="epNum" href="/video/a-ep-1217/" title="الحلقة 1217">1217</a><a class="epNum" href="/video/a-ep-1217-alt/" title="الحلقة 1217">1217</a><a class="epNum" href="/video/unknown/">غير مرقم</a></ul>';
 const rows=extractEpisodesFromHtml(html);assert.deepEqual(rows.map(r=>r.number),[1217,1217]);assert.equal(new Set(rows.map(r=>r.ref)).size,2);
});
test('own metadata never uses an upload date or a related card as release year or cast',async()=>{
 const html='<aside><b class="year">2024</b><a href="/video/actor/other/">شخص آخر</a></aside><div class="single_main_content"><h1>مسلسل وادي الذئاب مترجم</h1><div class="date">تاريخ الإضافة2026/10/28</div><span class="release-year">2003</span><a href="/video/actor/observed/">الممثل المرصود</a></div>';
 const d=await scrapeDetails('https://e.3cktv.cam/video/series/kurtlar-vadisi/',{fixtureHtml:html});assert.equal(d.year,'2003');assert.deepEqual(d.observed_cast,['الممثل المرصود']);
});
test('provider page requests use only the verified domain set and the shared HTTP profile',async()=>{
 assert.equal(THREE_CKTV_CONFIG.baseUrl,'https://e.3cktv.cam');assert(!PROVIDER_META.domains.includes('https://d.3cktv.cam'));
 const legacy='https://e.3cktv.com/series/installed-ref/';assert.equal(decode3cktvRef(encode3cktvRef(legacy)),legacy);
 let calls=0;const rows=await scrapeSearch('وادي الذئاب',1,{maxRetries:0,fetchImpl:async(_url,options)=>{calls++;assert.equal(options.headers['User-Agent'],BROWSER_USER_AGENTS[0]);return new Response('',{status:302,headers:{location:'https://d.3cktv.cam/'}})}});
 assert.equal(calls,1);assert.equal(rows._meta.errorCode,'UNSAFE_URL');
 for(const url of ['https://e.3cktv.cam.attacker.example/','https://127.0.0.1/private','http://169.254.169.254/latest/meta-data/'])await assert.rejects(()=>scrapeDetails(url,{fixtureHtml:'<h1>never fetched</h1>'}),e=>e.code==='UNSAFE_URL');
});

test('watch extraction follows only the observed same-episode action and unwraps the actual player',async()=>{
 const{scrapeServers}=await import('../server/scrapers/sites/3cktv.mjs');const calls=[],players=[];
 const source='https://e.3cktv.cam/video/kurtlar-vadisi-ep-01/';
 const landing='<h1>وادي الذئاب الحلقة 1</h1><a href="https://attacker.example/video/kurtlar-vadisi-ep-01/?do=watch">مشاهدة الحلقة</a><a href="/video/other-ep-2/?do=watch">مشاهدة الحلقة</a><a href="?do=download">تحميل الحلقة</a><a href="?do=watch">مشاهدة الحلقة</a>';
 const rows=await scrapeServers(source,{maxRetries:0,fetchImpl:async url=>{const u=new URL(url);calls.push(u.href);return new Response(u.searchParams.get('do')==='watch'?'<iframe src="https://player.example/observed/episode-1"></iframe>':landing,{headers:{'content-type':'text/html'}})},unwrapEmbed:async(url,referer)=>{players.push({url,referer});return[{url:'https://cdn.example/episode-1.mp4',headers:{Referer:'https://player.example/'}}]}});
 assert.deepEqual(calls,[source,source+'?do=watch']);assert.equal(players.length,1);assert.equal(players[0].url,'https://player.example/observed/episode-1');
 assert(rows.some(r=>r.type==='mp4'&&r.url==='https://cdn.example/episode-1.mp4'));assert(rows.every(r=>r.verified===false));assert(!calls.some(u=>u.includes('views')||u.includes('download')||u.includes('attacker')));
});
test('a wrapper query mentioning mp4 remains an embed until actual unwrapping succeeds',async()=>{
 const{extractServersFromHtml}=await import('../server/scrapers/sites/3cktv.mjs');const rows=await extractServersFromHtml('<iframe src="https://player.example/wrapper/?file=video.mp4"></iframe>','https://e.3cktv.cam/video/episode/',{fixtureHtml:'offline'});assert.equal(rows.length,1);assert.equal(rows[0].type,'embed');assert.equal(rows[0].verified,false);
});

test('the observed dubbed source fifth part preserves its real gap at 36',async()=>{
 const d=await scrapeDetails('https://e.3cktv.cam/video/series/kurtlar-vadisi-dubbed-s5/',{fixtureHtml:await fixture('3cktv-dubbed-s5-gap.html')});
 assert.equal(d.episodes.length,77);assert(d.episodes.every(e=>e.season===5));assert.equal(Math.max(...d.episodes.map(e=>e.number)),78);assert(!d.episodes.some(e=>e.number===36));assert(d.episodes.some(e=>e.number===37));
});
