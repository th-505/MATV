import assert from "node:assert/strict";
import {
  createAlooyProvider,
  encodeAlooyRef,
  decodeAlooyRef,
  alooyMedia,
  parseAlooyDetails,
  ALOOY_ORIGIN,
} from "../server/providers/alooy.mjs";
import { createAlooyWebBridge } from "../server/alooy-stream-bridge.mjs";
import { createServer } from "../server/app.mjs";
const listing =
  '<div class="latest-movie-img-container"><a href="/watch/test.html"><img data-src="/poster.jpg" alt="Test"></a></div>';
const html =
  '<h1>Test</h1><video poster="/poster.jpg"><source src="https://vid8.ujeklsj.site/test/01.mp4"></video><a href="/watch/test.html?key=abc123">Ep#1</a>';
const calls = [];
const provider = createAlooyProvider({
  fetchImpl: async (url) => {
    calls.push(url);
    return new Response(url.includes("watch") ? html : listing);
  },
});
const a = await provider.category(),
  b = await provider.category("alooy-series", 2);
assert.equal(a.data.length, 1);
assert(calls[1].endsWith("/tvseries/home/24.html"));
await provider.category();
assert.equal(calls.length, 2);
const details = await provider.details(a.data[0].ref);
assert(!details.media_path);
const e = await provider.details(details.episodes[0].ref);
assert.equal(e.playback_mode, "local_proxy");
assert.equal(e.headers.Referer, ALOOY_ORIGIN + "/watch/test.html?key=abc123");
assert.equal(e.headers.Origin, ALOOY_ORIGIN);
assert.equal(e.media_sources.length, 1);
assert.equal(
  (await provider.metadata(details.episodes[0].ref)).media_path,
  undefined,
);
assert.throws(() => encodeAlooyRef("https://evil.test/watch/test.html"));
assert.throws(() => decodeAlooyRef("alooy:evil"));
for (const url of [
  "https://ujeklsj.site.evil.test/test.mp4",
  "http://vid8.ujeklsj.site/test.mp4",
  "https://127.0.0.1/test.mp4",
  "https://vid8.ujeklsj.site:999/test.mp4",
])
  assert.throws(() => alooyMedia(url));
assert.equal(
  parseAlooyDetails(
    '<script>file="https://vid8.ujeklsj.site/test.webm";</script>',
    new URL(e.headers.Referer),
  ).media_type,
  "webm",
);
const server = createServer({ alooyRuntime: provider });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await (await fetch(base + "/api/v1/category?ref=alooy-series")).json())
      .data[0].source,
    "alooy",
  );
  const json = await (
    await fetch(
      base +
        "/api/cinema/details?ref=" +
        encodeURIComponent(details.episodes[0].ref) +
        "&platform=web",
    )
  ).json();
  assert.equal(json.playback_unavailable, true);
  assert.equal(json.playback_reason, "DIRECT_WEB_CORS_UNAVAILABLE");
  assert.equal(json.media_path, undefined);
  assert.deepEqual(json.media_sources, []);
  const native=await (await fetch(base+"/api/cinema/details?ref="+encodeURIComponent(details.episodes[0].ref))).json();
  assert.equal(native.media_path,e.media_path);assert.equal(native.playback_mode,"local_proxy");
  assert.equal(native.headers.Referer,e.headers.Referer);
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
let requests=0,status,body;
const bridge=createAlooyWebBridge({requestImpl:()=>{requests++;throw Error('must not call');}});
assert.throws(()=>bridge.register(e.media_sources[0]),/PROXY_RETIRED/);
await bridge.proxy({method:'GET',headers:{range:'bytes=10-13'}},{set statusCode(v){status=v;},setHeader(){},end(v){body=v;}},'legacy');
assert.equal(status,410);assert.equal(JSON.parse(body).media_proxy,false);assert.equal(requests,0);
console.log('Alooy parser, pagination, native direct metadata and retired web bridge: passed');
