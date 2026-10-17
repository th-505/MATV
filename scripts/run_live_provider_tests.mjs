import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tests = readdirSync(resolve(root, 'scripts/providers')).filter((name) => name.endsWith('.live.test.mjs')).sort();
assert.ok(tests.length > 0, 'no opt-in live provider checks are registered');
let failures = 0;
for (const name of tests) {
  console.log(`\n[LIVE PROVIDER CHECK] ${name}`);
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/providers', name)], {
    cwd: root, env: process.env, stdio: 'inherit', timeout: 120_000
  });
  if (result.error || result.status !== 0) {
    failures += 1;
    console.error(`FAIL: ${name}: ${result.error?.message || `exit ${result.status}`}`);
  }
}
console.log(`\nLive provider check summary: ${tests.length - failures}/${tests.length} passed.`);
if (failures) process.exitCode = 1;
