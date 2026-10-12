import assert from 'node:assert/strict';
import { create3iskProvider, encode3iskRef, decode3iskRef, parse3iskCatalog, parse3iskDetails, assert3iskStream, ISK_ORIGIN } from '../server/providers/3isk.mjs';

const episode = `${ISK_ORIGIN}/watch/episodes/serie-demo-season-1-episode-187/`;
const ref = encode3iskRef(episode);
assert.equal(decode3iskRef(ref).href, episode);
for (const value of ['https://evil.example/watch/episodes/demo/', `${ISK_ORIGIN}/admin/`, `${episode}?x=1`]) assert.throws(() => encode3iskRef(value));
for (const value of ['3isk:!!', '3isk:a', `3isk:${Buffer.from('//evil.example/watch/episodes/demo/').toString('base64url')}`]) assert.throws(() => decode3iskRef(value));
assert.throws(() => assert3iskStream('https://ukrcdn.xyz.evil.example/hls/master.m3u8'));
assert.throws(() => assert3iskStream('https://user:secret@s1.ukrcdn.xyz/hls/master.m3u8'));
const catalogHtml = `<a class="type_item" href="${ISK_ORIGIN}/watch/tvshows/demo/"><img data-image="/poster.jpg" src="/placeholder.jpg"><div class="item_title">مسلسل &amp; تجربة</div></a>
<a class="type_item" href="https://evil.example/watch/tvshows/demo/"><div class="item_title">Ignore</div></a>`;
const items = parse3iskCatalog(catalogHtml);
assert.equal(items.length, 1); assert.equal(items[0].title, 'مسلسل & تجربة'); assert.equal(items[0].poster, `${ISK_ORIGIN}/poster.jpg`);
const detailHtml = `<h1>مسلسل تجربة</h1><meta property="og:image" content="/poster.jpg">
<a class="ep-num" data-ep-num="187" href="${episode}" title="الحلقة 187"><b>187</b></a>
<a class="ep-num" data-ep-num="2" href="${ISK_ORIGIN}/watch/episodes/serie-demo-season-1-episode-2/"><b>2</b></a>`;
const details = parse3iskDetails(detailHtml);
assert.deepEqual(details.episodes.map(e => e.num), [2, 187]); assert.equal(details.episodes[1].ref, ref);
const now = 1_790_000_000_000;
const master = `https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=fixture&expires=${(now + 3600_000) / 1000}`;
const requests = [];
const provider = create3iskProvider({ now: () => now, fetchImpl: async (url, options) => {
  requests.push({ url, options });
  if (url === episode) return new Response(detailHtml, { headers: { 'Set-Cookie': 'PHPSESSID=fixture; Path=/' } });
  if (url === `${episode}see/`) {
    assert.equal(options.headers.Cookie, 'PHPSESSID=fixture'); assert.equal(options.headers.Referer, episode);
    return new Response(`<iframe id="iframe_player" src="${ISK_ORIGIN}/embed/1/100/2/"></iframe>`);
  }
  if (url.includes('/embed/')) { assert.equal(options.headers.Cookie, 'PHPSESSID=fixture'); return new Response('<iframe src="https://ukrcdn.club/e/demo"></iframe>'); }
  assert.equal(options.headers.Cookie, undefined);
  if (url.includes('/e/')) return new Response(`fetch(${JSON.stringify('https://ukrcdn.club/api/videos/demo/playback?g=fixture').replaceAll('/', '\\/')}, {})`);
  if (url.includes('/api/videos/')) { assert.equal(options.headers.Referer, 'https://ukrcdn.club/e/demo'); return Response.json({ url: master }); }
  throw new Error('Unexpected test request');
} });
const playback = await provider.resolve(ref);
assert.equal(playback.playback_mode, 'direct'); assert.equal(playback.media_path, master);
assert.equal(playback.download_available, false); assert.deepEqual(playback.playback_headers, {});
assert.equal(Date.parse(playback.expires_at), now + 3600_000); assert.equal(requests.length, 5);
await assert.rejects(provider.category('unknown'), /3ISK_BAD_CATEGORY/);
await assert.rejects(provider.category('3isk-turkish', Infinity), /3ISK_BAD_PAGE/);
const redirectProvider = create3iskProvider({ fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/private' } }) });
await assert.rejects(redirectProvider.category('3isk-turkish'), /3ISK_BAD_SOURCE/);
const httpProvider = create3iskProvider({ fetchImpl: async () => new Response('Forbidden', { status: 403 }) });
await assert.rejects(httpProvider.category('3isk-turkish'), /3ISK_HTTP_403/);
console.log('3isk provider: references, parsers, session, redirects and direct resolver passed');
