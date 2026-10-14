import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";
const dir = path.resolve("flutter_app/build/web");
const format = process.argv[2] === "hls" ? "hls" : "mp4";
const mime = {
  ".js": "application/javascript",
  ".wasm": "application/wasm",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".mp4": "video/mp4",
};
const server = http.createServer((req, res) => {
  const file = path.join(
    dir,
    new URL(req.url, "http://local").pathname.replace(/^\/MATV\/app\//, ""),
  );
  if (
    !file.startsWith(dir + "/") ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN || "/usr/bin/chromium",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers": "*",
};
await page.route("https://matv.onrender.com/**", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  const u = new URL(route.request().url());
  if (u.pathname.endsWith(".ts")) {
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "video/mp2t" },
      body: fs.readFileSync(
        "/tmp/matv-codec-fixtures/" + path.basename(u.pathname),
      ),
    });
    return;
  }
  if (u.pathname.includes("/media")) {
    const file =
      u.searchParams.get("format") === "m3u8" ? "master.m3u8" : "sample.mp4";
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": mime[path.extname(file)] || "application/octet-stream",
      },
      body: fs.readFileSync("/tmp/matv-codec-fixtures/" + file),
    });
    return;
  }
  let data = { status: "success", data: [] };
  if (u.pathname === "/api/cinema/details")
    data = {
      status: "success",
      movie_title: "Web playback fixture",
      poster: "",
      playback_unavailable: true,
      playback_reason: "EDGE_DIRECT_RESOLUTION_REQUIRED",
      download_available: false,
    };
  await route.fulfill({
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
});
await page.route(
  "https://matv-edge-resolver.dada1000100.workers.dev/**",
  async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "success",
        schema_version: 1,
        episode_id: "web-fixture",
        sources: [
          {
            provider_id: "alooy",
            provider: "Fixture",
            format,
            quality: "test",
            url: `https://media.fixture.example/${format === "hls" ? "master.m3u8" : "sample.mp4"}`,
            playback_mode: "edge_direct",
            web_playable: true,
            expires_at: new Date(Date.now() + 120000).toISOString(),
            headers: {},
          },
        ],
      }),
    });
  },
);
await page.route("https://media.fixture.example/**", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  const u = new URL(route.request().url());
  const name = path.basename(u.pathname);
  await route.fulfill({
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": mime[path.extname(name)] || "application/octet-stream",
    },
    body: fs.readFileSync("/tmp/matv-codec-fixtures/" + name),
  });
});
try {
  await page.goto(
    `http://127.0.0.1:${server.address().port}/MATV/app/index.html?ref=alooy:fixture`,
  );
  await page.locator("flutter-view").waitFor({ timeout: 60000 });
  const placeholder = page.locator("flt-semantics-placeholder");
  await placeholder.waitFor();
  await placeholder.evaluate((el) => el.click());
  await page
    .getByText("مشاهدة داخل التطبيق", { exact: false })
    .click({ timeout: 20000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].some(
        (v) => v.videoWidth > 0 && v.currentTime > 0.2,
      ),
    null,
    { timeout: 25000 },
  );
  const video = await page.locator("video").evaluate((v) => ({
    width: v.videoWidth,
    height: v.videoHeight,
    time: v.currentTime,
  }));
  assert(video.width > 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.screenshot({
    path: path.join(
      process.env.MATV_WEB_SCREENSHOT_DIR || os.tmpdir(),
      `matv-web-${format}.png`,
    ),
  });
  console.log(
    JSON.stringify({
      browser: "Chromium",
      format,
      app_booted: true,
      video_decoded: true,
      ...video,
      exceptions: errors.length,
      fixture: true,
      physical_device_tested: false,
    }),
  );
} catch (error) {
  await page.screenshot({
    path: path.join(
      process.env.MATV_WEB_SCREENSHOT_DIR || os.tmpdir(),
      "matv-web-error.png",
    ),
  });
  console.log((await page.locator("body").innerText()).slice(0, 1500));
  console.log(errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
