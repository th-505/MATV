import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { createLarozaEdge, decodeLarozaRef, explicitLarozaSeason, larozaRef, larozaExpiry, larozaPlayerData, parseLarozaCatalog, parseLarozaDetails, LAROZA_CONFIG } from "../edge/src/laroza.mjs";
const fixture = (name) => readFileSync(new URL("./fixtures/laroza/" + name, import.meta.url), "utf8");
const now = 1800000000000;
const play = larozaRef("/video.php?vid=episode1"), series = larozaRef("/view-serie1.php?ser=show2021");
assert.equal(decodeLarozaRef(play).pathname, "/play.php");
assert.equal(decodeLarozaRef(series).search, "?ser=show2021");
for (const raw of ["https://127.0.0.1/play.php?vid=x", "/play.php?vid=x&next=http://localhost", "/download.php?vid=x", "/play.php?vid=x#fragment", "/play.php?vid=x&vid=y"]) assert.throws(() => larozaRef(raw), /REJECTED|BAD_LAROZA/);
for (const raw of ["laroza://", "laroza:_w", "laroza:" + Buffer.from("//127.0.0.1/play.php?vid=x").toString("base64url"), "laroza:" + Buffer.from("/video.php?vid=x").toString("base64url")]) assert.throws(() => decodeLarozaRef(raw), /BAD_LAROZA/);
assert.throws(() => decodeLarozaRef(series, LAROZA_CONFIG, true), /SERIES_METADATA_ONLY/);

const catalog = parseLarozaCatalog(fixture("catalog.html"));
assert.equal(catalog.length, 2);
assert.equal(catalog[0].year, 2020);
assert.equal(catalog[0].type, "movie");
assert.equal(catalog[0].edition, "unknown");
assert.equal(catalog[1].audio_language, "ar");
assert.equal(catalog[1].edition, "arabic-dubbed");
assert.equal(catalog[0].identity_verified, false);
for (const [title, season] of [["مسلسل Fire Country الموسم الخامس الحلقة 1", 5], ["Georgie الموسم الثالث الحلقة 2", 3], ["الموسم الأوّل", 1], ["الموسم الحادي عشر", 11], ["الموسم الثاني عشر", 12], ["الموسم التاسع عشر", 19], ["الموسم العشرون", 20], ["الموسم ٥", 5], ["Season 3", 3], ["الحلقة الخامسة", null], ["عنوان الخامس", null], ["الموسم الجديد", null], ["الموسم الثلاثون", null], ["الموسم 0", null]]) assert.equal(explicitLarozaSeason(title), season, title);
assert.equal(parseLarozaCatalog('<li><div class="pm-video-thumb"><a href="/play.php?vid=noposter" title="فيلم No Poster"></a></div></li>')[0].poster, "");
assert(catalog.every((item) => item.source === "laroza" && !item.ref.includes("AD")));
const detail = parseLarozaDetails(fixture("series.html"), series);
assert.deepEqual(detail.episodes.map((e) => e.episode_number), [1, 2]);
assert.equal(detail.imdb_id, "tt1234567");
assert.equal(detail.work_identity_verified, true);
assert.equal(detail.identity_verified, false);
assert.equal(detail.timeline_verified, false);
const declaredSeasonDetails = parseLarozaDetails(fixture("series.html").replace("<h1>مسلسل Example 2021 مدبلج</h1>", "<h1>مسلسل Example الموسم الخامس مدبلج</h1>"), series);
assert.equal(declaredSeasonDetails.season_number, 5);
assert(declaredSeasonDetails.episodes.every((episode) => episode.season_number === 5));
assert.equal(declaredSeasonDetails.timeline_verified, false);
assert.equal(detail.description, "A short fixture story.");
assert.deepEqual(detail.subtitles, []);
assert(!JSON.stringify(detail).includes("recommendation"));
assert.equal(parseLarozaDetails(fixture("watch.html"), play).episodes.length, 0);
assert.equal(larozaPlayerData(fixture("packed-player.html"), "https://mp5.okhd.site/embed-fixture1.html").candidates[0], "https://cdn2.okprimeone.site/hls/demo/master.m3u8");
const sub = larozaPlayerData(`<video><track kind="subtitles" src="https://cdn2.okprimeone.site/subs/ar.vtt" srclang="ar" label="العربية"><track kind="metadata" src="https://cdn2.okprimeone.site/thumbs.vtt"></video><script>tracks:[{file:'https://cdn2.okprimeone.site/subs/en.srt',kind:'captions',label:'English',language:'en'}]</script>`, "https://mp5.okhd.site/embed-fixture1.html").subtitles;
assert.equal(sub.length, 2);
assert.equal(sub[0].language, "ara");
assert(sub.every((s) => s.origin === "attached" && s.headers.Referer.includes("mp5")));
assert.equal(larozaExpiry(new URL("https://cdn2.okprimeone.site/a.m3u8?expires=" + (now / 1000 + 90)), now), now + 90000);
assert.equal(larozaExpiry(new URL("https://cdn2.okprimeone.site/a.m3u8?s=" + now / 1000 + "&e=80"), now), now + 80000);
assert.equal(larozaExpiry(new URL("https://cdn2.okprimeone.site/a.m3u8?expires=" + (now + 70000)), now), now + 70000);
assert.throws(() => larozaExpiry(new URL("https://cdn2.okprimeone.site/a.m3u8?exp=1"), now), /EXPIRED/);

const media = {
 "mp5.okhd.site": "https://cdn2.okprimeone.site/hls/demo/master.m3u8",
 "vidspeed.org": "https://fixture.cdnz.quest/hls/demo/master.m3u8",
 "vidmoly.biz": "https://fixture.vmget.online/hls/demo/master.m3u8",
 "mp4plus.org": "https://fixture.cdnz.quest/demo.mp4",
};
function fetcher({ fail = false, allFail = false, redirectPrivate = false, overlarge = false } = {}) {
 const calls = [];
 const fn = async (raw, options) => {
  const u = new URL(raw); calls.push({ url: u.href, method: options.method || "GET", headers: options.headers });
  assert.equal(options.redirect, "manual");
  assert(options.signal instanceof AbortSignal);
  if (u.hostname === "larooza.beer") return new Response(overlarge ? "x".repeat(512 * 1024 + 1) : u.pathname === "/play.php" ? fixture("watch.html") : u.pathname === "/view-serie1.php" ? fixture("series.html") : fixture("catalog.html"), { headers: { "Content-Type": "text/html" } });
  if (u.hostname === "vidmoly.net") return new Response(null, { status: 302, headers: { location: redirectPrivate ? "https://127.0.0.1/embed-fixture4.html" : "https://vidmoly.biz/embed-fixture4.html" } });
  if (media[u.hostname]) {
   if (allFail || (fail && u.hostname === "mp5.okhd.site")) return new Response("blocked", { status: 403 });
   assert.equal(options.headers.Referer, "https://larooza.beer/play.php?vid=episode1");
   return new Response(u.hostname === "mp5.okhd.site" ? fixture("packed-player.html") : `jwplayer('v').setup({sources:[{file:'${media[u.hostname]}'}],tracks:[]});`, { headers: { "Content-Type": "text/html" } });
  }
  if (["cdn2.okprimeone.site", "fixture.cdnz.quest", "fixture.vmget.online"].includes(u.hostname)) {
   assert.equal(options.method, "HEAD", "No video bytes are read by the worker");
   if (options.headers.Origin === "https://th-505.github.io" && u.pathname.endsWith(".mp4")) return new Response(null, { status: 403 });
   return new Response(null, { headers: { "Content-Type": u.pathname.endsWith(".mp4") ? "video/mp4" : "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes" } });
  }
  throw Error("Unexpected upstream " + u.hostname);
 };
 return { fn, calls };
}
const live = fetcher(), engine = createLarozaEdge({ fetchImpl: live.fn, now: () => now });
const resolved = await engine.resolve(play);
assert.equal(resolved.sources.length, 4);
assert(resolved.fetches <= 40);
assert(resolved.sources.every((s) => s.provider_id === "laroza" && s.playback_mode === "edge_direct" && Date.parse(s.expires_at) === now + 240000));
assert.equal(resolved.sources.find((s) => s.format === "mp4").web_playable, false);
assert(resolved.sources.filter((s) => s.format === "hls").every((s) => s.web_playable));
const mira = resolved.sources.find((s) => s.server === "vidmoly.biz");
assert.equal(mira.headers.Referer, "https://vidmoly.biz/embed-fixture4.html");
assert.equal(mira.headers.Origin, "https://vidmoly.biz");
assert(!live.calls.some((c) => /llvpn|ads.invalid|127\.0\.0\.1|film77/.test(c.url)));
assert(live.calls.filter((c) => /cdnz|vmget|okprimeone/.test(c.url)).every((c) => c.method === "HEAD"));
const partial = fetcher({ fail: true });
assert.equal((await createLarozaEdge({ fetchImpl: partial.fn, now: () => now }).resolve(play)).sources.length, 3);
const privateRedirect = fetcher({ redirectPrivate: true });
assert.equal((await createLarozaEdge({ fetchImpl: privateRedirect.fn, now: () => now }).resolve(play)).sources.length, 3);
assert(!privateRedirect.calls.some((c) => c.url.includes("127.0.0.1")));
let mediaRedirects = 0;
const loopFetch = fetcher().fn;
await assert.rejects(createLarozaEdge({ fetchImpl: async (u, o) => {
 if (o.method === "HEAD") { mediaRedirects++; return new Response(null, { status: 302, headers: { Location: String(u) } }); }
 return loopFetch(u, o);
} }).resolve(play), /NO_HEALTHY/);
assert.equal(mediaRedirects, 16, "Each of four HEAD candidates stops after three redirects");
await assert.rejects(createLarozaEdge({ fetchImpl: fetcher({ allFail: true }).fn }).resolve(play), /NO_HEALTHY/);
const capped = fetcher();
await assert.rejects(createLarozaEdge({ fetchImpl: capped.fn, config: { fetchBudget: 1 } }).resolve(play), /NO_HEALTHY/);
assert.equal(capped.calls.length, 1);
await assert.rejects(createLarozaEdge({ fetchImpl: fetcher({ overlarge: true }).fn }).details(play), /PAGE_TOO_LARGE/);

let pending = 0, maximum = 0, requests = 0;
const feedRequests = [];
const listEngine = createLarozaEdge({ fetchImpl: async (raw) => { feedRequests.push(new URL(raw)); requests++; pending++; maximum = Math.max(maximum, pending); await new Promise((r) => setTimeout(r, 5)); pending--; return new Response(fixture("catalog.html"), { headers: { "Content-Type": "text/html" } }); } });
const movies = await listEngine.category("movies", 2);
assert.equal(requests, 2); assert(maximum <= 2); assert.equal(movies.data.length, 2); assert.equal(movies.page, 2);
assert.equal(movies.pagination.next_page, 3);
assert.equal(movies.pagination.bounded_feed_rotation, true);
assert(movies.data.every((item) => item.genres.includes("asian")));
feedRequests.length = 0;
for (let p = 1; p <= 4; p++) await listEngine.category("movies", p);
assert.equal(new Set(feedRequests.map((u) => u.searchParams.get("cat"))).size, 7);
assert.equal(feedRequests.at(-1).searchParams.get("cat"), "all_movies_13");
assert.equal(feedRequests.at(-1).searchParams.get("page"), "2");
assert(maximum <= 2);
const paginated = createLarozaEdge({ fetchImpl: async () => new Response(fixture("catalog.html") + '<a href="newvideos1.php?&amp;page=3">Next</a>', { headers: { "Content-Type": "text/html" } }) });
assert.equal((await paginated.category("latest", 2)).has_more, true);
assert.equal((await paginated.search("Example", 2)).has_more, false);
await assert.rejects(listEngine.category("random", 1), /BAD_LAROZA_SECTION/);
await assert.rejects(listEngine.category("latest", "1&url=evil"), /BAD_LAROZA_PAGE/);
await assert.rejects(listEngine.search("a"), /BAD_LAROZA_QUERY/);

const originalFetch = globalThis.fetch;
try {
 globalThis.fetch = fetcher().fn;
 for (const config of [LAROZA_CONFIG, JSON.stringify(LAROZA_CONFIG)]) {
  const res = await worker.fetch(new Request("https://provider.internal/details?ref=" + encodeURIComponent(series)), { PROVIDER_CONFIG: config });
  assert.equal(res.status, 200); assert.equal((await res.json()).data.episodes.length, 2);
 }
 const invalid = await worker.fetch(new Request("https://provider.internal/resolve?ref=" + encodeURIComponent(series)), { PROVIDER_CONFIG: LAROZA_CONFIG });
 assert.equal(invalid.status, 400);
 const rejectDuplicate = await worker.fetch(new Request("https://provider.internal/category?page=1&page=2"), {}); assert.equal(rejectDuplicate.status, 400);
 globalThis.fetch = fetcher({ allFail: true }).fn;
 const failed = await worker.fetch(new Request("https://provider.internal/resolve?ref=" + encodeURIComponent(play)), { PROVIDER_CONFIG: LAROZA_CONFIG });
 assert.equal(failed.status, 503); assert.equal((await failed.json()).error, "NO_HEALTHY_LAROZA_SOURCES");
} finally { globalThis.fetch = originalFetch; }
console.log("Laroza edge: real-shaped catalogs/series episodes, bounded safe Packer, four clean direct host adapters, partial failure, protected headers, HEAD-only media, strict references/redirects, subtitles, quota limits and JSON config passed");
