import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStream} from '../server/scrapers/sites/cimanow.mjs';

test('CimaNow decodes owned media references before URL validation', async () => {
  const url = 'https://media.example.com/video.m3u8';
  const result = await resolveStream('cimanow:' + Buffer.from(url).toString('base64url'));
  assert.equal(result.url, url);
  assert.equal(result.type, 'm3u8');
  assert.equal(result.verified, false);
});

test('CimaNow owned references cannot hide private addresses or credentials', async () => {
  for (const url of ['https://127.0.0.1/video.mp4', 'https://169.254.169.254/video.mp4', 'https://user:secret@media.example.com/video.mp4']) {
    await assert.rejects(resolveStream('cimanow:' + Buffer.from(url).toString('base64url')));
  }
});

test('CimaNow preserves season four from URL even if anchor only says episode', async () => {
  const {scrapeEpisodes} = await import('../server/scrapers/sites/cimanow.mjs');
  const episodes = await scrapeEpisodes('https://cimanow.me/series/demo', {
    fixtureHtml: '<h1>عمل تجريبي</h1><div class="episodes-grid"><a href="/episode/مسلسل-تجريبي-الموسم-الرابع-الحلقة-21">الحلقة 21</a></div>',
  });
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].season, 4);
  assert.equal(episodes[0].number, 21);
});
