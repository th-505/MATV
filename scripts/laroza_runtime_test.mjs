import assert from 'node:assert/strict';
import http from 'node:http';
import { createLarozaProvider, LAROZA_CATEGORIES, assertLarozaRef } from '../server/providers/laroza.mjs';
import { createServer, createIntegratedContentRuntime } from '../server/app.mjs';
import { normalizeCatalogItem } from '../server/content-runtime.mjs';
import { resolveCatalogCategory } from '../server/catalog-categories.mjs';

const ref='laroza:'+Buffer.from('/play.php?vid=fixture01').toString('base64url');
const episodeRef='laroza:'+Buffer.from('/play.php?vid=fixture02').toString('base64url');
const seriesRef='laroza:'+Buffer.from('/view-serie1.php?ser=fixture03').toString('base64url');
assert.equal(assertLarozaRef(ref),ref);
assert.equal(assertLarozaRef(seriesRef),seriesRef);
for(const path of ['/embed.php?vid=abc','/play.php?vid=abc&url=https://evil.test','/play.php?vid=abc#hash','https://evil.test/play.php?vid=abc','http://','/play.php?vid=abc&vid=def']) {
  assert.throws(()=>assertLarozaRef('laroza:'+Buffer.from(path).toString('base64url')),/LAROZA_BAD_REFERENCE/);
}
let clock=1000;
const calls=[];
const item={id:'fixture01',ref,title:'A verified title',type:'series',year:2024,poster:'https://image.test/poster.jpg',
  genres:['Drama'],audio_language:'tr',edition:'original-cut',season_number:1,episode_number:null,imdb_id:'tt1234567',identity_verified:true};
const provider=createLarozaProvider({edgeBase:'https://edge.test',now:()=>clock,fetchImpl:async(target,init)=>{
  const url=new URL(target);calls.push({url,init});
  assert.equal(url.origin,'https://edge.test');
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  assert.deepEqual(init.headers,{Accept:'application/json'});assert(init.signal instanceof AbortSignal);
  if(url.pathname==='/v1/laroza/category') {
    assert(Object.values(LAROZA_CATEGORIES).some(v=>v.endsWith(':'+url.searchParams.get('section'))));
    assert.equal(Number.isInteger(Number(url.searchParams.get('page'))),true);
    const page=Number(url.searchParams.get('page'));
    return Response.json({status:'success',source:'laroza',data:page===4?[]:[{...item,title:'Page '+page}],
      has_more:true,pagination:{page,has_more:true,next_page:page+1,bounded_feed_rotation:true}});
  }
  if(url.pathname==='/v1/laroza/search') return Response.json({status:'success',source:'laroza',data:[item]});
  assert.equal(url.pathname,'/v1/laroza/details');assert.equal(url.searchParams.get('ref'),ref);
  return Response.json({status:'success',source:'laroza',data:{...item,description:'Summary',
    episodes:[{...item,ref:episodeRef,id:'fixture02',type:'episode',episode_number:2,title:'Episode 2'}],
    media_path:'https://untrusted.test/embedded-player',media_sources:[{url:'https://untrusted.test/video.mp4'}],
    iframe_url:'https://ads.test/embed',playback_mode:'proxy'}});
}});
const [a,b]=await Promise.all([provider.category('laroza-movies',2),provider.category('laroza-movies',2)]);
assert.deepEqual(a,b);assert.equal(calls.length,1,'coalesce equal metadata requests');
await provider.category('laroza-movies',2);assert.equal(calls.length,1,'bounded metadata cache');
clock+=120001;await provider.category('laroza-movies',2);assert.equal(calls.length,2);
const anime=await provider.category('laroza-anime',1);assert(anime.data[0].genres.includes('anime'));assert.equal(anime.data[0].category,'anime');
const searching=await provider.search('Title');
const row=searching.data[0];assert.equal(row.source,'laroza');assert.equal(row.audio_language,'tr');assert.equal(row.edition,'original-cut');
assert.deepEqual(row.genres,['Drama']);assert.equal(row.imdb_id,'tt1234567');assert.equal(row.identity_verified,true);
assert.equal(row.season_number,1);assert.equal(row.episode_number,null);assert.deepEqual(row.source_refs,{laroza:ref});
const details=await provider.details(ref);
assert.equal(details.movie_title,item.title);assert.equal(details.description,'Summary');
assert.equal(details.episodes[0].ref,episodeRef);assert.equal(details.episodes[0].episode_number,2);
assert.equal(details.media_path,undefined);assert.equal(details.iframe_url,undefined);assert.deepEqual(details.media_sources,[]);
assert.equal(details.is_iframe,false);assert.equal(details.download_available,false);
const before=calls.length;
await assert.rejects(provider.category('unknown',1),/LAROZA_BAD_CATEGORY/);
await assert.rejects(provider.category('laroza-movies',1.5),/LAROZA_BAD_CATEGORY/);
await assert.rejects(provider.details('laroza:bad'),/LAROZA_BAD_REFERENCE/);
assert.equal(calls.length,before,'invalid references/IDs must fail without gateway or source access');
for(const id of Object.keys(LAROZA_CATEGORIES)) assert.equal(resolveCatalogCategory(id).id,id);
assert.equal(resolveCatalogCategory('edge:laroza:movies'),null,'internal marker is not a public category ID');

const noSource={search:async()=>({status:'success',data:[]}),status:()=>({provider:'fixture'})};
const integrated=createIntegratedContentRuntime(noSource,{alooyRuntime:noSource,larozaRuntime:provider,
  searchCatalog:async()=>({status:'success',source:'akoam',data:[{...item,ref:'legacy:other',source:'akoam',audio_language:'',edition:'',identity_verified:false}]}),
  searchScraper:async()=>[],
  fetchCategory:async()=>{throw Error('Laroza must not reach a source HTML scraper');},fetchMatches:async()=>({data:[]})});
const combined=await integrated.search('Title');
assert.equal(combined.data.length,2,'same title/year must not merge different source identities on the server');
assert.equal(combined.data.find(r=>r.source==='laroza').imdb_id,item.imdb_id);
assert.equal(combined.data.find(r=>r.source==='akoam').audio_language,'');
const server=createServer({iskRuntime:noSource,alooyRuntime:noSource,larozaRuntime:provider,runtimeService:integrated});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  const response=await fetch(base+'/api/v1/category?ref=laroza-movies&p=3');
  assert.equal(response.status,200);const page=await response.json();
  assert.equal(page.kind,'category');assert.equal(page.data[0].title,'Page 3');assert.equal(page.data[0].source,'laroza');
  assert.equal(page.data[0].audio_language,'tr');assert.equal(page.data[0].imdb_id,item.imdb_id);
  assert.equal(page.has_more,true);assert.equal(page.pagination.next_page,4);
  const emptyPage=await (await fetch(base+'/api/v1/category?ref=laroza-movies&p=4')).json();
  assert.deepEqual(emptyPage.data,[]);assert.equal(emptyPage.has_more,true);assert.equal(emptyPage.pagination.next_page,5);
  const refs=await (await fetch(base+'/api/v1/categories')).json();assert(refs.data.some(x=>x.id==='laroza-anime'));
  const metadata=await (await fetch(base+'/api/cinema/metadata?ref='+encodeURIComponent(ref))).json();
  assert.equal(metadata.source,'laroza');assert.equal(metadata.episodes[0].ref,episodeRef);assert.equal(metadata.media_path,undefined);
  const detail=await (await fetch(base+'/api/cinema/details?ref='+encodeURIComponent(ref))).json();
  assert.equal(detail.episodes.length,1);assert(!JSON.stringify(detail).includes('ads.test'));
  const rejected=await fetch(base+'/api/cinema/details?ref=laroza:bad');assert.equal(rejected.status,400);
  const retired=await fetch(base+'/api/cinema/media?id=laroza&download=1');assert.equal(retired.status,410);
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}

const playablePage=createLarozaProvider({edgeBase:'https://edge.test',fetchImpl:async()=>Response.json({status:'success',source:'laroza',data:{...item,episodes:[]}})});
const playableMetadata=await playablePage.metadata(ref);
assert.equal(playableMetadata.playback_unavailable,true);assert.equal(playableMetadata.playback_reason,'EDGE_DIRECT_RESOLUTION_REQUIRED');
assert.equal(playableMetadata.media_path,undefined);
const parentPage=createLarozaProvider({edgeBase:'https://edge.test',fetchImpl:async(target)=>{
  assert.equal(new URL(target).searchParams.get('ref'),seriesRef);
  return Response.json({status:'success',source:'laroza',data:{...item,ref:seriesRef,
    episodes:[{...item,ref:episodeRef,episode_number:2}],work_identity_verified:true,timeline_verified:false,identity_verified:false}});
}});
const parentMetadata=await parentPage.metadata(seriesRef);
assert.equal(parentMetadata.episodes[0].ref,episodeRef);assert.equal(parentMetadata.work_identity_verified,true);
assert.equal(parentMetadata.timeline_verified,false);assert.equal(parentMetadata.identity_verified,false);
for(const response of [new Response('<html>ads</html>',{headers:{'content-type':'text/html'}}),Response.json({status:'success',source:'unexpected',data:[]}),Response.json({status:'success',source:'laroza',data:[],padding:'x'.repeat(128*1024)})]) {
  const broken=createLarozaProvider({edgeBase:'https://edge.test',fetchImpl:async()=>response});
  await assert.rejects(broken.category(),/LAROZA_(BAD_EDGE_RESPONSE|EDGE_RESPONSE_TOO_LARGE)/);
}
assert.throws(()=>createLarozaProvider({edgeBase:'http://edge.test'}),/LAROZA_BAD_EDGE_ENDPOINT/);
assert.throws(()=>createLarozaProvider({edgeBase:'https://user:password@edge.test'}),/LAROZA_BAD_EDGE_ENDPOINT/);
const unknown=normalizeCatalogItem({title:'Foreign',ref:'legacy:unknown',source:'akoam',audio_language:null,edition:null,imdb_id:'not-proof',identity_verified:false});
assert.equal(unknown.audio_language,'');assert.equal(unknown.edition,'');assert.equal(unknown.imdb_id,null);
console.log('Laroza Node facade: bounded gateway JSON only, paginated catalog/search/details, source identity preservation, no title/year merge, and no video proxy revival passed');
