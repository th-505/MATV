import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname, relative} from 'node:path';
import * as najd from '../server/scrapers/registry.mjs';
import * as beta from '../server/browser/registry.mjs';
import {createProviderBrowser} from '../server/scrapers/provider-browser.mjs';
import {createServiceChecks} from '../server/diagnostics/service-checks.mjs';
import {installProviderConfigs, registerProviderOrigins, rewriteProviderRequest} from '../server/scrapers/shared/provider-config.mjs';
import {installBrowserConfigs, runInBrowserLane} from '../server/browser/traffic.mjs';
import {workReference as betaReference} from '../server/browser/references.mjs';
import {workReference as najdReference} from '../server/harvest/work-reference.mjs';
import {scanEpisodeIndex as najdIndex} from '../server/harvest/episode-index.mjs';
import {scanEpisodeIndex as betaIndex} from '../server/browser/episode-index.mjs';

test('50 scraper implementations: 25 Najd and 25 beta with different parser functions and metadata objects', () => {
  assert.equal(najd.PROVIDERS_MAP.size, 25);
  assert.equal(beta.PROVIDERS_MAP.size, 25);
  assert.equal(najd.PROVIDERS_MAP.size + beta.PROVIDERS_MAP.size, 50);
  assert.notEqual(najdIndex, betaIndex, 'source-index parsing must also remain family-owned');
  assert.deepEqual([...najd.PROVIDERS_MAP.keys()], [...beta.PROVIDERS_MAP.keys()]);
  for (const [id, original] of najd.PROVIDERS_MAP) {
    const independent = beta.PROVIDERS_MAP.get(id);
    assert.notEqual(original.module, independent.module, id);
    assert.notEqual(original.meta, independent.meta, id);
    for (const name of ['scrapeCatalog','scrapeSearch','scrapeDetails','scrapeEpisodes','scrapeServers','resolveStream']) {
      assert.equal(typeof independent.module[name], 'function', `${id}:${name}`);
      assert.notEqual(original.module[name], independent.module[name], `${id}:${name} must not re-export Najd code`);
    }
    for (const [name, value] of Object.entries(original.module)) {
      if (typeof value === 'function' && /^(parse|extract|decode)/.test(name) && typeof independent.module[name] === 'function')
        assert.notEqual(value, independent.module[name], `${id}:${name} must own its parser dependency`);
    }
  }
});

test('beta implementation imports cannot point back to Najd site parsers or provider-specific dependencies', () => {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const base = resolve(root, 'server/browser/providers');
  const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"\n]+)['"]/g;
  const walk = path => readdirSync(path, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(resolve(path,e.name)) : [resolve(path,e.name)]);
  let siteCount = 0;
  for (const path of walk(base).filter(p => p.endsWith('.mjs'))) {
    const source = readFileSync(path,'utf8');
    if (source.includes('export const PROVIDER_META')) siteCount++;
    for (const match of source.matchAll(imports)) {
      const target = relative(root, resolve(dirname(path),match[1]));
      assert(!target.startsWith('server/scrapers/sites/') && !target.startsWith('server/providers/') && target !== 'edge/src/laroza.mjs',
        `${relative(root,path)} imports Najd-specific code: ${target}`);
    }
  }
  assert.equal(siteCount, 25);
});

test('disabling or changing one family does not disable, redirect or swap the other family', async () => {
  installProviderConfigs([{provider:'fivetv',enabled:false,config:{primary_domain:'https://najd.example'}}]);
  installBrowserConfigs([{provider:'fivetv',enabled:true,config:{primary_domain:'https://beta.example'}}]);
  try {
    assert.equal(najd.getProvider('fivetv').meta.enabled, false);
    assert.equal(beta.getProvider('fivetv').meta.enabled, true);
    assert(createProviderBrowser().sources().some(s => s.id === 'fivetv'));
    await runInBrowserLane(async () => {
      await Promise.resolve();
      assert.equal(najd.getProvider('fivetv').meta.domains[0], 'https://najd.example');
      assert.equal(najd.getProvider('fivetv').meta.enabled, false);
      assert.equal(beta.getProvider('fivetv').meta.domains[0], 'https://beta.example');
    });
    installProviderConfigs([{provider:'fivetv',enabled:true,config:{}}]);
    installBrowserConfigs([{provider:'fivetv',enabled:false,config:{}}]);
    assert.equal(najd.getProvider('fivetv').meta.enabled, true);
    assert.equal(beta.getProvider('fivetv').meta.enabled, false);
    assert(!createProviderBrowser().sources().some(s => s.id === 'fivetv'));
  } finally { installProviderConfigs([]); installBrowserConfigs([]); }
});

test('family-specific default origins cannot overwrite one another in shared guarded HTTP configuration', () => {
  const id='origin_isolation';
  registerProviderOrigins(id, ['https://najd-original.example'], 'najd');
  registerProviderOrigins(id, ['https://beta-original.example'], 'beta');
  installProviderConfigs([{provider:id,config:{primary_domain:'https://najd-current.example'}}]);
  installBrowserConfigs([{provider:id,config:{primary_domain:'https://beta-current.example'}}]);
  try {
    assert.equal(rewriteProviderRequest('https://najd-original.example/search/',{providerId:id}).url,'https://najd-current.example/search/');
    runInBrowserLane(() => {
      assert.equal(rewriteProviderRequest('https://beta-original.example/search/',{providerId:id}).url,'https://beta-current.example/search/');
      assert.equal(rewriteProviderRequest('https://najd-original.example/search/',{providerId:id}).url,'https://najd-original.example/search/');
    });
    assert.equal(rewriteProviderRequest('https://beta-original.example/search/',{providerId:id}).url,'https://beta-original.example/search/');
  } finally { installProviderConfigs([]); installBrowserConfigs([]); }
});

test('diagnostics dispatch to the selected registry and installed source references remain compatible', async () => {
  const calls=[];
  const provider={id:'fivetv',name:'5TV',domains:['https://fixture.example'],capabilities:{catalog:true}};
  const entry = family => ({meta:provider,module:{
    scrapeCatalog:async()=>{calls.push(family);return [{ref:'fivetv:fixture',title:'Fixture'}]},
    scrapeDetails:async()=>({title:'Fixture',type:'movie',media_sources:[{url:'https://cdn.example/fixture.mp4'}]})
  }});
  const checks=createServiceChecks({providers:()=>[provider],lookup:()=>entry('najd'),betaProviders:()=>[provider],betaLookup:()=>entry('beta'),probe:async()=>({playable:true,container_verified:true})});
  for (const family of ['beta','najd']) {
    const job=checks.start(family);
    while(checks.status(job.id).state!=='ready')await new Promise(resolve=>setImmediate(resolve));
    assert.equal(checks.status(job.id).checks[0].state,'passed');
    assert.equal(checks.status(job.id).checks[0].id,family+':fivetv');
  }
  assert.deepEqual(calls,['beta','najd']);
  const ref='fivetv:'+Buffer.from('https://new61.5tv.lol/series/fixture/').toString('base64url');
  assert.equal(betaReference(ref), najdReference(ref));
});
