import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { createBrowserWorkService } from "../server/browser/service.mjs";
import { scanSourceGraph } from "../server/browser/source-graph.mjs";
const base = "https://mycima.gdn";
const ref = (url) => "mycima:" + Buffer.from(url).toString("base64url");
const seed = base + "/watch/work/episode-19/";
const parent = base + "/series/work/";
const link = (n) =>
  `<a href="/watch/work/episode-${n}/">خالتي قماشة الحلقة ${n}</a>`;
const pages = new Map([
  [
    seed,
    '<h1>خالتي قماشة الحلقة 19</h1><div class="breadcrumbs"><a href="/series/work/">مسلسل خالتي قماشة</a></div>',
  ],
  [
    parent,
    '<h1>خالتي قماشة</h1><div class="episodes-list">' +
      link(2) +
      link(1) +
      '</div><a rel="next" href="/series/work/page/2/">التالي</a>',
  ],
  [
    base + "/series/work/page/2/",
    '<h1>خالتي قماشة</h1><div class="episodes-list">' +
      link(12) +
      '</div><a rel="next" href="/series/work/page/3/">التالي</a>',
  ],
  [
    base + "/series/work/page/3/",
    '<h1>خالتي قماشة</h1><div class="episodes-list">' + link(19) + "</div>",
  ],
]);
function fixture(options = {}) {
  const fetched = [];
  const entry = {
    meta: { id: "mycima", domains: [base] },
    module: {
      scrapeDetails: async (url, options = {}) => {
        const html =
          options.fixtureHtml ||
          pages.get(url) ||
          "<h1>خالتي قماشة الحلقة 19</h1>";
        return {
          title: cheerio.load(html)("h1").text(),
          type: "series",
          episodes: [],
          sourceUrl: url,
        };
      },
      scrapeServers: async () => [{ url: "https://cdn.example/episode19.mp4" }],
    },
  };
  const service = createBrowserWorkService({
    lookup: () => entry,
    fetchPage: async (url) => {
      fetched.push(url);
      if (!pages.has(url)) throw Error("FIXTURE_UNKNOWN_PAGE");
      return { html: pages.get(url), url };
    },
    probe: async () => ({ playable: true, webPlayable: true,container_verified:true }),
    store: null,
    ...options,
  });
  return { service, fetched };
}
test("beta enters through episode 19 and follows the observed parent and all three pages without TMDB", async () => {
  const { service, fetched } = fixture(),
    admitted = await service.request(ref(seed));
  await service.settle();
  const work = await service.details(admitted.ref);
  assert.deepEqual(
    work.episodes.map((e) => e.episode_number),
    [1, 2, 12, 19],
  );
  assert.equal(work.canonical_identity_verified, false);
  assert.equal((await service.status(admitted.ref)).state, "ready");
  assert.deepEqual(fetched, [
    seed,
    parent,
    base + "/series/work/page/2/",
    base + "/series/work/page/3/",
  ]);
});
test("source graph rejects unrelated work links and private-host parent links", () => {
  const html =
    '<h1>خالتي قماشة الحلقة 19</h1><div class="breadcrumbs"><a href="http://127.0.0.1/series/work/">خالتي قماشة</a><a href="/series/other/">عمل آخر</a></div><a href="/watch/other/episode-20/">عمل آخر الحلقة 20</a>';
  const graph = scanSourceGraph(html, seed, {
    provider: "mycima",
    domains: ["mycima.gdn"],
    details: { title: "خالتي قماشة الحلقة 19" },
  });
  assert.deepEqual(graph.parents, []);
  assert.deepEqual(
    graph.episodes.map((e) => e.episode),
    [19],
  );
});
test("beta resolves the selected source episode only, without a canonical provider search", async () => {
  const { service } = fixture(),
    admitted = await service.request(ref(seed));
  await service.settle();
  assert.equal(
    (await service.playback(admitted.ref, { season: 1, episode: 19 })).state,
    "running",
  );
  await service.settle();
  const result = await service.playback(admitted.ref, {
    season: 1,
    episode: 19,
  });
  assert.equal(result.state, "ready");
  assert.equal(result.servers[0].canonical_identity_verified, false);
  assert.equal(result.servers[0].episode, 19);
});
test("an incomplete or failed page remains partial, never a fabricated complete index", async () => {
  const { service } = fixture({ maxPages: 2 }),
    admitted = await service.request(ref(seed));
  await service.settle();
  const status = await service.status(admitted.ref);
  assert.equal(status.progress.partial, true);
  assert.equal(status.progress.page_limit_reached, true);
  await assert.rejects(
    service.request("tmdb:tv:42"),
    /BROWSER_SOURCE_REQUIRED/,
  );
});

test("all observed episode entry points resolve to the same actual source index", async () => {
  const { service } = fixture(),
    first = await service.request(ref(seed));
  await service.settle();
  const second = await service.request(ref(base + "/watch/work/episode-12/"));
  assert.equal(second.ref, first.ref);
});
test("beta restores its own cloud snapshot after restart without canonical caches or new scraping", async () => {
  let saved;
  const store = {
    get: async () => saved || null,
    save: async (document) => {
      saved = structuredClone(document);
    },
  };
  const first = fixture({ store }),
    admitted = await first.service.request(ref(seed));
  await first.service.settle();
  assert(saved);
  assert.equal(saved.details.servers, undefined);
  assert.equal(saved.details.media_sources, undefined);
  const second = fixture({ store });
  const restored = await second.service.details(admitted.ref);
  assert.deepEqual(
    restored.episodes.map((e) => e.episode_number),
    [1, 2, 12, 19],
  );
  assert.deepEqual(second.fetched, []);
});
test("a cloud outage does not block the independent beta index", async () => {
  const { service } = fixture({
    store: {
      get: async () => {
        throw Error("DB_DOWN");
      },
      save: async () => {
        throw Error("DB_DOWN");
      },
    },
  });
  const admitted = await service.request(ref(seed));
  await service.settle();
  assert.equal((await service.details(admitted.ref)).episodes.length, 4);
  assert.equal((await service.status(admitted.ref)).progress.cloud_error, true);
});
test("without a parent link, beta follows actual same-source search pagination", async () => {
  const html = "<h1>خالتي قماشة الحلقة 19</h1>",
    calls = [];
  const entry = {
    meta: { id: "mycima", domains: [base] },
    module: {
      scrapeDetails: async () => ({
        title: "خالتي قماشة الحلقة 19",
        type: "series",
        episodes: [],
      }),
      scrapeSearch: async (q, page) => {
        calls.push(page);
        const n = [1, 12, 19][page - 1];
        const hits = [
          {
            ref: ref(base + "/watch/work/episode-" + n + "/"),
            title: "خالتي قماشة الحلقة " + n,
          },
        ];
        Object.defineProperty(hits, "_meta", {
          value: { next_page: page < 3 ? page + 1 : null },
        });
        return hits;
      },
    },
  };
  const service = createBrowserWorkService({
    lookup: () => entry,
    fetchPage: async () => ({ html, url: seed }),
    store: null,
  });
  const admitted = await service.request(ref(seed));
  await service.settle();
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(
    (await service.details(admitted.ref)).episodes.map((e) => e.episode_number),
    [1, 12, 19],
  );
});

test("beta watch history regenerates the correct index from its original source after a cold restart", async () => {
  const first = fixture(),
    admitted = await first.service.request(ref(seed));
  await first.service.settle();
  const cold = fixture();
  const pending = await cold.service.playback(admitted.ref, {
    season: 1,
    episode: 19,
    origin: ref(seed),
  });
  assert.equal(pending.state, "running");
  await cold.service.settle();
  await cold.service.playback(admitted.ref, { season: 1, episode: 19 });
  await cold.service.settle();
  assert.equal(
    (await cold.service.playback(admitted.ref, { season: 1, episode: 19 }))
      .state,
    "ready",
  );
});

test('beta follows observed MyCima season switcher links without following unrelated bare season labels',()=>{
 const html='<ul class="SeasonsList"><li><a href="/series/work/season-2/">الموسم الثاني</a></li></ul><aside><a href="/series/unrelated/season-3/">الموسم الثالث</a></aside>';
 const graph=scanSourceGraph(html,parent,{provider:'mycima',domains:[new URL(base).hostname],details:{title:'خالتي قماشة',episodes:[]}});
 assert(graph.parents.includes(base+'/series/work/season-2/'));assert(!graph.parents.includes(base+'/series/unrelated/season-3/'));
});

test('Beta shows one card per observed episode while retaining alternative source references',async()=>{
 const original=pages.get(parent),alternative=base+'/watch/work/episode-19-alt/';
 pages.set(parent,original+'<a href="'+alternative+'">خالتي قماشة الحلقة 19</a>');
 try{
  const {service}=fixture();const admitted=await service.request(ref(seed));await service.settle();
  const details=await service.details(admitted.ref),status=await service.status(admitted.ref);
  assert.equal(details.episodes.length,4);assert.equal(details.number_of_episodes,4);
  assert.equal(new Set(details.episodes.map(e=>e.ref)).size,4);
  assert.equal(status.progress.episodes,4);assert.equal(status.progress.observed_references,5);
  assert.equal((await service.request(ref(alternative))).ref,admitted.ref);await service.settle();
 }finally{pages.set(parent,original);}
});
