import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
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
  assert.equal(json.playback_mode, "proxy");
  assert(json.media_path.startsWith("/api/alooy/media?id="));
  assert.deepEqual(json.headers, {});
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
let captured;
const bridge = createAlooyWebBridge({
  requestImpl: (_url, opts, callback) => {
    captured = opts.headers;
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new PassThrough();
        res.statusCode = 206;
        res.headers = {
          "content-range": "bytes 10-13/100",
          "content-length": "4",
          "content-type": "video/mp4",
        };
        callback(res);
        res.end(Buffer.from([1, 2, 3, 4]));
      });
    return req;
  },
});
const source = bridge.register(e.media_sources[0]);
const output = new PassThrough();
output.setHeader = (k, v) => (output[k] = v);
let bytes = 0;
output.on("data", (c) => (bytes += c.length));
await bridge.proxy(
  { method: "GET", headers: { range: "bytes=10-13" } },
  output,
  new URL(source.media_path, "http://local").searchParams.get("id"),
);
assert.equal(output.statusCode, 206);
assert.equal(output["content-range"], "bytes 10-13/100");
assert.equal(bytes, 4);
assert.equal(captured.Range, "bytes=10-13");
assert.equal(captured.Referer, e.headers.Referer);
assert.equal(captured.Origin, ALOOY_ORIGIN);
console.log(
  "Alooy parser, pagination, trust boundaries, HTTP routing and ranged web stream: passed",
);
