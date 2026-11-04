import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarvestStore} from '../server/harvest/store.mjs';
test('server registers its providers once, coalesces callers and can retry an outage',async()=>{
 let calls=0;let fail=true;
 const store=createHarvestStore({url:'https://fixture.supabase.co/',key:'sb_secret_fixture',fetchImpl:async(url,options)=>{
  calls++;assert.equal(new URL(url).pathname,'/rest/v1/najd_provider_registry');
  const ids=JSON.parse(options.body).map(x=>x.provider);
  assert(ids.includes('ahwak')&&ids.includes('brstej')&&ids.includes('fosta')&&ids.includes('legacy'));
  assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
  return new Response(null,{status:fail?503:204});
 }});
 await assert.rejects(store.ensureProviderRegistry(),/HARVEST_DB_HTTP_503/);
 fail=false;await Promise.all([store.ensureProviderRegistry(),store.ensureProviderRegistry()]);
 await store.ensureProviderRegistry();assert.equal(calls,2);
});
