import test from 'node:test';
import assert from 'node:assert/strict';
import * as fixture from '../scripts/fixtures/providers/fivetv.fixture.mjs';
import * as five from '../server/scrapers/sites/fivetv.mjs';
import {getProvider} from '../server/scrapers/registry.mjs';
import {getProvider as getBetaProvider} from '../server/browser/registry.mjs';
import {createSourceSearch, listSourceCapabilities} from '../server/scrapers/source-registry.mjs';
import {createProviderBrowser} from '../server/scrapers/provider-browser.mjs';
import {installProviderConfigs} from '../server/scrapers/shared/provider-config.mjs';
import {installBrowserConfigs, runInBrowserLane} from '../server/browser/traffic.mjs';
import {scanEpisodeIndex} from '../server/harvest/episode-index.mjs';
import {scanSourceGraph} from '../server/browser/source-graph.mjs';

const base = five.PROVIDER_META.domains[0];
const reference = path => 'fivetv:' + Buffer.from(base + path).toString('base64url');

test('5TV observed home/catalog/search/taxonomy cards produce content references and observed pagination', () => {
  for (const html of [fixture.HOME_HTML, fixture.CATALOG_HTML, fixture.SEARCH_HTML, fixture.TAXONOMY_HTML]) {
    const rows = five.parseFiveTvCatalog(html, base + '/latest-series/');
    assert(rows.length >= 3);
    assert(rows.every(r => r.ref.startsWith('fivetv:') && r.poster && r.title));
    assert.equal(new Set(rows.map(r => r.ref)).size, rows.length);
  }
  const rows = five.parseFiveTvCatalog(fixture.CATALOG_HTML, base + '/latest-series/');
  assert.equal(rows[0].title, 'ثمن الولاء The Price of Loyalty');
  assert.equal(rows[0].year, '2026');
  assert.equal(rows._meta.next_page, 2);
  assert.equal(rows._meta.next_url, base + '/latest-series/page/2/');
  assert.equal(five.parseFiveTvCatalog(fixture.SEARCH_HTML, base + '/search/?q=x')._meta.has_more, false);
});

test('5TV details preserve actual episode identity, series parent, movie identity and source metadata', () => {
  const series = five.parseFiveTvDetails(fixture.SERIES_HTML, base + '/series/sunshine/');
  assert.equal(series.title, 'شمس وسط المطر Sunshine Through the Rain');
  assert.equal(series.type, 'series');
  assert.deepEqual(series.episodes.map(e => e.number), [1, 2, 3]);
  assert(series.overview.includes('علم الأحياء'));
  assert(series.genres.includes('دراما'));
  const ep = five.parseFiveTvDetails(fixture.EPISODE_HTML, base + '/episode/doctor-x-9/');
  assert.equal(ep.episode_number, 9);
  assert.equal(ep.series_title, 'الدكتورة إكس Doctor X: Mafia in White');
  assert(ep.parent_url.includes('/series/'));
  assert.deepEqual(ep.episodes.map(e => e.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const movie = five.parseFiveTvDetails(fixture.MOVIE_HTML, base + '/movie/new-group-2026/');
  assert.equal(movie.type, 'movie');
  assert.equal(movie.title, 'New Group 2026');
  assert.deepEqual(movie.episodes, []);
});

test('5TV actual numbers are not truncated, renumbered, or inferred from IDs and sequel titles', () => {
  const html = '<div class="ftv-season-panel" data-season-panel="٢">' +
    Array.from({length: 81}, (_, i) => `<a class="ftv-series-episode-card" href="/episode/conan-${1200+i}/"><strong>الحلقة ${1200+i}</strong></a>`).join('') +
    '<a class="ftv-series-episode-card" href="/episode/ambiguous-9999/"><strong>Movie 12</strong></a></div>';
  const rows = five.parseFiveTvEpisodes(html, base + '/series/conan/');
  assert.equal(rows.length, 82);
  assert.equal(rows[0].number, 1200);
  assert.equal(rows[80].number, 1280);
  assert(rows.every(e => e.season === 2));
  assert.equal(rows[81].number, null);
  assert.equal(rows[81].watch_available, false);
});

test('5TV uses only observed public watch controls, excludes ads/downloads/VIP, and never verifies embeds', () => {
  const rows = five.parseFiveTvServers(fixture.MOVIE_HTML + `
    <iframe src="https://ads.example/popup"></iframe>
    <a class="ftv-download-server__button" href="https://cdn.example/download.mp4">تحميل</a>
    <button class="ftv-watch-tab" data-server-vip="1" data-server-url="https://71stream.one/embed/private">VIP</button>
    <button class="ftv-watch-tab" data-server-url="https://127.0.0.1/secret">bad</button>
    <button class="ftv-watch-tab" data-server-url="https://unknown.example/ad">bad</button>`, base + '/movie/new-group-2026/');
  assert.equal(rows.length, 6);
  assert(rows.every(r => r.type === 'embed' && r.verified === false && r.code.startsWith('FTV-')));
});

test('5TV episode parent and navigation work in canonical harvesting and beta graph without scripts', () => {
  const url = base + '/episode/doctor-x-9/';
  const details = five.parseFiveTvDetails(fixture.EPISODE_HTML, url);
  const options = {provider: 'fivetv', domains: [new URL(base).hostname], title: details.title, episodes: details.episodes};
  const index = scanEpisodeIndex(fixture.EPISODE_HTML, url, options);
  assert.deepEqual(index.parents, [details.parent_url]);
  assert.equal(index.episodes.length, 9);
  const graph = scanSourceGraph(fixture.EPISODE_HTML, url, {...options, details});
  assert(graph.parents.includes(details.parent_url));
  assert(graph.neighbors.some(u => u.endsWith('-8/')));
});

test('5TV is routed by Najd search and the separate beta implementation with the same source identity', async () => {
  assert(listSourceCapabilities().some(s => s.id === 'fivetv'));
  const entry = getProvider('fivetv');
  const search = createSourceSearch({loadModule: () => ({scrapeSearch: (q, n) => entry.module.scrapeSearch(q, n, {fixtureHtml: fixture.SEARCH_HTML})})});
  const hits = await search('فرانشيسكا', 'fivetv');
  assert(hits.length);
  assert(hits.every(r => r.selected_source === 'fivetv'));
  const betaEntry = getBetaProvider('fivetv');
  assert.notEqual(betaEntry.module.scrapeCatalog, entry.module.scrapeCatalog);
  const browser = createProviderBrowser({providers: () => [betaEntry.meta], lookup: () => ({...betaEntry,
    module: {...betaEntry.module, scrapeCatalog: (cat, n) => betaEntry.module.scrapeCatalog(cat, n, {fixtureHtml: fixture.CATALOG_HTML})}})});
  assert.equal(browser.sources()[0].id, 'fivetv');
  assert(browser.sources()[0].categories.some(c => c.id === 'episodes'));
  const catalog = await browser.catalog('fivetv', 'series', 1);
  assert.equal(catalog.pagination.next_page, 2);
  assert(catalog.items.every(r => r.source === 'fivetv' && r.source_refs.fivetv));
});

test('5TV Najd and beta keep independent domain/search configuration under concurrent requests', async () => {
  installProviderConfigs([{provider:'fivetv',config:{primary_domain:'https://najd.example',search_path:'/find/',search_parameter:'q'}}]);
  installBrowserConfigs([{provider:'fivetv',config:{primary_domain:'https://beta.example',search_path:'/lookup/',search_parameter:'q'}}]);
  try {
    const reader = async lookup => {
      await Promise.resolve();
      const entry = lookup('fivetv');
      const origin = entry.meta.domains[0];
      const html = fixture.SEARCH_HTML.replaceAll(base, origin);
      return entry.module.scrapeSearch('فرانشيسكا', 1, {fixtureHtml: html});
    };
    const [najd, beta] = await Promise.all([runInBrowserLane(() => reader(getProvider)), reader(getBetaProvider)]);
    assert.equal(new URL(najd._meta.url).origin, 'https://najd.example');
    assert.equal(new URL(najd._meta.url).pathname, '/find/');
    assert.equal(new URL(beta._meta.url).origin, 'https://beta.example');
    assert.equal(new URL(beta._meta.url).pathname, '/lookup/');
    assert(najd.every(r => new URL(r.url).origin === 'https://najd.example'));
    assert(beta.every(r => new URL(r.url).origin === 'https://beta.example'));
  } finally { installProviderConfigs([]); installBrowserConfigs([]); }
});

test('5TV blocked responses are availability failures, never empty successful catalogs', async () => {
  const rows = await five.scrapeSearch('test', 1, {fixtureHtml:'<title>Just a moment...</title>',fixtureStatus:403});
  assert.equal(rows._meta.errorCode, 'ACCESS_BLOCKED');
  assert.equal(rows._meta.ok, false);
  await assert.rejects(five.scrapeDetails(reference('/series/test/'), {fixtureHtml:'<title>Just a moment...</title>'}), {code:'ACCESS_BLOCKED'});
  const unknown = await five.scrapeSearch('test', 1, {fixtureHtml:'<main>Maintenance</main>'});
  assert.equal(unknown._meta.errorCode, 'STRUCTURE_CHANGED');
  const empty = await five.scrapeSearch('test', 1, {fixtureHtml:'<main><div class="ftv-search-empty">لا توجد نتائج</div></main>'});
  assert.equal(empty._meta.errorCode, 'EMPTY_RESULT');
  assert.equal(empty._meta.ok, true);
});

test('5TV follows its observed public redirect hop but refuses a landing page as content', async () => {
  const calls = [];
  const dnsLookupImpl = async () => [{address:'93.184.216.34',family:4}];
  const fetchImpl = async url => {
    calls.push(url);
    if (new URL(url).hostname === 'ho26374qa.5ivtv.in') return new Response('', {status:302, headers:{location:'https://ur5ive.vip/public-check'}});
    if (new URL(url).hostname === 'ur5ive.vip') return new Response('', {status:302,headers:{location:'https://new61.5tv.lol/latest-series/'}});
    return new Response(fixture.CATALOG_HTML.replaceAll(base,'https://new61.5tv.lol'), {headers:{'content-type':'text/html'}});
  };
  const result = await five.scrapeCatalog('series', 1, {fetchImpl,dnsLookupImpl,maxRetries:0});
  assert.equal(result.length, 3);
  assert.equal(calls.length, 3);
  const landing = await five.scrapeCatalog('series', 1, {dnsLookupImpl,maxRetries:0,fetchImpl:async url =>
    new URL(url).hostname === 'ur5ive.vip' ? new Response('<main>Landing</main>') :
    new Response('',{status:302,headers:{location:'https://ur5ive.vip/public-check'}})});
  assert.equal(landing._meta.errorCode, 'UNSAFE_URL');
});

test('5TV unsafe references and unrelated hosts fail closed even with fixture injection', async () => {
  for (const value of ['https://127.0.0.1/series/test/', 'https://evil.example/movie/test/', base + '/wp-admin/'])
    await assert.rejects(five.scrapeDetails(value, {fixtureHtml: fixture.MOVIE_HTML}), {code:'UNSAFE_URL'});
  assert.equal((await five.scrapeCatalog('https://127.0.0.1/', 1))._meta.errorCode, 'UNSUPPORTED_CAPABILITY');
  const resolved = await five.resolveStream('https://71stream.one/embed/public-fixture', {
    playerFixtureHtml:'<video><source src="https://media.example/fixture.m3u8"></video>'});
  assert.equal(resolved.url, 'https://media.example/fixture.m3u8');
  assert.equal(resolved.verified, false);
});
