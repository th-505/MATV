import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveProvider, decodeRef, unpack } from "../edge/src/provider.mjs";
import gateway, { aggregate, refKey } from "../edge/src/router.mjs";
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
// Exercise the public gateway, not only the provider aggregation helper. A cache
// hit must consume neither a KV read nor an extraction service invocation.
const originalCaches = globalThis.caches;
const entries = new Map();
globalThis.caches = {
  default: {
    async match(key) {
      return entries.get(key.url)?.clone();
    },
    async put(key, response) {
      entries.set(key.url, response.clone());
    },
  },
};
const pending = [];
const ctx = {
  waitUntil(promise) {
    pending.push(promise);
  },
};
const counts = { kv: 0, extraction: 0, requests: 0, misses: 0 };
let allowRequests = true,
  allowMisses = true;
const env = {
  EDGE_REQUEST_LIMITER: {
    async limit({ key }) {
      counts.requests++;
      assert.equal(key, await refKey("198.51.100.20"));
      return { success: allowRequests };
    },
  },
  EDGE_RESOLVE_LIMITER: {
    async limit({ key }) {
      counts.misses++;
      assert.equal(key, await refKey("198.51.100.20"));
      return { success: allowMisses };
    },
  },
  EPISODES: {
    async get(key) {
      counts.kv++;
      if (key === "episode:unregistered") return null;
      return {
        episode_id:
          key === "episode:exact-dubbed" ? "exact-dubbed" : "exact-original",
        edition:
          key === "episode:exact-dubbed"
            ? "arabic-dubbed-cut-b"
            : "turkish-original-cut-a",
        refs: { "3isk": isk },
      };
    },
  },
  ISK: {
    async fetch() {
      counts.extraction++;
      return Response.json({
        sources: [
          {
            provider_id: "3isk",
            format: "hls",
            url: "https://video.test/master.m3u8",
            headers: { Referer: "https://miravd.com/" },
            expires_at: new Date(Date.now() + 180000).toISOString(),
          },
        ],
      });
    },
  },
};
const request = (query, path = "/v1/resolve") =>
  new Request("https://gateway.test" + path + (query ? "?" + query : ""), {
    headers: {
      "CF-Connecting-IP": "198.51.100.20",
      Origin: "https://th-505.github.io",
    },
  });
const send = async (query, path) => {
  const response = await gateway.fetch(request(query, path), env, ctx);
  await Promise.all(pending.splice(0));
  return { response, body: await response.json() };
};
try {
  const first = await send("ref=" + encodeURIComponent(isk));
  assert.equal(first.response.status, 200);
  assert.equal(first.body.edition, "turkish-original-cut-a");
  assert.equal(counts.kv, 1);
  assert.equal(counts.extraction, 1);
  const cached = await send(
    "ref=" + encodeURIComponent(isk) + "&refresh=1&cachebuster=anything",
  );
  assert.equal(cached.body.cached, true);
  assert.equal(
    counts.kv,
    1,
    "public refresh and cachebusters cannot trigger KV reads",
  );
  assert.equal(counts.extraction, 1);
  assert.equal(
    counts.misses,
    1,
    "cache hits do not consume the cold-resolution budget",
  );

  const key = [...entries.keys()][0];
  const stale = await entries.get(key).json();
  stale.sources[0].expires_at = new Date(Date.now() + 20000).toISOString();
  entries.set(
    key,
    Response.json(stale, {
      headers: { "X-MITV-Cache-Until": String(Date.now() + 60000) },
    }),
  );
  const renewed = await send("ref=" + encodeURIComponent(isk));
  assert.equal(renewed.response.status, 200);
  assert.equal(renewed.body.cached, undefined);
  assert.equal(counts.kv, 2, "a nearly expired source must resolve again");
  assert.equal(counts.extraction, 2);
  const ttlExpired = await entries.get(key).json();
  entries.set(
    key,
    Response.json(ttlExpired, {
      headers: { "X-MITV-Cache-Until": String(Date.now() - 1) },
    }),
  );
  const freshAfterTtl = await send("ref=" + encodeURIComponent(isk));
  assert.equal(freshAfterTtl.body.cached, undefined);
  assert.equal(
    counts.kv,
    3,
    "cache lifetime cannot outlive its freshness deadline",
  );
  assert.equal(counts.extraction, 3);

  const dubbed = await send("episode_id=exact-dubbed");
  assert.equal(dubbed.body.edition, "arabic-dubbed-cut-b");
  assert(dubbed.body.sources.every((s) => s.edition === "arabic-dubbed-cut-b"));
  const original = await send("ref=" + encodeURIComponent(isk));
  assert.equal(
    original.body.edition,
    "turkish-original-cut-a",
    "cache selectors must never mix dubbed/original editions",
  );

  const beforeDenied = { ...counts };
  allowRequests = false;
  const blockedHit = await send("ref=" + encodeURIComponent(isk));
  assert.equal(blockedHit.response.status, 429);
  assert.equal(blockedHit.response.headers.get("Retry-After"), "60");
  assert.equal(counts.kv, beforeDenied.kv);
  assert.equal(counts.extraction, beforeDenied.extraction);
  allowRequests = true;
  allowMisses = false;
  const blockedMiss = await send("episode_id=uncached");
  assert.equal(blockedMiss.response.status, 429);
  assert.equal(counts.kv, beforeDenied.kv, "reject cold floods before KV");
  const allowedHit = await send("ref=" + encodeURIComponent(isk));
  assert.equal(
    allowedHit.response.status,
    200,
    "an exhausted miss budget still permits active cache hits",
  );
  allowMisses = true;

  const malformed = await send("ref=unsupported%3Aref");
  assert.equal(malformed.response.status, 400);
  assert.equal(
    counts.kv,
    beforeDenied.kv,
    "invalid provider references cannot spend KV reads",
  );
  const absentLimiter = await gateway.fetch(
    request("episode_id=exact"),
    { ...env, EDGE_REQUEST_LIMITER: undefined },
    ctx,
  );
  assert.equal(
    absentLimiter.status,
    503,
    "missing production guards fail closed",
  );

  let matchCalls = 0;
  env.MATCHES = {
    async fetch(input) {
      matchCalls++;
      assert.equal(new URL(input.url).searchParams.has("refresh"), false);
      return Response.json({
        status: "success",
        version: "1.0.43",
        data: [{ id: "match-one" }],
      });
    },
  };
  const matches = await send("refresh=1", "/v1/matches");
  assert.equal(matches.body.data[0].id, "match-one");
  assert.equal(
    (await send("refresh=1&random=2", "/v1/matches")).body.cached,
    true,
  );
  assert.equal(matchCalls, 1, "live list polling uses a short metadata cache");
  assert.equal((await send("", "/v1/matches/unknown")).response.status, 404);
} finally {
  globalThis.caches = originalCaches;
}
console.log(
  "Edge tests: concurrent services, partial failures, edition isolation, HEAD-only validation, cache before KV, expiry renewal, public refresh protection, and request/cold-resolution limits passed",
);
