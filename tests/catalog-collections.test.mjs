import test from 'node:test';import assert from 'node:assert/strict';
import {CATALOG_COLLECTIONS,collectionRequest} from '../server/catalog-collections.mjs';
import {browseRequest} from '../server/catalog-browser.mjs';import {validateTmdbCatalogRequest} from '../server/tmdb-runtime.mjs';
test('54 independent collection policies are bounded valid TMDB discover requests',()=>{
 assert.equal(CATALOG_COLLECTIONS.length,54);assert.equal(new Set(CATALOG_COLLECTIONS.map(r=>r.id)).size,54);
 for(const row of CATALOG_COLLECTIONS){const request=browseRequest(row.id,1);assert.doesNotThrow(()=>validateTmdbCatalogRequest(request.path,request.params));}
 assert.throws(()=>browseRequest('catalog:collection:arbitrary'),/INVALID_CATALOG_SECTION/);
 assert.throws(()=>browseRequest(CATALOG_COLLECTIONS[0].id,501),/INVALID_CATALOG_SECTION/);
});
test('weekly Turkish calendar follows actual air-date range and top ranking has a vote floor',()=>{
 const week=collectionRequest('catalog:collection:turkish-week',1,new Date('2026-11-06T12:00:00Z'));
 assert.equal(week.params['air_date.gte'],'2026-10-31');assert.equal(week.params['air_date.lte'],'2026-11-06');assert.equal(week.params.with_original_language,'tr');
 const top=collectionRequest('catalog:collection:movie-top',1);assert.equal(top.params['vote_count.gte'],'300');assert.equal(top.params.sort_by,'vote_average.desc');
});
