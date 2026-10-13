import assert from "node:assert/strict";
import {
  createMatchEdge,
  playerCandidates,
  matchRef,
} from "../edge/src/matches.mjs";
const article = "https://news.yallowzeno.world/match-one/";
const signed =
  "https://api.albasritv1.workers.dev/?matchUrl=" +
  encodeURIComponent(article) +
  "&mexp=123&msig=fixture";
const target = "https://pull.gosh6.app/live/test.m3u8";
const page = "https://news.yallowzeno.world/albaplayer/test/";
const calls = [];
const engine = createMatchEdge({
  fetchImpl: async (u, o) => {
    const url = String(u);
    calls.push({ url, method: o.method || "GET", headers: o.headers });
    if (url.endsWith("/session")) return Response.json({ token: "fixture" });
    if (url === "https://api.albasritv1.workers.dev/")
      return Response.json({
        data: [
          { team1: { name: "one" }, team2: { name: "two" }, link: signed },
        ],
      });
    if (url === signed) {
      assert.equal(o.headers["X-BSR-Token"], "fixture");
      return Response.json({
        servers: [{ name: "main", type: "iframe", url: page }],
      });
    }
    if (url === page)
      return new Response(
        `AlbaPlayerControl('${Buffer.from(target + "\r\n").toString("base64")}','hls')`,
      );
    if (url === target) {
      assert.equal(o.method, "HEAD");
      assert([page, "https://th-505.github.io/"].includes(o.headers.Referer));
      return new Response(null, {
        headers: { "access-control-allow-origin": "*" },
      });
    }
    throw Error("Unexpected upstream");
  },
});
const list = await engine.list();
assert.equal(list.data.length, 1);
assert.equal(list.data[0].ref, matchRef(article));
const result = await engine.resolve(list.data[0].ref);
assert.equal(result.sources[0].url, target);
assert.equal(result.sources[0].playback_mode, "edge_direct");
assert(
  calls
    .filter((x) => x.url.includes("gosh6"))
    .every((x) => x.method === "HEAD"),
);
assert.equal(
  playerCandidates(
    `new Clappr.Player({"source":"https://pull.gosh6.app/live/" + "test.m3u8"})`,
    page,
  ).direct[0],
  target,
);
await assert.rejects(
  engine.resolve(
    "match:" + Buffer.from("https://127.0.0.1/x").toString("base64url"),
  ),
  /REJECTED/,
);
await assert.rejects(
  engine.playback(
    "matchserver:" +
      Buffer.from(JSON.stringify([list.data[0].ref, 999])).toString(
        "base64url",
      ),
  ),
  /BAD_MATCH_REFERENCE/,
);
console.log(
  "Match edge: current AlbaPlayer Base64, Clappr literals, exact upstream allowlists, server identities and HEAD-only media checks passed",
);

for (const engine of ["hls", "clappr", "plyr"])
  assert.equal(
    playerCandidates(
      `AlbaPlayerControl('${Buffer.from(target).toString("base64")}','${engine}')`,
      page,
    ).direct[0],
    target,
  );
