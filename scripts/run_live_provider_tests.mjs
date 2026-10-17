import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProviders } from '../server/scrapers/registry.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const providerDir = resolve(root, 'scripts/providers');
const timeoutMs = 120_000;
const minimumRequestIntervalMs = Math.max(500, Number(process.env.MATV_LIVE_MIN_INTERVAL_MS) || 1200);
const providers = listProviders();
const suites = readdirSync(providerDir).filter((name) => name.endsWith('.live.test.mjs')).sort();
assert.ok(suites.length > 0, 'no opt-in live provider checks are registered');

function inferClassification(output, status, timedOut) {
  if (timedOut || /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ACCESS_BLOCKED|Cloudflare|HTTP_(403|429|5\d\d)/i.test(output) || status === 2) {
    return 'access_obstacle';
  }
  if (/NO_SERVERS|SERVER_EXTRACTION_FAILED|No catalog items|No video or embed|TypeError:|host .*outside|must match configured/i.test(output)) {
    return 'scraper_or_source_error';
  }
  if (/FIXTURE_ONLY|UNVERIFIED|resource_not_verified_as_media|EMPTY_RESULT/i.test(output)) {
    return 'partial_or_unverified';
  }
  if (/UNSUPPORTED_CAPABILITY|SEARCH_UNSUPPORTED|not supported/i.test(output)) {
    return 'unsupported_or_partial';
  }
  if (status === 0 && /LIVE_VERIFIED/.test(output)) return 'live_check_passed';
  if (status === 0) return 'live_check_inconclusive';
  return 'scraper_or_assertion_error';
}

function inferLastStage(output) {
  const stages = [
    ['search', /search(?:\s|\(|:| probe| capability| results)/ig],
    ['catalog', /catalog(?:\s|\(|:| probe| page| returned)/ig],
    ['details', /details(?:\s|\(|:| probe| loaded)/ig],
    ['episode', /episodes?(?:\s|\(|:| probe| extracted| loaded)/ig],
    ['server_extraction', /servers?(?:\s|\(|:| probe| extraction| extracted)/ig],
    ['stream_resolution', /resolve(?:stream|d)?(?:\s|\(|:| probe)|stream resolved/ig],
    ['manifest', /manifest|master playlist/ig],
    ['segment', /segment|video bytes/ig]
  ];
  let found = { index: -1, stage: 'none' };
  for (const [stage, pattern] of stages) {
    for (const match of output.matchAll(pattern)) {
      if (match.index > found.index) found = { index: match.index, stage };
    }
  }
  return found.stage;
}

function actualHosts(output, fallbackDomains) {
  const hosts = [...output.matchAll(/\[LIVE_HTTP\]\s+\S+\s+\S+\s+([^\s/]+)(?:\s|$)/g)].map((m) => m[1]);
  return [...new Set(hosts)].join(', ') || fallbackDomains.join(', ') || 'unknown';
}

function importedFunctions(testPath) {
  const source = readFileSync(testPath, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+sites\/[^'"]+['"]/g)) {
    for (const name of match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0])) {
      if (/^(scrape|resolve)/.test(name)) names.add(name);
    }
  }
  return [...names].join(', ') || 'reachability probe';
}

async function pauseBetweenSuites() {
  await new Promise((resolve) => setTimeout(resolve, minimumRequestIntervalMs));
}

const records = [];
const suiteProviderIds = new Set();
for (const suite of suites) {
  const providerId = suite.replace(/\.live\.test\.mjs$/, '');
  suiteProviderIds.add(providerId);
  const provider = providers.find((item) => item.id === providerId);
  const testPath = resolve(providerDir, suite);
  console.log(`\n[LIVE PROVIDER CHECK] ${providerId} (${new Date().toISOString()})`);
  await pauseBetweenSuites();
  const result = spawnSync(process.execPath, ['--import', resolve(root, 'scripts/live_fetch_rate_limit.mjs'), testPath], {
    cwd: root,
    env: { ...process.env, MATV_LIVE_MIN_INTERVAL_MS: String(minimumRequestIntervalMs) },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 12 * 1024 * 1024
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  process.stdout.write(output);
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const status = result.status;
  records.push({
    provider: providerId,
    checked_at: new Date().toISOString(),
    configured_domains: (provider?.domains || []).join(', '),
    requested_domains: actualHosts(output, provider?.domains || []),
    functions_tested: importedFunctions(testPath),
    classification: inferClassification(output, status, timedOut),
    exit_code: status,
    last_successful_stage: inferLastStage(output),
    evidence_tail: output.trim().split('\n').slice(-8).join(' ').slice(0, 700)
  });
}

// Three registered sources previously had no explicit live suite. Probe only their
// primary advertised operation; unsupported search is recorded distinctly.
for (const providerId of ['anime4up_rest', 'egydead_live', 'shii4u']) {
  if (suiteProviderIds.has(providerId)) continue;
  const provider = providers.find((item) => item.id === providerId);
  assert.ok(provider, `registered provider missing: ${providerId}`);
  console.log(`\n[LIVE PROVIDER CHECK] ${providerId} reachability probe (${new Date().toISOString()})`);
  await pauseBetweenSuites();
  const inlineProbe = `
    import { getProvider } from './server/scrapers/registry.mjs';
    const entry=getProvider(process.env.MATV_LIVE_PROVIDER_ID);
    const op=entry.meta.capabilities?.search && entry.module.scrapeSearch ? 'search' : 'catalog';
    const result=op==='search' ? await entry.module.scrapeSearch('one piece',1,{timeoutMs:10000}) : await entry.module.scrapeCatalog('all',1,{timeoutMs:10000});
    console.log('[LIVE_STAGE] '+op+' count='+result.length+' error='+(result._meta?.errorCode||''));
    if(result._meta?.errorCode==='UNSUPPORTED_CAPABILITY') process.exitCode=3;
  `;
  const result = spawnSync(process.execPath, ['--import', resolve(root, 'scripts/live_fetch_rate_limit.mjs'), '--input-type=module', '-e', inlineProbe], {
    cwd: root,
    env: { ...process.env, MATV_LIVE_MIN_INTERVAL_MS: String(minimumRequestIntervalMs), MATV_LIVE_PROVIDER_ID: providerId },
    encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  process.stdout.write(output);
  const status = result.status;
  records.push({
    provider: providerId,
    checked_at: new Date().toISOString(),
    configured_domains: (provider.domains || []).join(', '),
    requested_domains: actualHosts(output, provider.domains || []),
    functions_tested: 'scrapeSearch or scrapeCatalog (primary supported operation)',
    classification: inferClassification(output, status, result.error?.code === 'ETIMEDOUT'),
    exit_code: status,
    last_successful_stage: inferLastStage(output),
    evidence_tail: output.trim().split('\n').slice(-8).join(' ').slice(0, 700)
  });
}

const date = new Date().toISOString().slice(0, 10);
const reportDir = resolve(root, 'reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = resolve(reportDir, `live-provider-results-${date}.md`);
const lines = [
  `# Live provider checks — ${date}`,
  '',
  `Request pacing: one serialized fetch per child process, at least ${minimumRequestIntervalMs} ms between requests, and at least the same delay between provider suites. Suite timeout: ${timeoutMs} ms.`,
  '',
  '| Provider | Checked (UTC) | Domain(s) checked | Function(s) | Classification | Last successful stage | Exit |',
  '|---|---|---|---|---|---|---:|'
];
for (const row of records) {
  lines.push(`| ${row.provider} | ${row.checked_at} | ${row.requested_domains} | ${row.functions_tested} | ${row.classification} | ${row.last_successful_stage} | ${row.exit_code ?? 'timeout'} |`);
}
lines.push('', 'A passing scraper check proves the tested HTTP/parser stage only. It does not establish video playback inside the app. `access_obstacle` means DNS/network/WAF/timeout prevented the scraper check; `scraper_or_assertion_error` means an unexpected parser or test assertion failure; unsupported capabilities are reported separately.', '');
writeFileSync(reportPath, lines.join('\n'));

const failed = records.filter((row) => !['live_check_passed', 'unsupported_or_partial'].includes(row.classification));
console.log(`\nLive provider checks: ${records.length - failed.length}/${records.length} non-failing; report: ${reportPath}`);
if (failed.length) process.exitCode = 1;
