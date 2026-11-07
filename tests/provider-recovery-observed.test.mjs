import test from 'node:test';import assert from 'node:assert/strict';
import * as najd from '../server/scrapers/registry.mjs';import * as beta from '../server/browser/registry.mjs';
for(const[scope,family]of[['najd',najd],['beta',beta]]){
 test(scope+' QFilm retains its actual same-video play control, excludes ads and other video identities',async()=>{
 const entry=family.getProvider('qfilm');const base='https://a.qfilm.tv/watch.php?vid=abc123';
 const rows=await entry.module.scrapeServers(base,{fixtureHtml:'<div id="BiBplayer"><a class="xtgo" href="play.php?vid=abc123">play</a><a class="xtgo" href="play.php?vid=other">wrong video</a><a class="xtgo" href="https://ad.example/play.php?vid=abc123">ad</a></div><a href="play.php?vid=outside">outside</a>'});
 assert.equal(rows.length,1);assert.equal(rows[0].url,'https://a.qfilm.tv/play.php?vid=abc123');assert.equal(rows[0].verified,false);
 });
 test(scope+' 3ckTV follows its observed watch bridge and keeps every iframe server tab',async()=>{
 const frames=['one','two','three','four'].map(n=>`<li data-server="&lt;iframe src=&quot;https://player.example/embed/${n}&quot;&gt;&lt;/iframe&gt;">${n}</li>`).join('');const sent=[];
 const rows=await family.getProvider('3cktv').module.scrapeServers('https://e.3cktv.com/video/observed-ep-1/',{
 maxRetries:0,dnsLookupImpl:async()=>[{address:'93.184.216.34',family:4}],unwrapEmbed:async()=>[],fetchImpl:async url=>{
 const u=new URL(url);sent.push(u.hostname);return new Response(u.hostname==='yespress7.com'?`<ul class="servList">${frames}</ul>`:'<a id="btnWatch" class="single-watch-btn" href="https://yespress7.com/trend/1010.php?post=fixture">مشاهدة الحلقة</a>',{headers:{'content-type':'text/html'}});
 }});assert.deepEqual(sent,['e.3cktv.com','yespress7.com']);assert.equal(rows.length,4);assert(rows.every(s=>s.type==='embed'&&!s.verified));
 });
 test(scope+' observed TV anime does not become a movie or manufacture missing episodes',async()=>{
 const e=family.getProvider('anime4up');const d=await e.module.scrapeDetails(e.meta.domains[0]+'/anime/observed/',{fixtureHtml:'<h1 class="anime-details-title">Evil or Live</h1><div class="anime-info">نوع الأنمي: TV بداية العرض: 2017 عدد الحلقات: 12</div><div class="episodes-grid empty">لا توجد حلقات.</div>'});
 assert.equal(d.type,'series');assert.equal(d.declared_episode_count,12);assert.equal(d.source_index_partial,true);assert.equal(d.episodes.length,0);
 });
 test(scope+' EgyDead uses work metadata instead of menu and related-work headings',async()=>{
 const d=await family.getProvider('egydead').module.scrapeDetails('https://a1.egydead.media/episodes/observed-s02e08/',{fixtureHtml:'<meta property="og:title" content="مسلسل Observed الموسم الثاني الحلقة 8"><div class="slideMenu"><h1>القائمه الرئيسيه</h1></div><div class="related-posts"><h1 class="BottomTitle">عمل آخر</h1></div>'});
 assert.equal(d.title,'مسلسل Observed الموسم الثاني الحلقة 8');assert.equal(d.type,'series');
 });
 test(scope+' ArabSeed reads its observed modern card and correct public search field',async()=>{
 const e=family.getProvider('arabseed');const cards=await e.module.scrapeCatalog('movies',1,{fixtureHtml:'<a class="movie__block" title="فيلم Observed 2026" href="https://m.myseed.tv/observed-2026/"><img src="https://images.example/poster.jpg"><h3>فيلم Observed 2026</h3></a>'});
 assert.equal(cards.length,1);assert.equal(cards[0].title,'فيلم Observed 2026');assert.equal(e.meta.searchSpec.queryParam,'word');
 });
}
for(const[scope,path]of[['najd','../server/harvest/episode-index.mjs'],['beta','../server/browser/episode-index.mjs']])test(scope+' follows observed Anime4Up anchor pagination without guessing pages or crossing works',async()=>{
 const {scanEpisodeIndex}=await import(path);const base='https://anime.example/anime/observed/';
 const graph=scanEpisodeIndex('<div class="episodes-pagination-holder"><a class="next page-numbers" href="'+base+'page/2/">»</a><a class="page-numbers" href="'+base+'page/26/">26</a><a class="page-numbers" href="https://anime.example/anime/other/page/2/">wrong work</a><a class="page-numbers" href="https://127.0.0.1/page/2/">private</a></div>',base,{provider:'anime4up',domains:['anime.example']});
 assert.deepEqual(graph.pages,[base+'page/2/',base+'page/26/']);
});
for(const[scope,family]of[['najd',najd],['beta',beta]]){
 test(scope+' CimaNow never accepts a dead film route redirected to the homepage as work details',async()=>{
 await assert.rejects(()=>family.getProvider('cimanow').module.scrapeDetails('https://cimanow.info/film/observed/',{maxRetries:0,dnsLookupImpl:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async url=>new URL(url).pathname==='/'?new Response('<h1>سيما ناو</h1>'):new Response('',{status:302,headers:{location:'/'}})}),/CIMANOW_UNRELATED_HOME_REDIRECT/);
 });
 test(scope+' EgyDead follows only the observed same-work watch route',async()=>{
 const sent=[];const rows=await family.getProvider('egydead').module.scrapeServers('https://a1.egydead.media/observed/',{maxRetries:0,dnsLookupImpl:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async url=>{
 const u=new URL(url);sent.push(u.pathname);return new Response(u.pathname.endsWith('/watch/')?'<div class="mob-servers"><ul><li data-link="https://player.example/embed/work">MegaMax</li></ul></div>':'<div class="watchNow"><a href="https://a1.egydead.media/observed/watch/">المشاهده والتحميل</a></div>');
 }});assert.deepEqual(sent,['/observed/','/observed/watch/']);assert.equal(rows.length,1);assert.equal(rows[0].url,'https://player.example/embed/work');assert.equal(rows[0].verified,false);
 });
 test(scope+' EgyDead Live reports the observed VOD replacement without fabricating live channels',async()=>{
 const rows=await family.getProvider('egydead_live').module.scrapeCatalog('live',1,{fixtureHtml:'<li class="movieItem"><a href="https://a1.egydead.media/movie/">Film</a></li>'});assert.equal(rows.length,0);assert.equal(rows._meta.errorCode,'STRUCTURE_CHANGED');assert.equal(rows._meta.errorMessage,'LIVE_SOURCE_NOW_RETURNS_VOD_NOT_CHANNELS');
 });
}
