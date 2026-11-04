import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/app.mjs";
test("beta HTTP routes use only the beta service and preserve the success envelope and original history reference", async () => {
  const calls = [],
    key = "source:mycima:" + "a".repeat(24);
  const server = createServer({
    catalogStore: null,
    harvestService: {
      start() {},
      stop: async () => {},
      requestWork() {
        throw Error("CANONICAL_HARVEST_MUST_NOT_RUN");
      },
    },
    browserConfigurationService: { refresh: async () => {}, close() {} },
    browserWorkService: {
      request: (ref, opts) => {
        calls.push(["request", ref, opts]);
        return { ref: key, state: "running" };
      },
      status: () => ({ state: "ready" }),
      details: () => ({ ref: key, title: "Source Work", episodes: [] }),
      playback: (ref, opts) => {
        calls.push(["playback", ref, opts]);
        return { state: "running" };
      },
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const request = await fetch(
      base + "/api/v1/browser/request?ref=mycima%3Afixture",
      { method: "POST" },
    );
    const admitted = await request.json();
    assert.equal(admitted.status, "success");
    assert.equal(admitted.data.ref, key);
    const result = await (
      await fetch(
        base +
          "/api/v1/browser/playback?" +
          new URLSearchParams({
            ref: key,
            origin: "mycima:original",
            season: "2",
            episode: "19",
          }),
      )
    ).json();
    assert.equal(result.status, "success");
    assert.equal(result.data.state, "running");
    assert.equal(calls[1][2].origin, "mycima:original");
    assert.equal(calls[1][2].episode, 19);
    assert.equal(
      (await fetch(base + "/api/v1/browser/request?ref=mycima%3Afixture"))
        .status,
      405,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
