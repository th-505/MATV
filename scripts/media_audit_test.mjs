import assert from 'node:assert/strict';
import { createMediaAuditor } from '../server/media-audit.mjs';
const evidence = { provider: 'fixture', expected: { title: 'Example', year: 2024, season: 2, episode: 3 },
  observed: { title: 'Example', year: 2024, season: 2, episode: 3 },
  technical: { playable: true, container: 'hls', statusCode: 200 } };
const answer = (value = { decision: 'matched', confidence: 0.9, reasons: ['Title, year and episode agree.'] }) =>
  new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));
let calls = 0;
const noKey = createMediaAuditor({ apiKey: '', backupApiKey: '', fetchImpl: () => { calls++; } });
assert.equal((await noKey.audit(evidence)).eligible, false);
assert.equal((await noKey.audit(evidence)).aiReviewed, false);
assert.equal(calls, 0);
const primary = 'private-primary-key', backup = 'private-backup-key';
const sent = [], saved = [];
const auditor = createMediaAuditor({ apiKey: primary, backupApiKey: backup, persist: async value => saved.push(value),
  fetchImpl: async (url, options) => {
    sent.push({ url, ...options });
    assert.equal(options.body.includes(primary), false);
    assert.equal(options.body.includes(backup), false);
    assert.equal(options.body.includes('signed.example'), false);
    assert.equal(options.body.includes('private-user'), false);
    assert.equal(options.body.includes('cookie-value'), false);
    return sent.length === 1 ? new Response('', { status: 429 }) : answer();
  } });
const secretEvidence = { ...evidence, provider: primary, url: 'https://signed.example/path?token=SECRET',
  userId: 'private-user', headers: { cookie: 'cookie-value' } };
const results = await Promise.all([auditor.audit(secretEvidence), auditor.audit(secretEvidence)]);
assert.equal(results[0].eligible, true);
assert.equal(sent.length, 2);
assert.equal(sent[0].headers['x-goog-api-key'], primary);
assert.equal(sent[1].headers['x-goog-api-key'], backup);
assert.equal(JSON.stringify(saved).includes(primary), false);
assert.equal(JSON.stringify(results).includes(backup), false);
results[0].reasons.push('tamper');
assert.equal((await auditor.audit(secretEvidence)).reasons.includes('tamper'), false);
assert.equal(sent.length, 2);
const mismatch = await auditor.audit({ ...evidence, observed: { ...evidence.observed, episode: 4 } });
assert.equal(mismatch.decision, 'mismatch'); assert.equal(mismatch.eligible, false);
assert.equal(sent.length, 2);
const missing = await auditor.audit({ ...evidence, observed: { title: 'Example' } });
assert.equal(missing.eligible, false); assert.equal(sent.length, 2);
const badProbe = await auditor.audit({ ...evidence, technical: { playable: false, container: 'hls', statusCode: 403 } });
assert.equal(badProbe.eligible, false); assert.equal(sent.length, 2);
for (const bad of [ { decision: 'matched', confidence: '1', reasons: ['yes'] },
  { decision: 'matched', confidence: 1, reasons: ['yes'], extra: 'no' },
  { decision: 'matched', confidence: 2, reasons: ['yes'] },
  { decision: 'matched', confidence: 1, reasons: [] } ]) {
  const test = createMediaAuditor({ apiKey: primary, backupApiKey: '', fetchImpl: async () => answer(bad) });
  assert.equal((await test.audit(evidence)).eligible, false);
}
const leaked = createMediaAuditor({ apiKey: primary, backupApiKey: '', fetchImpl: async () =>
  answer({ decision: 'suspicious', confidence: .9, reasons: [`secret ${primary} https://signed.example/path?token=secret`] }) });
assert.equal(JSON.stringify(await leaked.audit(evidence)).includes(primary), false);
const lowConfidence = createMediaAuditor({ apiKey: primary, backupApiKey: '', fetchImpl: async () =>
  answer({ decision: 'matched', confidence: .5, reasons: ['Weak evidence.'] }) });
assert.equal((await lowConfidence.audit(evidence)).eligible, false);
let time = 1000;
const quota = createMediaAuditor({ apiKey: primary, backupApiKey: backup, now: () => time, maxDailyRequests: 1,
  fetchImpl: async () => new Response('', { status: 401 }) });
assert.deepEqual((await quota.audit(evidence)).reasons, ['DAILY_BUDGET_EXHAUSTED']);
assert.equal(quota.status().dailyRequests, 1);
time += 86400000;
assert.equal(quota.status().dailyRequests, 0);
const timeout = createMediaAuditor({ apiKey: primary, backupApiKey: '', timeoutMs: 50,
  fetchImpl: async () => new Promise(() => {}) });
assert.deepEqual((await timeout.audit(evidence)).reasons, ['GEMINI_TIMEOUT']);
let release;
const busy = createMediaAuditor({ apiKey: primary, backupApiKey: '', maxConcurrent: 1,
  fetchImpl: async () => new Promise(resolve => { release = () => resolve(answer()); }) });
const first = busy.audit(evidence);
assert.deepEqual((await busy.audit({ ...evidence, provider: 'other' })).reasons, ['AUDIT_BUSY']);
release(); await first;
const noPersistence = createMediaAuditor({ apiKey: primary, backupApiKey: '', fetchImpl: async () => answer(),
  persist: async () => { throw Error('private connection string'); } });
const persistenceResult = await noPersistence.audit(evidence);
assert.equal(persistenceResult.persistenceFailed, true);
assert.equal(JSON.stringify(persistenceResult).includes('private connection'), false);
assert.throws(() => createMediaAuditor({ model: '../untrusted' }), /INVALID_GEMINI_MODEL/);
console.log('media_audit_test: passed (privacy, probe gate, identity conflict, fallback, quota, timeout, concurrency, schema, cache, persistence)');
