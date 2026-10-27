import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { metadataYear, metadataRating, selectTmdbMatch, deduplicateAndMergeCatalog, safeImageUrl } from '../web/core/ma-nexus.js';

assert.equal(metadataYear(null), null);
assert.equal(metadataYear('2024-10-12'), '2024');
assert.equal(metadataYear('<svg onload=1>'), null);
for (const rating of [null, undefined, '', -1, 11, 'bad']) assert.equal(metadataRating(rating), null);
assert.equal(metadataRating(0), '0.0');
assert.equal(metadataRating(8.26), '8.3');
const missing = deduplicateAndMergeCatalog([{ title: 'Untitled fixture', id: 'fixture:1' }])[0];
assert.equal(missing.year, null);
assert.equal(missing.rating, null);
const candidates = [
  { id: 1, title: 'Different film', release_date: '2024-01-01', media_type: 'movie' },
  { id: 2, title: 'العمل الصحيح', original_title: 'Right Film', release_date: '2023-01-01', media_type: 'movie' },
  { id: 3, title: 'العمل الصحيح', original_title: 'Right Film', release_date: '2024-01-01', media_type: 'movie' },
  { id: 4, name: 'Right Film', first_air_date: '2024-01-01', media_type: 'tv' },
];
assert.equal(selectTmdbMatch(candidates, { title: 'فيلم Right Film مترجم', year: '2024' }, 'movie').id, 3);
assert.equal(selectTmdbMatch(candidates, { title: 'Right Film', year: '2024' }, 'tv').id, 4);
assert.equal(selectTmdbMatch(candidates, { title: 'Right Film', year: '2022' }, 'movie'), null);
assert.equal(selectTmdbMatch(candidates, { title: 'Right Film' }, 'movie'), null, 'ambiguous remakes need a year');
assert.equal(selectTmdbMatch(candidates, { title: 'Unknown', year: '2024' }, 'movie'), null);
assert.equal(safeImageUrl('javascript:alert(1)'), '');

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const cardSource = html.slice(html.indexOf('export function renderMediaCard('), html.indexOf('\nconst createMediaCard = renderMediaCard;')).replace('export function', 'function');
assert.match(html, /selectTmdbMatch\(sRes\?\.results/);
assert.doesNotMatch(html, /sRes\.results\[0\]/);
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html><body><main id="fixture"></main></body></html>'); }
    if (!path.startsWith('/web/core/') && path !== '/shared/content-identity.js') { res.statusCode = 404; return res.end(); }
    const content = await readFile(resolve(root, '.' + path));
    res.setHeader('Content-Type', 'text/javascript'); res.end(content);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let externalRequests = 0;
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(base)) return route.continue();
    externalRequests++;
    return route.abort();
  });
  await page.goto(base);
  const state = await page.evaluate(async ({ cardSource }) => {
    const helpers = await import('/web/core/ma-nexus.js');
    const factory = new Function('registerWorkItem', 'isFavorite', 'formatRuntimeArabic', 'metadataYear', 'metadataRating', 'escapeHtml', 'safeImageUrl', 'openTitlePage', cardSource + '; return renderMediaCard;');
    const render = factory(item => item, () => false, helpers.formatRuntimeArabic, helpers.metadataYear, helpers.metadataRating, helpers.escapeHtml, helpers.safeImageUrl, () => {});
    const payload = '\"><img data-injected="yes" src=x onerror="window.fixtureXss=1">';
    const card = render({ id: payload, title: payload, poster: 'javascript:window.fixtureXss=2', typeLabel: payload, durationText: payload });
    // Remove the normal fallback handler to avoid deliberate blocked-image retries.
    card.querySelector('img').removeAttribute('onerror');
    document.getElementById('fixture').appendChild(card);
    return {
      injectedElements: card.querySelectorAll('[data-injected]').length,
      title: card.querySelector('.card-title').textContent,
      titleExpected: payload,
      imageSource: card.querySelector('img').getAttribute('src'),
      score: card.querySelector('.badge-gold-sm').textContent,
      xss: window.fixtureXss || 0,
    };
  }, { cardSource });
  assert.equal(state.injectedElements, 0);
  assert.equal(state.title, state.titleExpected);
  assert.equal(state.imageSource, '');
  assert.equal(state.score, '★ —');
  assert.equal(state.xss, 0);
  assert.equal(externalRequests, 0, 'fixture test must not call live providers or TMDB');
  console.log('Metadata fixture and Chromium card test passed: no invented values, exact identity, ambiguous matches rejected, and source-card XSS escaped. No external requests.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
