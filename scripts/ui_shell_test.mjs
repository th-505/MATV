import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { UI_CONTRACT, resolveNavigationTab } from '../web/core/ui-contract.js';

assert.deepEqual(UI_CONTRACT.navigation.map(item => item.id), ['home','movies','series','anime','turkish','search','live','favorites','settings']);
assert.equal(resolveNavigationTab('explore'), 'search');
const root = resolve(new URL('..', import.meta.url).pathname);
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + '/')) { res.statusCode = 403; return res.end(); }
    const content = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  await mkdir(resolve(root, 'scratch/ui-shell'), { recursive: true });
  for (const width of [390, 1365, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1080 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      // No live TMDB/provider/Render requests: all network destinations use bounded fixtures.
      if (/\/explore\/sources/.test(url)) return route.fulfill({ json: { status: 'success', data: [{ id:'akwam', search: true }, { id:'mycima', search:true }] } });
      if (/\/explore\?/.test(url)) return route.fulfill({ json: { status:'success', items:[{ id:'akwam:fixture', ref:'akwam:fixture', source:'akwam', title:'عمل تجريبي', year:2024 }] } });
      if (route.request().resourceType() === 'image') return route.abort();
      if (['script', 'stylesheet', 'font'].includes(route.request().resourceType())) return route.fulfill({ status: 200, contentType: route.request().resourceType() === 'script' ? 'text/javascript' : 'text/css', body: '' });
      return route.fulfill({ json: { status:'success', version:'fixture', kind:'search', configured:true, data:[], items:[], results:[] } });
    });
    await page.goto(base + '/#search');
    await page.waitForSelector('#primaryNavigation .nav-btn[data-tab="search"]', { state: 'attached' });
    await page.waitForFunction(() => document.getElementById('tab-search').classList.contains('active'));
    assert.equal(await page.title(), UI_CONTRACT.name);
    assert.equal(await page.locator('header.app-header, nav.mobile-nav').count(), 0);
    assert.deepEqual(await page.locator('#primaryNavigation [data-tab]').evaluateAll(elements => elements.map(el => el.dataset.tab)), UI_CONTRACT.navigation.map(item => item.id));
    const mobile = width < UI_CONTRACT.desktopBreakpoint;
    if (mobile) {
      assert.equal(await page.locator('#menuToggle').isVisible(), true);
      await page.locator('#menuToggle').click();
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('main').evaluate(el => el.inert), true);
      await page.locator('#primaryNavigation [data-tab="settings"]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'brandBtn', 'drawer focus remains trapped');
      await page.screenshot({ path: resolve(root, `scratch/ui-shell/drawer-${width}.png`) });
      const box = await page.locator('#appSidebar').boundingBox();
      assert.ok(Math.abs(box.x + box.width - width) < 2, 'mobile drawer sits on the right');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#menuToggle').evaluate(el => el === document.activeElement), true);
      await page.locator('#menuToggle').click();
      await page.locator('#primaryNavigation [data-tab="search"]').click();
      assert.equal(await page.locator('main').evaluate(el => el.inert), false);
    } else {
      assert.equal(await page.locator('#menuToggle').isVisible(), false);
      const box = await page.locator('#appSidebar').boundingBox();
      assert.ok(Math.abs(box.x + box.width - width) < 2, 'desktop/TV sidebar sits on the right');
      const content = await page.locator('main').boundingBox();
      assert.ok(content.x + content.width <= box.x + 1, 'content leaves room for sidebar');
      const home = page.locator('#primaryNavigation [data-tab="home"]');
      await home.focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'movies');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.hash === '#movies' && document.getElementById('tab-movies').classList.contains('active'));
      await page.locator('#primaryNavigation [data-tab="search"]').click();
    }
    await page.locator('#globalSearch').fill('عمل تجريبي');
    await page.locator('#searchTriggerBtn').click();
    await page.waitForFunction(() => location.hash === '#search');
    assert.equal(await page.locator('#tab-search').isVisible(), true);
    assert.equal(await page.locator('#tab-movies').isVisible(), false);
    await page.locator('#advancedSearch summary').click();
    assert.equal(await page.locator('#exploreQuery').isVisible(), true);
    await page.locator('#exploreQuery').fill('عمل تجريبي');
    await page.locator('#exploreProvider').selectOption('akwam');
    await page.locator('#exploreRun').click();
    await page.waitForSelector('#exploreGrid .media-card');
    assert.equal(await page.locator('#exploreGrid .card-title').textContent(), 'عمل تجريبي');
    await page.evaluate(() => { document.getElementById('advancedSearch').open = false; location.hash = '#explore'; });
    await page.waitForFunction(() => document.getElementById('tab-search').classList.contains('active') && document.getElementById('advancedSearch').open);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `no horizontal overflow at ${width}`);
    assert.equal((await page.locator('body').innerText()).includes('MA-NEXUS'), false);
    await page.screenshot({ path: resolve(root, `scratch/ui-shell/search-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], `no uncaught page errors at ${width}`);
    await context.close();
    console.log(`UI shell fixture passed at ${width}px: right navigation, search, advanced exploration, keyboard, and route alias.`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
