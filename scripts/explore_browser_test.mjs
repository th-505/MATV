import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve('.');
const server = http.createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const text = await readFile(path);
    res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : extname(path) === '.html' ? 'text/html' : 'application/json');
    res.end(text);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
const calls = [];
try {
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  for (const file of ['index.html', 'matv-cinema.html']) {
    const page = await browser.newPage({serviceWorkers:'block'});
    const errors = [];
    let providerLoads = 0;
    let completedSlow = 0;
    let aborted = 0;
    page.on('requestfailed', request => { if (request.url().includes('q=slow')) ++aborted; });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      navigator.serviceWorker.register = async () => { throw new Error('Disabled in fixture test'); };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (url, init) => {
        // Exercise generation guards even when a transport ignores cancellation.
        if (window.ignoreExploreAbort && String(url).includes('/api/v1/search?')) {
          const {signal, ...rest} = init || {};
          return nativeFetch(url, rest);
        }
        return nativeFetch(url, init);
      };
    });
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/v1/search/providers') {
        ++providerLoads;
        if (providerLoads === 1) return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{status:'error'}});
        await new Promise(resolve => setTimeout(resolve, 150));
        return route.fulfill({headers:{'access-control-allow-origin':'*'},json: {status:'success',data:[{id:'akwam',displayName:'ذكوام',aliases:['akoam'],domains:[],supportsSearch:true},{id:'new-source',displayName:'thewSource',aliases:[],domains:[],supportsSearch:false}]}});
      }
      if (u.pathname === '/api/v1/search') {
        const q = u.searchParams.get('q'); calls.push([file, u.searchParams.get('provider'), q]);
        if (q.startsWith('slow')) {
          const delay = q === 'slow-source' && u.searchParams.get('provider') === 'new-source' ? 80 : 450;
          await new Promise(r => setTimeout(r, delay)); ++completedSlow;
        }
        const status = ['unsupported', 'error', 'no_results'].includes(q) ? q : 'success';
        return route.fulfill({headers:{'access-control-allow-origin':'*'},status:status === 'unsupported'?422:status === 'error'?503:200,json:{status,version:'test',kind:'search',data: status === 'success'?[{id:'akoam:fixture',ref:'akoam:fixture',title:'Result '+q+(q==='slow-source'?' '+u.searchParams.get('provider'):''),source:'akwam',providerId:'akwam',poster:''}]:[]}});
      }
      if (u.pathname === '/api/v1/category') return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'success',version:'test',kind:'category',data:[{id:'akoam:category',ref:'akoam:category',title:'Category fixture',type:'movie',source:'akwam'}]}});
      if (u.pathname === '/api/cinema/details') return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'success',movie_title:'Result success',providerId:'akwam',episodes:[{num:1,link:'akoam:fixture:episode-1',watch_available:true}]}});
      if (u.origin === `http://127.0.0.1:${server.address().port}` && !u.pathname.startsWith('/api/')) return route.continue();
      if (route.request().resourceType() === 'script') return route.fulfill({contentType:'text/javascript',body:''});
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'success',version:'test',kind:'category',data:[],results:[],shelves:[]}});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
    const main = file === 'index.html';
    if (main) {
      for (const size of [{width:320,height:640},{width:844,height:390},{width:1920,height:1080}]) {
        await page.setViewportSize(size);
        const bounds = await page.evaluate(() => {
          const stage = document.querySelector('#playerContainer').cloneNode(true);
          Object.assign(stage.style, {position:'fixed',top:'0',left:'0',width:'100vw'});
          document.body.append(stage);
          const rect = stage.getBoundingClientRect();
          const video = stage.querySelector('video');
          const result = {width:rect.width,height:rect.height,direction:getComputedStyle(video).direction};
          stage.remove();
          return result;
        });
        assert.equal(bounds.width,size.width);
        assert.ok(bounds.height <= size.height*.76 + 1);
        assert.ok(bounds.height > 0);
        assert.equal(bounds.direction,'ltr');
      }
    }

    const select = page.locator(main?'#searchProvider':'#sourceSelect');
    const input = page.locator(main?'#globalSearch':'#q');
    const grid = page.locator(main?'#moviesGrid':'#mediaGrid');
    const retry = page.getByRole('button', {name:'إعادة محاولة تحميل المصادر'});
    await retry.waitFor();
    // General search must remain usable before the metadata retry succeeds.
    await input.fill('general-before-retry'); await input.press('Enter');
    await page.waitForFunction(id => document.querySelector(id)?.textContent.includes('Result general-before-retry'), main?'#moviesGrid':'#mediaGrid');
    assert.equal(providerLoads, 1);
    await retry.evaluate(button => { button.click(); button.click(); });
    assert.match(await page.locator(main?'#searchProviderState':'#sourcesState').textContent(), /جارٍ تحميل/);
    await select.locator('option[value="new-source"]').waitFor({state:'attached'});
    assert.equal(providerLoads, 2);
    assert.equal(await select.locator('option').count(), 3);
    assert.equal(await page.locator(main?'#searchProviderState':'#sourcesState').textContent(), '');
    assert.equal(await select.locator('option[value="akwam"]').textContent(),'ذكوام');
    assert.equal(await page.locator(main?'#searchTriggerBtn':'#searchBtn').getAttribute('aria-label'),'استكشاف');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await select.isVisible());
    await select.selectOption('akwam');
    for (const [q, message] of [['success','Result success'],['no_results','لا توجد نتائج'],['unsupported','البحث غير مدعوم'],['error','المصدر غير متاح']]) {
      await input.fill(q); await input.press('Enter');
      await page.waitForFunction(({id, text})=>document.querySelector(id)?.textContent.includes(text),{id:main?'#moviesGrid':'#mediaGrid',text:message});
      if(q!=='success') assert.equal(await grid.locator(main?'.media-card':'.item').count(),0);
      else assert.match(await grid.textContent(),/ذكوام/);
    }
    await select.selectOption('new-source');
    await input.fill('unsupported'); await input.press('Enter');
    await page.waitForFunction(id => document.querySelector(id)?.textContent.includes('البحث غير مدعوم'), main?'#moviesGrid':'#mediaGrid');
    assert.ok(calls.some(([f,p,q]) => f === file && p === 'new-source' && q === 'unsupported'));
    await select.selectOption('akwam');
    await input.fill('slow'); await input.press('Enter');
    assert.match(await grid.textContent(), /جارٍ البحث/);
    await input.fill('success'); await input.press('Enter');
    await page.waitForTimeout(450);
    assert.ok(!(await grid.textContent()).includes('Result slow'));
    await grid.locator(main?'.media-card':'.item').first().click();
    await page.locator(main?'#detailSource':'#kind').filter({hasText:'ذكوام'}).waitFor();
    if (!main) await page.locator('#episodes .ep').first().waitFor();
    await select.selectOption('');
    await input.fill('general'); await input.press('Enter');
    await page.waitForTimeout(200);
    assert.ok(calls.some(([f,p,q])=>f===file&&p===null&&q==='general'));

    const gridId = main?'#moviesGrid':'#mediaGrid';
    const beginSlow = async name => {
      await input.fill(name);
      const arrived = page.waitForRequest(request => new URL(request.url()).searchParams.get('q') === name);
      await input.press('Enter'); await arrived;
      assert.match(await grid.textContent(), /جارٍ البحث/);
    };
    // Actual cancellation is attempted, and editing immediately releases waiting state.
    await beginSlow('slow-abort');
    await input.fill('edited without submit');
    // Chrome can emit a delayed native search event for an earlier Enter.
    await input.evaluate(element => element.dispatchEvent(new Event('search')));
    assert.match(await grid.textContent(), /اضغط للاستكشاف/);
    await page.waitForTimeout(600);
    assert.ok(aborted > 0, 'transport was aborted');
    assert.ok(!calls.some(([f, , q]) => f === file && q === 'edited without submit'));
    assert.match(await grid.textContent(), /اضغط للاستكشاف/);
    // Repeat with cancellation deliberately ignored, so late response guards are proven.
    await page.evaluate(() => { window.ignoreExploreAbort = true; });
    for (const replacement of ['edited-again', '']) {
      const before = completedSlow;
      await beginSlow('slow-edit-' + (replacement || 'clear'));
      await input.fill(replacement);
      assert.match(await grid.textContent(), replacement ? /اضغط للاستكشاف/ : /اكتب اسم/);
      await page.waitForTimeout(600);
      assert.ok(completedSlow > before);
      assert.ok(!(await grid.textContent()).includes('Result slow'));
      assert.ok(!(await grid.textContent()).includes('جارٍ البحث'));
    }
    await select.selectOption('akwam');
    await beginSlow('slow-source');
    await select.selectOption('new-source');
    await page.waitForTimeout(600);
    assert.match(await grid.textContent(), /Result slow-source new-source/);
    assert.ok(!(await grid.textContent()).includes('Result slow-source akwam'));
    // The current source response wins; the old source must not win later.
    assert.equal(await select.inputValue(), 'new-source');
    await input.fill('success'); await input.press('Enter');
    await page.waitForFunction(id => document.querySelector(id)?.textContent.includes('Result success'), gridId);
    await grid.locator(main?'.media-card':'.item').first().evaluate(card => { window.savedExploreCard = card; });
    for (const destination of ['home', 'category', 'details']) {
      await beginSlow('slow-leave-' + destination);
      const before = completedSlow;
      if (destination === 'home') {
        if (main) await page.evaluate(() => window.switchTab('home'));
        else await page.locator('#homeBtn').click();
      } else if (destination === 'category') {
        if (main) {
          // Initialize category controls using the ordinary tab route.
          await page.evaluate(() => window.switchTab('series'));
          await page.locator('#seriesFilters .filter-chip').first().click();
        } else {
          await page.locator('#homeBtn').click();
          await page.locator('#movieCats .cat').first().click();
        }
      } else {
        await page.evaluate(() => window.savedExploreCard.click());
      }
      const active = page.locator(main?'.tab-view.active':'.view.active');
      await page.waitForTimeout(200);
      const activeId = await active.getAttribute('id');
      if (destination === 'home') assert.equal(activeId, main?'tab-home':'homeView');
      if (destination === 'category') {
        assert.equal(activeId, main?'tab-series':'gridView');
        assert.match(await active.textContent(), /Category fixture/);
      }
      if (destination === 'details') assert.equal(activeId, main?'pageTitleDetail':'detailsView');
      const content = await active.textContent();
      await page.waitForTimeout(500);
      assert.ok(completedSlow > before, 'old response arrived after navigation');
      assert.equal(await active.getAttribute('id'), activeId);
      assert.equal(await active.textContent(), content);
      assert.ok(!(await active.textContent()).includes('Result slow-leave'));
      assert.ok(!(await grid.textContent()).includes('Result slow-leave'));
    }
    assert.deepEqual(errors,[],file+' page errors');
    await page.close();
  }
  console.log('Both web UIs: explore labels, automatic new source, general/custom search, states, stale request protection, source details and episode rendering passed');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
