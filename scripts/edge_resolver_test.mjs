import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveProvider, decodeRef, unpack } from "../edge/src/provider.mjs";
import { aggregate } from "../edge/src/router.mjs";
const configs = JSON.parse(fs.readFileSync("edge/config/providers.json"));
const alooy =
  "alooy:" + Buffer.from("/watch/test.html?key=one").toString("base64url");
const requests = [];
const mock = async (url, options) => {
  requests.push({ url: String(url), ...options });
  if (options.method === "HEAD")
    return new Response(null, {
      status: String(url).includes("bad") ? 403 : 200,
    });
  return new Response(
    '<video><source src="https://vid8.ujeklsj.site/test.mp4"><source src="https://vid8.ujeklsj.site/bad.mp4"></video>',
  );
};
const a = await resolveProvider(alooy, configs.alooy, mock);
assert.equal(a.sources.length, 1);
assert.equal(a.sources[0].headers.Origin, configs.alooy.origin);
assert.equal(
  a.sources[0].headers.Referer,
  configs.alooy.origin + "/watch/test.html?key=one",
);
assert(
  requests
    .filter((r) => r.url.includes(".site"))
    .every((r) => r.method === "HEAD"),
);
assert.throws(() =>
  decodeRef("legacy:https://evil.test/episode/1", configs.akoam),
);
assert.throws(() =>
  decodeRef(
    "alooy:" + Buffer.from("https://127.0.0.1/x").toString("base64url"),
    configs.alooy,
  ),
);
assert.equal(unpack("}('0 1',36,2,'file|master'.split('|'))"), "file master");
const active = [];
let simultaneous = 0,
  maximum = 0;
const service = (provider) => ({
  async fetch() {
    active.push(provider);
    maximum = Math.max(maximum, ++simultaneous);
    await new Promise((r) => setTimeout(r, 10));
    simultaneous--;
    if (provider === "akoam") return new Response(null, { status: 403 });
    return Response.json({
      sources: [
        {
          provider_id: provider,
          url: "https://video.test/test.mp4",
          expires_at: new Date(Date.now() + 120000).toISOString(),
        },
      ],
    });
  },
});
const result = await aggregate(
  {
    episode_id: "same-episode",
    edition: "dubbed-cut-a",
    refs: { "3isk": "i", akoam: "a", alooy: "b" },
  },
  { ISK: service("3isk"), AKOAM: service("akoam"), ALOOY: service("alooy") },
);
assert.equal(maximum, 3);
assert.equal(result.sources.length, 2);
assert(result.sources.every((s) => s.edition === "dubbed-cut-a"));
assert.equal(result.episode_id, "same-episode");
const partial = await aggregate(
  { episode_id: "own", refs: { alooy: "b" } },
  { ALOOY: service("alooy") },
);
assert.equal(partial.sources.length, 1);
assert.equal(partial.sources[0].provider_id, "alooy");
const isk =
  "3isk:" +
  Buffer.from("/watch/episodes/test-season-1-episode-1/").toString("base64url");
const story = await resolveProvider(isk, configs["3isk"], async (u, o) => {
  if (o.method === "HEAD") return new Response(null);
  const path = new URL(u).pathname;
  if (path.endsWith("see/"))
    return new Response(
      '<iframe src="https://3iskk.xyz/embed/1/10/2/"></iframe>',
    );
  if (path.startsWith("/embed/"))
    return new Response(
      '<iframe src="https://miravd.com/embed-one.html"></iframe>',
    );
  if (new URL(u).host === "miravd.com") {
    assert.equal(o.headers.Referer, "https://3iskk.xyz/embed/1/10/2/");
    return new Response('file:"https://s40.grzcdn.com/hls/abc/master.m3u8"');
  }
  return new Response('<body class="postid-10">');
});
assert.equal(story.sources[0].headers.Referer, "https://miravd.com/");
console.log(
  "Edge tests: three concurrent services, partial failures, exact episode editions, bounded parsers, HEAD-only media validation, and miravd wrapper headers passed",
);
