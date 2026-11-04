import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceManifest} from '../server/scrapers/source-manifest.mjs';
test('new server providers enter the manifest without client names or downloaded code',()=>{
  const meta={id:'future_source',name:'مصدر مستقبلي',domains:['https://future.example'],capabilities:{search:true,details:true,resolve:true}};
  const before=sourceManifest([]), after=sourceManifest([meta]);
  assert.notEqual(after.revision,before.revision);
  assert.equal(after.data[0].id,'future_source');
  assert.equal(after.data[0].reference_protocol,'najd-source-v1');
  assert.equal(after.data[0].capabilities.search,true);
  assert.equal(after.data[0].capabilities.live,false);
  assert.equal(after.data[0].domain,'future.example');
  assert.ok(!JSON.stringify(after).includes('https://'));
  assert.equal(sourceManifest([meta]).revision,after.revision);
});
