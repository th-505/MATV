import { selectPlayerIframe } from '../server/providers/3isk-playback/router.mjs';
import assert from 'node:assert/strict';
import { create3iskProvider, encode3iskRef, decode3iskRef, parse3iskCatalog, parse3iskDetails, assert3iskStream, ISK_ORIGIN, ISK_UA, ISK_CATEGORIES, unpack3iskPlayer } from '../server/providers/3isk.mjs';

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
  if (url.includes('/e/')) { assert.equal(options.headers.Referer, `${ISK_ORIGIN}/`); return new Response(`fetch(${JSON.stringify('https://ukrcdn.club/api/videos/demo/playback?g=fixture').replaceAll('/', '\\/')}, {})`); }
  if (url.includes('/api/videos/')) { assert.equal(options.headers.Referer, 'https://ukrcdn.club/e/demo'); return Response.json({ url: master }); }
  throw new Error('Unexpected test request');
} });
const playback = await provider.resolve(ref);
assert.equal(playback.playback_mode, 'direct'); assert.equal(playback.media_path, master);
assert.equal(playback.download_available, false); assert.equal(playback.playback_headers.Referer, new URL(master).origin + '/'); assert.equal(playback.playback_headers['User-Agent'], ISK_UA);
assert.equal(Date.parse(playback.expires_at), now + 3600_000); assert.equal(requests.length, 5);
await assert.rejects(provider.category('unknown'), /3ISK_BAD_CATEGORY/);
await assert.rejects(provider.category('3isk-turkish', Infinity), /3ISK_BAD_PAGE/);
const redirectProvider = create3iskProvider({ fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/private' } }) });
await assert.rejects(redirectProvider.category('3isk-turkish'), /3ISK_BAD_SOURCE/);
const httpProvider = create3iskProvider({ fetchImpl: async () => new Response('Forbidden', { status: 403 }) });
await assert.rejects(httpProvider.category('3isk-turkish'), /3ISK_HTTP_403/);
// Hosting-network see redirects must resolve the source's public player route
// using episode post metadata, without hardcoding a specific episode's ID.
const fallbackRequests = [];
const fallbackProvider = create3iskProvider({ now: () => now, fetchImpl: async (url, options) => {
  fallbackRequests.push(url);
  if (url === episode || url === `${episode}see/`) return new Response(`<body class="single-episodes postid-987654"><a class="single-watch-btn" href="${episode}see/">Watch</a></body>`);
  if (url === `${ISK_ORIGIN}/embed/1/987654/2/`) return new Response('<iframe src="https://ukrcdn.club/e/demo"></iframe>');
  if (url.includes('/e/')) return new Response(`fetch("https://ukrcdn.club/api/videos/demo/playback?g=fixture")`);
  if (url.includes('/api/videos/')) return Response.json({ url: master });
  throw new Error('Unexpected fallback request');
} });
assert.equal((await fallbackProvider.resolve(ref)).media_url, master);
assert(fallbackRequests.includes(`${ISK_ORIGIN}/embed/1/987654/2/`));
console.log('3isk provider: references, parsers, session, redirects and direct resolver passed');

assert.equal(Object.keys(ISK_CATEGORIES).length, 4);
assert(!Object.values(ISK_CATEGORIES).some(url => url.includes('w-hlqat')));
const movie = `${ISK_ORIGIN}/watch/movies/movie-demo/`;
assert.equal(decode3iskRef(encode3iskRef(movie)).href, movie);
const mixed = catalogHtml + `<a class="type_item" href="${movie}"><div class="item_title">فيلم</div></a><a class="type_item" href="${episode}"><div class="item_title">حلقة</div></a>`;
assert.deepEqual(parse3iskCatalog(mixed).map(item => item.type), ['series', 'movie', 'episode']);
for (const kind of ['series', 'movie', 'episode']) assert.equal(parse3iskCatalog(mixed, kind)[0].type, kind);
const packed = "eval(function(p,a,c,k,e,d){}('0://1.2.3/4/5.6',36,7,'https|s43|grzcdn|com|hls|master|m3u8'.split('|')))";
assert.equal(unpack3iskPlayer(packed), 'https://s43.grzcdn.com/hls/master.m3u8');
assert.throws(() => assert3iskStream('https://s43.grzcdn.com.evil.example/hls/master.m3u8'));
const movieProvider = create3iskProvider({ now: () => now, fetchImpl: async (url, options) => {
  if (url === movie || url === `${movie}see/`) return new Response('<body class="single-movies postid-12345"></body>');
  if (url === `${ISK_ORIGIN}/embed/1/12345/1/`) return new Response('<iframe src="https://miravd.com/embed-fixture.html"></iframe>');
  if (url === 'https://miravd.com/embed-fixture.html') { assert.equal(options.headers.Referer, `${ISK_ORIGIN}/embed/1/12345/1/`); return new Response(packed); }
  throw new Error('unexpected movie request');
} });
const metadata = await movieProvider.resolve(encode3iskRef(movie));
assert.equal(metadata.player_type, 'miravd');
assert.equal(metadata.iframe_url, metadata.resolver_url);
assert.equal(metadata.wrapper_url, `${ISK_ORIGIN}/embed/1/12345/1/`);
const film = await movieProvider.resolve(encode3iskRef(movie), {allowClientResolution:false});
assert.equal(film.media_url, 'https://s43.grzcdn.com/hls/master.m3u8');
assert.equal(film.playback_headers.Referer, 'https://miravd.com/');
assert.equal(Date.parse(film.expires_at), now + 5 * 60_000);
console.log('3isk four-section classification and packed movie resolver passed');

let deniedPlayerRequests = 0;
const deniedMovie = create3iskProvider({ now: () => now, fetchImpl: async (url, options) => {
  if (url === movie || url === `${movie}see/`) return new Response('<body class="single-movies postid-12345"></body>');
  if (url === `${ISK_ORIGIN}/embed/1/12345/1/`) return new Response('<iframe src="https://miravd.com/embed-fixture.html"></iframe>');
  if (url === 'https://miravd.com/embed-fixture.html') { deniedPlayerRequests++; return new Response('Forbidden', {status: 403}); }
  throw new Error('unexpected denied-player request');
} });
const handoff = await deniedMovie.resolve(encode3iskRef(movie));
assert.equal(handoff.playback_mode, 'client_resolve');
assert.equal(deniedPlayerRequests, 0, 'default resolution must not contact miravd from the server');
assert.equal(handoff.resolver_url, 'https://miravd.com/embed-fixture.html');
assert.equal(handoff.media_url, undefined);
console.log('3isk hosting-network denial returns bounded native metadata handoff');

assert.equal(playback.stream_url, playback.media_url);
assert.deepEqual(playback.headers, playback.playback_headers);
assert.equal(playback.extractor, 'ukrcdn');
assert.equal(film.extractor, 'miravd');
assert.equal(handoff.resolver_headers.Referer, `${ISK_ORIGIN}/embed/1/12345/1/`);
await assert.rejects(deniedMovie.resolve(encode3iskRef(movie), {allowClientResolution:false}), /3ISK_HTTP_403/);
const base62 = Array.from({length: 37}, () => '').fill('', 0); base62[36] = 'https://s43.grzcdn.com/hls/master.m3u8';
assert.equal(unpack3iskPlayer(`eval(function(){return p}   ('A', 62, 37, '${base62.join('|')}'.split('|'))) `), base62[36]);
console.log('dual engines: canonical JSON, exact wrapper referer, whitespace/base62 and strict server failure passed');

const wrapper = `${ISK_ORIGIN}/embed/1/12345/1/`;
assert.equal(selectPlayerIframe('<script>const unrelated="https://ukrcdn.club/e/ad"</script><iframe src="https://miravd.com/embed-video.html"></iframe>', wrapper).extractor, 'miravd');
assert.throws(() => selectPlayerIframe('<iframe src="https://ukrcdn.club.evil.example/e/demo"></iframe>', wrapper), /3ISK_PLAYER_NOT_FOUND/);
assert.throws(() => selectPlayerIframe('<iframe src="http://127.0.0.1/private"></iframe>', wrapper), /3ISK_PLAYER_NOT_FOUND/);
assert.throws(() => selectPlayerIframe('<iframe src="https://miravd.com/embed-video.html"></iframe>', 'https://evil.example/embed/1/12345/1/'), /3ISK_BAD_WRAPPER/);
