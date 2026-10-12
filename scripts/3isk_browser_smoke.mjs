// Live smoke: start npm start and serve the repository on localhost:8000 first.
// POC_CHROMIUM_PATH may point to a locally installed Chromium executable.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const webBase = process.env.POC_WEB_BASE || 'http://127.0.0.1:8000';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.POC_CHROMIUM_PATH ? { executablePath: process.env.POC_CHROMIUM_PATH } : {}),
  ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  const mediaRequests = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname.endsWith('.ukrcdn.xyz')) mediaRequests.push({ path: url.pathname, status: response.status() });
  });
  await page.goto(`${webBase}/albasri-cinema.html`);
  await page.locator('.cat').filter({ hasText: 'قصة عشق — تركية' }).click();
  const card = page.locator('.item').filter({ hasText: 'مسلسل المنظمة مترجم' });
  await card.waitFor({ timeout: 45_000 });
  await card.first().click();
  const episode = page.locator('button.ep').filter({ hasText: /^الحلقة 187$/ });
  await episode.waitFor({ timeout: 45_000 });
  await episode.click();
  await page.locator('#choiceWatchBtn').waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(await page.locator('#choiceDownloadBtn').isVisible(), false, 'HLS download must not be offered');
  await page.locator('#choiceWatchBtn').click();
  await page.waitForURL('**/Player.html?**');
  const playerUrl = new URL(page.url());
  assert.match(new URL(playerUrl.searchParams.get('url')).hostname, /\.ukrcdn\.xyz$/);
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 3, null, { timeout: 45_000 });
  const playback = await page.evaluate(() => ({ currentTime: document.querySelector('video').currentTime, readyState: document.querySelector('video').readyState }));
  assert(mediaRequests.some(request => request.path.endsWith('master.m3u8') && request.status === 200));
  assert(mediaRequests.some(request => request.path.endsWith('.ts') && [200, 206].includes(request.status)));
  assert(mediaRequests.every(request => request.status < 400));
  console.log(JSON.stringify({ passed: true, browser: browser.version(), playback, mediaRequests }));
} finally { await browser.close(); }
