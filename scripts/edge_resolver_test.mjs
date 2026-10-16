import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveProvider, decodeRef, unpack } from "../edge/src/provider.mjs";
import gateway, { aggregate, refKey, providerOf } from "../edge/src/router.mjs";
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
  { verifiedIdentity: true },
);
assert.equal(maximum, 3);
assert.equal(result.sources.length, 2);
assert(result.sources.every((s) => s.edition === "dubbed-cut-a"));
assert(
  result.sources.every(
    (s) => s.timeline_verified && s.timeline_offset_ms === 0,
  ),
);
assert.equal(result.episode_id, "same-episode");
const partial = await aggregate(
  { episode_id: "own", refs: { alooy: "b" } },
  { ALOOY: service("alooy") },
);
assert.equal(partial.sources.length, 1);
assert.equal(partial.sources[0].provider_id, "alooy");
assert.equal(partial.sources[0].timeline_verified, false);
assert.equal(partial.sources[0].timeline_offset_ms, null);
const larozaRef =
  "laroza:" + Buffer.from("/play.php?vid=stable-one").toString("base64url");
assert.equal(providerOf(larozaRef), "laroza");
const larozaPartial = await aggregate(
  { episode_id: "unknown-cut", refs: { "3isk": "i", laroza: larozaRef } },
  {
    ISK: {
      async fetch() {
        return Response.json({ error: "SOURCE_BLOCKED" }, { status: 403 });
      },
    },
    LAROZA: service("laroza"),
  },
);
assert.equal(larozaPartial.sources.length, 1);
assert.equal(larozaPartial.sources[0].provider_id, "laroza");
assert.equal(larozaPartial.sources[0].timeline_verified, false);
assert.equal(
  larozaPartial.availability.find((r) => r.provider_id === "3isk").status,
  "unavailable",
);
const many = (provider) => ({
  async fetch() {
    return Response.json({
      sources: Array.from({ length: 6 }, (_, i) => ({
        provider_id: provider,
        url: `https://video.test/${provider}/${i}.mp4`,
        expires_at: new Date(Date.now() + 120000).toISOString(),
      })),
    });
  },
});
const capped = await aggregate(
  {
    episode_id: "known-edition",
    edition: "original-cut-26",
    refs: {
      "3isk": "i",
      akoam: "a",
      alooy: "b",
      laroza: larozaRef,
    },
  },
  {
    ISK: many("3isk"),
    AKOAM: many("akoam"),
    ALOOY: many("alooy"),
    LAROZA: many("laroza"),
  },
  { verifiedIdentity: true },
);
assert.equal(capped.sources.length, 8);
assert.deepEqual(
  [...new Set(capped.sources.map((s) => s.provider_id))],
  ["3isk", "akoam", "alooy", "laroza"],
);
assert(
  capped.sources.every(
    (s) => s.edition === "original-cut-26" && s.timeline_verified,
  ),
);
const byteLength = (value) => Buffer.byteLength(JSON.stringify(value));
const providerBindings = { "3isk": "ISK", akoam: "AKOAM", alooy: "ALOOY", laroza: "LAROZA" };
const budgetIdentity = { episode_id: "caption-budget", refs: { "3isk": "i", akoam: "a", alooy: "b", laroza: larozaRef } };
const budgetServices = (makeSource) => Object.fromEntries(Object.entries(providerBindings).map(([provider, binding]) => [binding, {
  async fetch() { return Response.json({ sources: Array.from({ length: 4 }, (_, index) => makeSource(provider, index)) }); },
}]));
const videoSource = (provider, index) => ({
  provider_id: provider,
  url: `https://video.test/${provider}/${index}.mp4?token=preserve-this-value`,
  headers: { Referer: `https://${provider}.test/watch?key=keep-me`, "User-Agent": "bounded-fixture-browser" },
  expires_at: new Date(Date.now() + 120000).toISOString(),
});
const captionHeavy = await aggregate(budgetIdentity, budgetServices((provider, index) => ({
  ...videoSource(provider, index),
  subtitles: ["en", "fr", "ar", "de"].map((language) => ({
    language,
    label: language === "ar" ? "العربية" : "Optional translation",
    url: `https://caption.test/${provider}/${index}/${language}.srt?token=${"x".repeat(1700)}`,
    headers: { Referer: `https://${provider}.test/watch?key=${"y".repeat(300)}` },
    kind: "subtitles", origin: "attached",
  })),
})));
assert.equal(captionHeavy.status, "success", "optional captions cannot reject healthy video rows");
assert.equal(captionHeavy.sources.length, 8, "trim captions before discarding video alternatives");
assert(byteLength({ ...captionHeavy, cached: true }) <= 12288, "both cold and cache-hit JSON obey 12 KiB");
assert.deepEqual([...new Set(captionHeavy.sources.map((s) => s.provider_id))], Object.keys(providerBindings));
const keptTracks = captionHeavy.sources.flatMap((s) => s.subtitles);
assert(keptTracks.length > 0, "preserve Arabic captions when they fit after metadata trimming");
assert(keptTracks.every((track) => track.language === "ar"), "prefer Arabic over optional non-Arabic tracks");
for (const source of captionHeavy.sources) {
  const index = Number(new URL(source.url).pathname.match(/\/(\d+)\.mp4$/)[1]);
  assert.equal(source.url, videoSource(source.provider_id, index).url, "never truncate signed media URL");
  assert.deepEqual(source.headers, videoSource(source.provider_id, index).headers, "never truncate protected headers");
}
const largeSources = await aggregate(budgetIdentity, budgetServices((provider, index) => ({
  ...videoSource(provider, index),
  url: `https://video.test/${provider}/${index}.mp4?token=${"z".repeat(900)}`,
  headers: { Referer: `https://${provider}.test/watch?key=${"r".repeat(1000)}` },
})));
assert.equal(largeSources.status, "success");
assert(largeSources.sources.length >= 4 && largeSources.sources.length < 8, "discard complete extra sources when media metadata alone exceeds the budget");
assert.deepEqual([...new Set(largeSources.sources.map((s) => s.provider_id))], Object.keys(providerBindings), "retain one source per provider whenever possible");
assert(byteLength({ ...largeSources, cached: true }) <= 12288);
const oversizedSingle = await aggregate({ episode_id: "oversized-row", refs: { "3isk": "i", akoam: "a" } }, {
  ISK: { async fetch() { return Response.json({ sources: [{ ...videoSource("3isk", 0), headers: { Referer: "https://video.test/" + "r".repeat(12500) } }] }); } },
  AKOAM: { async fetch() { return Response.json({ sources: [videoSource("akoam", 0)] }); } },
});
assert.equal(oversizedSingle.status, "success", "one oversized essential row cannot reject another healthy provider");
assert.deepEqual(oversizedSingle.sources.map((s) => s.provider_id), ["akoam"]);
assert.equal(oversizedSingle.sources[0].url, videoSource("akoam", 0).url);
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
      if (key === (await refKey(larozaRef))) return null;
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
  assert.equal(first.body.timeline_verified, true);
  assert(
    first.body.sources.every(
      (s) => s.timeline_verified && s.timeline_offset_ms === 0,
    ),
  );
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
        version: "1.0.44",
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
  const metadataRequests = [];
  env.LAROZA = {
    async fetch(input) {
      const u = new URL(input.url);
      metadataRequests.push(u);
      assert.equal(
        u.hostname,
        u.pathname === "/resolve" ? "provider.internal" : "laroza.internal",
      );
      assert.equal(u.searchParams.has("refresh"), false);
      if (u.pathname === "/resolve")
        return Response.json({
          sources: [
            {
              provider_id: "laroza",
              url: "https://video.test/direct.mp4",
              expires_at: new Date(Date.now() + 120000).toISOString(),
            },
          ],
        });
      return Response.json({
        status: "success",
        data:
          u.pathname === "/details"
            ? { title: "Laroza Film", ref: larozaRef, episodes: [] }
            : [{ title: "Laroza Film", ref: larozaRef }],
      });
    },
  };
  const beforeMetadataKv = counts.kv;
  const catalog = await send("section=movies&page=2", "/v1/laroza/category");
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.body.data[0].title, "Laroza Film");
  assert.equal(metadataRequests[0].pathname, "/category");
  assert.equal(metadataRequests[0].searchParams.get("section"), "movies");
  const metadataHit = await send(
    "page=2&section=movies&refresh=1",
    "/v1/laroza/category",
  );
  assert.equal(metadataHit.body.cached, true);
  assert.equal(
    metadataRequests.length,
    1,
    "canonical metadata query ignores refresh/order",
  );
  const catalogCacheKey = [...entries.keys()].find((k) =>
    k.includes("/laroza/"),
  );
  assert.equal(
    entries.get(catalogCacheKey).headers.get("Cache-Control"),
    "public,max-age=300",
  );
  const search = await send(
    "q=" + encodeURIComponent("  فيلم  ") + "&page=1",
    "/v1/laroza/search",
  );
  assert.equal(search.response.status, 200);
  assert.equal(metadataRequests.at(-1).searchParams.get("q"), "فيلم");
  const details = await send(
    "ref=" + encodeURIComponent(larozaRef),
    "/v1/laroza/details",
  );
  assert.equal(details.response.status, 200);
  assert.equal(details.body.data.ref, larozaRef);
  assert.equal(
    counts.kv,
    beforeMetadataKv,
    "Laroza catalog/search/details must never read KV",
  );
  const detailKey = [...entries.keys()].find(
    (k) =>
      k.includes("/laroza/") &&
      entries.get(k).headers.get("Cache-Control") === "public,max-age=120",
  );
  assert(detailKey, "details metadata uses its separate short cache");
  const invalidQueries = [
    ["section=other", "/v1/laroza/category"],
    ["page=0", "/v1/laroza/category"],
    ["page=1001", "/v1/laroza/category"],
    ["page=1.5", "/v1/laroza/category"],
    ["page=1&page=2", "/v1/laroza/category"],
    ["url=https://127.0.0.1", "/v1/laroza/category"],
    ["q=" + "x".repeat(121), "/v1/laroza/search"],
    ["q=%00bad", "/v1/laroza/search"],
    ["q=", "/v1/laroza/search"],
    ["q=a", "/v1/laroza/search"],
    ["ref=laroza:", "/v1/laroza/details"],
    ["ref=http://127.0.0.1", "/v1/laroza/details"],
    ["ref=laroza:" + "x".repeat(1500), "/v1/laroza/details"],
  ];
  const metadataCallsBeforeInvalid = metadataRequests.length;
  for (const [query, route] of invalidQueries)
    assert.equal((await send(query, route)).response.status, 400);
  assert.equal(
    metadataRequests.length,
    metadataCallsBeforeInvalid,
    "malicious metadata parameters never reach the private worker",
  );
  assert.equal(counts.kv, beforeMetadataKv);
  assert.equal((await send("", "/v1/laroza/stream")).response.status, 404);
  const unmappedLaroza = await send("ref=" + encodeURIComponent(larozaRef));
  assert.equal(unmappedLaroza.response.status, 200);
  assert.equal(unmappedLaroza.body.sources[0].provider_id, "laroza");
  assert.equal(unmappedLaroza.body.timeline_verified, false);
  assert.equal(unmappedLaroza.body.sources[0].timeline_offset_ms, null);
  assert.equal(
    counts.kv,
    beforeMetadataKv + 1,
    "only playback resolution performs the one identity lookup",
  );
  const health = await send("", "/health");
  assert.deepEqual(health.body.providers, ["3isk", "akoam", "alooy", "laroza"]);
  env.LAROZA = {
    async fetch() {
      return Response.json({
        status: "success",
        data: { stream_url: "https://video.test/master.m3u8" },
      });
    },
  };
  const unexpectedMedia = await send(
    "ref=" + encodeURIComponent("laroza:bmV3"),
    "/v1/laroza/details",
  );
  assert.equal(
    unexpectedMedia.response.status,
    502,
    "metadata endpoints reject media URLs instead of caching them",
  );
  env.LAROZA = {
    async fetch() {
      return new Response("x".repeat(131073));
    },
  };
  const oversized = await send("q=oversized", "/v1/laroza/search");
  assert.equal(oversized.response.status, 502);
  assert.equal(oversized.body.error, "RESPONSE_TOO_LARGE");
} finally {
  globalThis.caches = originalCaches;
}
console.log(
  "Edge tests: four-provider partial aggregation, exact edition timelines, metadata-only Laroza routes, bounded/validated queries, eight-source cap, HEAD-only validation, cache-before-KV, expiry renewal and quota guards passed",
);
