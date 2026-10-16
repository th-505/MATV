import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../server/app.mjs";
import { createProductionServer } from "../server/index.mjs";

const runtimeService = {
  status: () => ({ status: "ok" }),
  matches: async () => ({ status: "success", data: [] }),
  search: async () => ({ status: "success", data: [] }),
  category: async () => ({ status: "success", data: [] }),
};

const opaqueRef = "opaque-news-ref";
const newsRuntime = {
  list: async () => ({
    status: "success",
    version: "1.0.8",
    kind: "news",
    data: [{ id: opaqueRef, ref: opaqueRef, title: "خبر", date: "اليوم", description: "وصف" }],
  }),
  article: async (ref) => {
    assert.equal(ref, opaqueRef);
    return {
      status: "success",
      version: "1.0.8",
      kind: "news-article",
      data: { ref, title: "خبر", date: "اليوم", paragraphs: ["فقرة"] },
    };
  },
};

const server = createProductionServer({ appServer: createServer({ runtimeService }), newsRuntime });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path, headers: { Origin: "https://theeb1230-dot.github.io" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try { data = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, data, text });
      });
    });
    req.on("error", reject);
  });
}

try {
  const list = await get("/api/v1/news");
  assert.equal(list.status, 410, "news endpoint must return 410 GONE");
  assert.equal(list.data?.code, "NEWS_ENDPOINT_RETIRED");
  assert.equal(list.headers["access-control-allow-origin"], "https://theeb1230-dot.github.io");

  const article = await get(`/api/v1/news/article?ref=${encodeURIComponent(opaqueRef)}`);
  assert.equal(article.status, 410, "news article endpoint must return 410 GONE");
  assert.equal(article.data?.code, "NEWS_ENDPOINT_RETIRED");

  const missing = await get("/api/v1/news/article");
  assert.equal(missing.status, 410, "news article without ref must return 410 GONE");
  assert.equal(missing.data?.code, "NEWS_ENDPOINT_RETIRED");

  const health = await get("/health");
  assert.equal(health.status, 200, "existing app routes must remain reachable through production entry");
  assert.equal(health.data?.status, "ok");

  console.log("PASS canonical production entry: retired news (410) + app routes");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
