import assert from 'node:assert/strict';
import {verifyExperienceDeployment} from './verify_experience_deployment.mjs';
import {listProviders} from '../server/scrapers/registry.mjs';
import {sourceDisplayName,sourceDisplayNames} from '../server/source-display.mjs';
import {FEED_CATEGORIES} from '../server/catalog-feed.mjs';
import {PRODUCT_VERSION} from '../server/content-runtime.mjs';
const calls=[];
const metadata={
  '/api/runtime/status':{version:PRODUCT_VERSION},
  '/api/v1/search/providers':{status:'success',data:listProviders().map(meta=>({id:meta.id,displayName:sourceDisplayName(meta.name),displayNames:sourceDisplayNames(meta.name)}))},
  '/api/v1/categories':{data:Object.keys(FEED_CATEGORIES).map(id=>({id}))},
  '/api/v1/tmdb/status':{configured:true},
};
const fetchImpl=async url=>{calls.push(url.pathname);assert.ok(Object.hasOwn(metadata,url.pathname));return Response.json(metadata[url.pathname]);};
assert.equal((await verifyExperienceDeployment('https://fixture.example',{fetchImpl})).providers,listProviders().length);
assert.equal(calls.length,4);
metadata['/api/runtime/status'].version='0.0.1';
await assert.rejects(verifyExperienceDeployment('https://fixture.example',{fetchImpl}),/matching backend/);
metadata['/api/runtime/status'].version=PRODUCT_VERSION;
metadata['/api/v1/categories'].data=[];
await assert.rejects(verifyExperienceDeployment('https://fixture.example',{fetchImpl}),/Missing feed/);
console.log('Publication gate rejects old backend/feed contracts without live provider calls');
