import test from 'node:test';
import assert from 'node:assert/strict';
import { createTmdbRuntime } from '../server/tmdb-runtime.mjs';

test('TMDB uses backup key when primary is rejected', async () => {
  const keys = [];
  const runtime = createTmdbRuntime({
    apiKey: 'primary', backupApiKey: 'backup', bearerToken: '',
    fetchImpl: async url => {
      const key = new URL(url).searchParams.get('api_key');
      keys.push(key);
      return key === 'primary'
        ? { ok:false, status:401, body:null }
        : { ok:true, status:200, json:async()=>({results:[]}) };
    },
  });
  const result = await runtime.search('test film');
  assert.equal(result.status,'success');
  assert.deepEqual(keys,['primary','backup']);
});
test('TMDB does not retry backup for server errors', async () => {
  let count = 0;
  const runtime = createTmdbRuntime({
    apiKey:'primary',backupApiKey:'backup',bearerToken:'',
    fetchImpl:async()=>{count++;return {ok:false,status:500,body:null};},
  });
  await assert.rejects(runtime.search('test film'),/TMDB_HTTP_500/);
  assert.equal(count,1);
});
