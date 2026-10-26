import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSE_SECTIONS,browseRequest,browseCatalog} from '../server/catalog-browser.mjs';
import {CinemaCategories} from '../web/core/catalog-config.js';
test('web filters exactly match canonical sections and selection constrains TMDB request',()=>{
 for(const [section,rows]of Object.entries(BROWSE_SECTIONS))assert.deepEqual(CinemaCategories[section].map(x=>[x.url,x.title]),rows);
 assert.equal(browseRequest('catalog:movie:ar').params.with_original_language,'ar');
 assert.equal(browseRequest('catalog:anime:tv').params.with_genres,'16');
 assert.equal(browseRequest('catalog:turkish:movie').path,'/discover/movie');
 assert.throws(()=>browseRequest('https://evil/'),/INVALID_CATALOG_SECTION/);
});
test('canonical refs and truthful missing values reach every platform',async()=>{
 const result=await browseCatalog({catalog:async()=>({results:[{id:1,name:'Show',first_air_date:'2026-01-01',vote_count:0}],page:1,total_pages:2})},'catalog:tv:all',1);
 assert.equal(result.data[0].id,'tmdb:tv:1');assert.equal(result.data[0].rating,null);assert.equal(result.has_more,true);
});
