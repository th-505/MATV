import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {listProviders} from '../server/scrapers/registry.mjs';
import {sourceDisplayName,sourceDisplayNames} from '../server/source-display.mjs';
import {FEED_CATEGORIES} from '../server/catalog-feed.mjs';
import {PRODUCT_VERSION} from '../server/content-runtime.mjs';

// Static contracts only: never trigger source searches, scraping or playback.
export async function verifyExperienceDeployment(base,{fetchImpl=fetch}={}) {
  const origin=new URL(base);
  assert.equal(origin.protocol,'https:');
  assert(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname==='/');
  async function json(path) {
    const response=await fetchImpl(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(90000)});
    assert.equal(response.status,200,`Deployment contract missing: ${path}`);
    return response.json();
  }
  const [status,sources,categories,tmdb]=await Promise.all([
    json('/api/runtime/status'),json('/api/v1/search/providers'),json('/api/v1/categories'),json('/api/v1/tmdb/status'),
  ]);
  assert.equal(status.version,PRODUCT_VERSION,'Deploy the matching backend before publishing clients');
  assert.equal(sources.status,'success');
  assert.deepEqual(sources.data.map(row=>row.id).sort(),listProviders().map(row=>row.id).sort());
  for(const provider of listProviders()) {
    const row=sources.data.find(row=>row.id===provider.id);
    assert.equal(row.displayName,sourceDisplayName(provider.name || provider.id));
    assert.deepEqual(row.displayNames,sourceDisplayNames(provider.name || provider.id));
  }
  for(const category of Object.keys(FEED_CATEGORIES))assert.ok(categories.data.some(row=>row.id===category),`Missing feed ${category}`);
  assert.equal(tmdb.configured,true,'Home metadata requires the configured server-side TMDb integration');
  return {version:PRODUCT_VERSION,providers:sources.data.length,feed_categories:Object.keys(FEED_CATEGORIES).length};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log(await verifyExperienceDeployment(process.argv[2] || process.env.MITV_API_BASE));
}
