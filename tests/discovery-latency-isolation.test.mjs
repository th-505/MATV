import test from "node:test";
import assert from "node:assert/strict";
import { createContentDiscovery } from "../server/scrapers/content-discovery.mjs";
import { createOptionalCacheReader } from "../server/optional-cache.mjs";
import { fetchSafeResponse } from "../server/scrapers/shared/http.mjs";
import {
  runInBrowserLane,
  isBrowserTraffic,
} from "../server/browser/traffic.mjs";
test("canonical playback starts twenty provider searches concurrently by default", async () => {
  const started = [],
    gates = [];
  const entries = Array.from({ length: 20 }, (_, i) => ({
    meta: { id: "source_" + i, capabilities: { search: true, details: true } },
    module: {
      scrapeSearch: () => {
        started.push(i);
        return new Promise((r) => gates.push(r));
      },
      scrapeDetails: async () => ({}),
    },
  }));
  const result = createContentDiscovery({ entries }).discover(
    "Known Film",
    0,
    0,
    { type: "movie", year: 2025 },
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(started.length, 20);
  for (const resolve of gates) resolve([]);
  await result;
});
test("an unavailable optional DB cache cannot hold playback until its connection timeout", async () => {
  let reads = 0;
  let now = 0;
  const read = createOptionalCacheReader({
    budgetMs: 10,
    cooldownMs: 30000,
    now: () => now,
  });
  assert.equal(
    await read("one", () => {
      reads++;
      return new Promise(() => {});
    }),
    null,
  );
  assert.equal(
    await read("two", () => {
      reads++;
      return Promise.resolve("unused");
    }),
    null,
  );
  assert.equal(reads, 1);
  now = 30001;
  assert.equal(await read("two", async () => "recovered"), "recovered");
});
test("beta can occupy only one of the four guarded HTTP slots for the same host", async () => {
  let active = 0,
    peak = 0,
    all = false;
  const gates = [],
    started = [];
  const fetchImpl = async () => {
    const beta = isBrowserTraffic();
    started.push(beta ? "beta" : "najd");
    active++;
    peak = Math.max(peak, active);
    try {
      if (!all) await new Promise((r) => gates.push(r));
      return new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    } finally {
      active--;
    }
  };
  const fetch = () =>
    fetchSafeResponse("https://capacity-fixture.example/", {
      fetchImpl,
      maxRetries: 0,
      timeoutMs: 2000,
    });
  const tasks = [
    ...Array.from({ length: 4 }, () => runInBrowserLane(fetch)),
    ...Array.from({ length: 3 }, fetch),
  ];
  for (let i = 0; i < 30 && started.length < 4; i++)
    await new Promise((r) => setTimeout(r, 15));
  assert.equal(started.filter((x) => x === "beta").length, 1);
  assert.equal(started.filter((x) => x === "najd").length, 3);
  assert.equal(peak, 4);
  all = true;
  for (const release of gates) release();
  await Promise.all(tasks);
  assert(peak <= 4);
});
