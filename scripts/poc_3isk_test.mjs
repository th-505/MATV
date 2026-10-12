import assert from 'node:assert/strict';
import { runPoC, TARGET_PAGE, USER_AGENT, REQUIRED_REFERER } from '../server/test-poc-3isk.mjs';

const embed = 'https://player.example/embed/1/2/3/';
const player = 'https://ukrcdn.club/e/example-token';
const master = 'https://cdn.example/master.m3u8?token=example&expires=123';
const pages = [
  '<html>Episode details</html>',
  `<iframe src="${embed}"></iframe>`,
  `<iframe src="${player}"></iframe>`,
  `const variants = ['https://cdn.example/720.m3u8', '${master}'];`,
];
const requests = [];
const result = await runPoC({
  log() {},
  fetchImpl: async (url, options) => {
    requests.push({ url, headers: options.headers });
    return new Response(pages[requests.length - 1], { headers: requests.length === 1 ? { 'Set-Cookie': 'PHPSESSID=fixture; Path=/; HttpOnly' } : {} });
  },
});
assert.equal(result.masterUrl, master);
assert.equal(result.headers.Referer, REQUIRED_REFERER);
const episodeUrl = TARGET_PAGE.replace(/see\/$/, '');
assert.deepEqual(requests.map(request => request.url), [episodeUrl, TARGET_PAGE, embed, player]);
assert.deepEqual(requests.map(request => request.headers.Referer), [undefined, episodeUrl, 'https://3iskk.xyz', embed]);
assert.equal(requests[1].headers.Cookie, 'PHPSESSID=fixture');
assert.equal(requests[2].headers.Cookie, undefined); // Embed is on another origin in this fixture.
assert.equal(requests[3].headers.Cookie, undefined);
assert(requests.every(request => request.headers['User-Agent'] === USER_AGENT));

// Preserve the source session on a same-origin embed, but not on the player.
let sameOriginIndex = 0;
await runPoC({
  log() {},
  fetchImpl: async (url, options) => {
    if (sameOriginIndex === 2) assert.equal(options.headers.Cookie, 'PHPSESSID=fixture');
    if (sameOriginIndex === 3) assert.equal(options.headers.Cookie, undefined);
    const html = pages[sameOriginIndex].replace('https://player.example/', 'https://3iskk.xyz/');
    return new Response(html, { headers: sameOriginIndex++ === 0 ? { 'Set-Cookie': 'PHPSESSID=fixture; Path=/' } : {} });
  },
});

for (const [stage, message] of [[1, /رابط التضمين/], [2, /سيرفر ukrcdn/], [3, /master.m3u8/]]) {
  let index = 0;
  await assert.rejects(runPoC({
    log() {},
    fetchImpl: async () => new Response(index++ === stage ? '<html>No player</html>' : pages[index - 1]),
  }), message);
}
await assert.rejects(runPoC({
  log() {}, fetchImpl: async () => new Response('Forbidden', { status: 403 }),
}), /HTTP 403/);
const playbackApi = `${player.replace('/e/', '/api/videos/')}/playback?g=fixture`;
const apiPages = [...pages.slice(0, 3), `fetch(${JSON.stringify(playbackApi).replaceAll('/', '\\/')}, {headers: {Accept: 'application/json'}})`, JSON.stringify({ url: master })];
let apiIndex = 0;
const apiResult = await runPoC({
  log() {},
  fetchImpl: async (url, options) => {
    if (apiIndex === 4) {
      assert.equal(url, playbackApi);
      assert.equal(options.headers.Referer, player);
      assert.equal(options.headers.Accept, 'application/json');
      assert.equal(options.headers.Cookie, undefined);
    }
    return new Response(apiPages[apiIndex++]);
  },
});
assert.equal(apiResult.masterUrl, master);
assert.equal(apiIndex, 5);
let unsafeIndex = 0;
await assert.rejects(runPoC({
  log() {},
  fetchImpl: async () => new Response(unsafeIndex++ < 3 ? pages[unsafeIndex - 1] : 'fetch("https://other.example/api/videos/id/playback")'),
}), /API غير متوقع/);
console.log('3isk PoC fixtures passed (not live streaming validation)');
