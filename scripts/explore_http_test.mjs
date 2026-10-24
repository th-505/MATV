import assert from 'node:assert/strict';
import { createServer } from '../server/app.mjs';
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
try {
  const response = await fetch(base + '/api/v1/explore/sources');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 19);
  assert(body.data.some(source => source.id === 'anime4up_rest'));
  assert(body.data.every(source => source.search === true && !('module' in source)));
  assert.equal((await fetch(base + '/api/v1/explore/sources', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/v1/explore?q=Example&provider=missing')).status, 422);
  assert.equal((await fetch(base + '/api/v1/explore?q=a&provider=akwam')).status, 400);
  console.log('Explore HTTP: dynamic capability list, method restriction and invalid source/query passed; no upstream provider calls.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
