import {sourceEpisodeEvidence} from "../scrapers/shared/source-episode-evidence.mjs";
import {resolveProviderMedia} from "../scrapers/shared/provider-media.mjs";
import {createOptionalCacheReader} from "../optional-cache.mjs";
import { createConcurrencyQueue } from "../scrapers/shared/concurrency.mjs";
import { getProvider } from "../scrapers/registry.mjs";
import { fetchProviderHtml } from "../scrapers/shared/http.mjs";
import {
  workReference,
  providerForReference,
  scraperReference,
  sourceWorkRef,
} from "../harvest/work-reference.mjs";
import { scanSourceGraph, referenceUrl } from "./source-graph.mjs";
import {
  directCandidate,
  identityTitle,
} from "../scrapers/content-discovery.mjs";
import { probeHarvestMedia } from "../harvest/media-probe.mjs";
import { mediaExpiry } from "../harvest/identity.mjs";
import {
  explicitEpisode,
  explicitSeason,
} from "../../shared/content-identity.js";
import { createBrowserStore } from "./store.mjs";
import { runInBrowserLane } from "./traffic.mjs";
/** Beta owns its crawl/cache/scheduler. No TMDB calls or canonical harvest jobs. */
export function createBrowserWorkService({
  lookup = getProvider,
  fetchPage = fetchProviderHtml,
  probe = probeHarvestMedia,
  now = Date.now,
  maxWorks = 128,
  maxPages = 400,
  store = createBrowserStore(),
} = {}) {
  const cloudRead=createOptionalCacheReader({budgetMs:400,now});
  const persisting = new Set(),
    resolving = new Map(),
    mediaTasks = new Set();
  const works = new Map(),
    aliases = new Map(),
    pending = new Map(),
    media = new Map(),
    adapters = new Map();
  const globalQueue = createConcurrencyQueue({ concurrency: 2, maxQueued: 80 });
  const mediaQueue = createConcurrencyQueue({ concurrency: 2, maxQueued: 40 });
  function adapter(id) {
    if (adapters.has(id)) return adapters.get(id);
    const entry = lookup(id);
    if (!entry || entry.meta.enabled === false || entry.meta.mirrorOf)
      throw Error("BROWSER_PROVIDER_UNAVAILABLE");
    const value = {
      ...entry,
      queue: createConcurrencyQueue({ concurrency: 1, maxQueued: 40 }),
      mediaQueue: createConcurrencyQueue({ concurrency: 1, maxQueued: 20 }),
    };
    adapters.set(id, value);
    return value;
  }
  const network = {
    strict: true,
    allowHttp: false,
    timeoutMs: 6500,
    maxRetries: 0,
  };
  const displayTitle = (w) =>
    String(
      w.details.series_title ||
        w.details.parent_title ||
        w.details.title ||
        w.title,
    )
      .replace(/^(?:(?:مشاهدة|تحميل|مسلسل|فيلم)\s+)+/, "")
      .replace(
        w.details.type === "movie"
          ? /$^/
          : /\s*(?:الحلقة|الحلقه|حلقة|حلقه|episode)\s*\d+.*$/i,
        "",
      )
      .trim();
  const keyOf = (ref) =>
    aliases.get(ref) || aliases.get(workReference(ref)) || workReference(ref);
  function get(ref) {
    const key = keyOf(ref),
      work = works.get(key);
    if (!work || work.expires < now()) throw Error("BROWSER_INDEX_EXPIRED");
    return work;
  }
  function persist(work) {
    if (!store) return;
    work.persistDirty = true;
    if (work.persisting) return;
    work.persisting = true;
    const task = (async () => {
      try {
        while (work.persistDirty) {
          work.persistDirty = false;
          await store.save({
            ref: work.ref,
            provider: work.provider,
            original: work.original,
            root: work.root,
            title: work.title,
            details: work.details,
            episodes: [...work.episodes.values()],
            seen: [...work.seen],
            frontier: work.frontier,
            failed: [...work.failed],
            updated: work.updated,
            expires: work.expires,
            aliases: [
              work.ref,
              ...[...aliases]
                .filter(([, v]) => v === work.ref)
                .map(([k]) => k)
                .filter(sourceWorkRef),
            ],
          });
          work.cloudSaved = true;
          work.cloudError = false;
        }
      } catch {
        work.cloudError = true;
      } finally {
        work.persisting = false;
      }
    })();
    persisting.add(task);
    task.finally(() => persisting.delete(task));
  }
  async function hydrate(ref) {
    try {
      return get(ref);
    } catch {}
    if (!store) return null;
    let key;
    try {
      key = workReference(ref);
    } catch {
      return null;
    }
    let saved;
    try {
      saved = await cloudRead(key,()=>store.get(key));
    } catch {
      return null;
    }
    if (!saved) return null;
    if (
      !sourceWorkRef(saved.ref) ||
      !saved.original ||
      providerForReference(saved.original) !== saved.provider
    )
      return null;
    const entry = adapter(saved.provider),
      domains = entry.meta.domains.map((d) => new URL(d).hostname);
    const root = referenceUrl(saved.root, domains),
      episodes = new Map();
    for (const row of saved.episodes || []) {
      try {
        referenceUrl(row.source_ref, domains);
        if (
          !Number.isSafeInteger(row.season) ||
          !Number.isSafeInteger(row.episode) ||
          row.season < 0 ||
          row.season > 100 ||
          row.episode < 1 ||
          row.episode > 100000
        )
          continue;
        episodes.set(row.source_ref, row);
      } catch {}
    }
    const stale = saved.expires < now();
    const work = {
      ...saved,
      adapter: entry,
      domains,
      root,
      rootConfirmed: true,
      episodes,
      seen: new Set(stale ? [] : saved.seen),
      failed: new Set(saved.failed),
      frontier: stale ? [root] : saved.frontier || [],
      running: false,
      expires: now() + 1800000,
      cloudSaved: true,
    };
    works.set(work.ref, work);
    for (const a of saved.aliases || [])
      if (sourceWorkRef(a)) aliases.set(a, work.ref);
    aliases.set(key, work.ref);
    if (work.frontier.length) schedule(work);
    return work;
  }
  function schedule(work) {
    if (work.running || !work.frontier.length || work.seen.size >= maxPages)
      return;
    work.running = true;
    const task = globalQueue.run(() =>
      work.adapter.queue.run(() =>
        runInBrowserLane(async () => {
          let steps = 0;
          while (
            work.frontier.length &&
            steps++ < 4 &&
            work.seen.size < maxPages
          ) {
            work.domains = work.adapter.meta.domains.map(
              (d) => new URL(d).hostname,
            );
            const node = work.frontier.shift();
            if (node && typeof node === "object" && node.search) {
              const searchKey = "search:" + node.page;
              if (work.seen.has(searchKey)) continue;
              work.seen.add(searchKey);
              try {
                const hits = await work.adapter.module.scrapeSearch(
                  node.search,
                  node.page,
                  { ...network, searchPageUrl: node.next_url },
                );
                if (
                  hits?._meta?.errorCode &&
                  hits._meta.errorCode !== "EMPTY_RESULT"
                )
                  throw Error(hits._meta.errorCode);
                for (const hit of Array.isArray(hits)
                  ? hits
                  : hits?.items || []) {
                  if (identityTitle(hit.title) !== identityTitle(work.title))
                    continue;
                  const cut = (t) =>
                    /مدبلج|dubbed/i.test(t)
                      ? "dubbed"
                      : /مترجم|subtit/i.test(t)
                        ? "subtitled"
                        : null;
                  if (
                    cut(hit.title) &&
                    cut(work.title) &&
                    cut(hit.title) !== cut(work.title)
                  )
                    continue;
                  if (
                    work.details.year &&
                    hit.year &&
                    String(work.details.year) !== String(hit.year)
                  )
                    continue;
                  const href = referenceUrl(hit.ref || hit.url, work.domains),
                    number =
                      explicitEpisode(hit.title, href) ||
                      Number(hit.episode_number);
                  if (number) {
                    const source_ref =
                      hit.ref ||
                      work.provider +
                        ":" +
                        Buffer.from(href).toString("base64url");
                    work.episodes.set(source_ref, {
                      url: href,
                      source_ref,
                      title: hit.title,
                      season:
                        explicitSeason(hit.title, href) ||
                        Number(hit.season_number) ||
                        1,
                      episode: number,
                    });
                    aliases.set(workReference(source_ref), work.ref);
                  } else if (
                    !work.seen.has(href) &&
                    !work.frontier.includes(href)
                  )
                    work.frontier.unshift(href);
                }
                const next = Number(
                  hits?._meta?.next_page || hits?.pagination?.next_page,
                );
                if (Number.isSafeInteger(next) && next > node.page)
                  work.frontier.push({
                    search: node.search,
                    page: next,
                    next_url: hits?._meta?.next_url,
                  });
                work.updated = new Date(now()).toISOString();
              } catch (error) {
                work.reason = /^[A-Z][A-Z0-9_]{2,79}$/.test(
                  error.code || error.message,
                )
                  ? error.code || error.message
                  : "BROWSER_SEARCH_UNAVAILABLE";
                work.searchFailed = true;
              }
              continue;
            }
            const url = node;
            if (work.seen.has(url)) continue;
            work.seen.add(url);
            try {
              const response = await fetchPage(url, {
                ...network,
                allowedHosts: work.domains,
                providerId: work.provider,
              });
              const details = await work.adapter.module.scrapeDetails(url,network);
              if (!details?.title) throw Error("BROWSER_METADATA_MISSING");
              if (
                work.title &&
                (identityTitle(details.title) !== identityTitle(work.title) ||
                  (work.details.year &&
                    details.year &&
                    String(work.details.year) !== String(details.year)))
              )
                throw Error("BROWSER_WORK_IDENTITY_CONFLICT");
              const graph = scanSourceGraph(
                response.html,
                response.url || url,
                { provider: work.provider, domains: work.domains, details },
              );
              if(details.observed_parent_ref){const parent=referenceUrl(details.observed_parent_ref,work.domains);if(parent!==url&&!graph.parents.includes(parent))graph.parents.unshift(parent);}
              work.title = work.title || details.title;
              work.details = {
                ...work.details,
                ...Object.fromEntries(
                  [
                    "title",
                    "type",
                    "year",
                    "overview",
                    "story",
                    "genres",
                    "runtime_minutes",
                    "series_title",
                    "parent_title",
                  ]
                    .filter((k) => details[k] !== undefined)
                    .map((k) => [k, details[k]]),
                ),
                poster: details.poster || work.details?.poster || "",
              };
              for (const row of graph.episodes) {
                work.episodes.set(row.source_ref, row);
                aliases.set(workReference(row.source_ref), work.ref);
              }
              if(response.url&&response.url!==url)aliases.set(workReference(work.provider+':'+Buffer.from(response.url).toString('base64url')),work.ref);
              if (!explicitEpisode(details.title, url))
                aliases.set(
                  workReference(
                    work.provider +
                      ":" +
                      Buffer.from(url).toString("base64url"),
                  ),
                  work.ref,
                );
              if (!explicitEpisode(details.title, url) && !work.rootConfirmed) {
                work.root = details.observed_parent_ref?referenceUrl(details.observed_parent_ref,work.domains):url;
                work.rootConfirmed = true;
              }
              for (const next of details.type === "movie"
                ? []
                : [
                    ...graph.parents,
                    ...graph.pages,
                    ...(!graph.parents.length &&
                    !graph.pages.length &&
                    graph.episodes.length <= 1
                      ? graph.neighbors
                      : []),
                  ])
                if (!work.seen.has(next) && !work.frontier.includes(next))
                  work.frontier.push(next);
              if (
                !work.searchStarted &&
                work.adapter.module.scrapeSearch &&
                !graph.parents.length &&
                !graph.pages.length &&
                graph.episodes.length <= 1 &&
                details.type !== "movie"
              ) {
                work.searchStarted = true;
                work.frontier.unshift({
                  search: identityTitle(work.title),
                  page: 1,
                });
              }
              work.updated = new Date(now()).toISOString();
              if (!work.searchFailed) work.reason = null;
            } catch (error) {
              work.failed.add(url);
              work.reason = /^[A-Z][A-Z0-9_]{2,79}$/.test(
                error.code || error.message,
              )
                ? error.code || error.message
                : "BROWSER_SOURCE_UNAVAILABLE";
            }
          }
        }),
      ),
    );
    pending.set(work.ref, task);
    task
      .catch((error) => {
        work.reason = error.code || "BROWSER_SOURCE_UNAVAILABLE";
      })
      .finally(() => {
        pending.delete(work.ref);
        work.running = false;
        persist(work);
        if (work.frontier.length && work.seen.size < maxPages) schedule(work);
      });
  }
  function request(ref, { reason = "card_open" } = {}) {
    if (String(ref).startsWith("tmdb:")) throw Error("BROWSER_SOURCE_REQUIRED");
    let work;
    try {
      work = get(ref);
    } catch (error) {
      if (sourceWorkRef(ref)) throw error;
    }
    if (
      !work &&
      works.size >= maxWorks &&
      [...works.values()].every((w) => w.running)
    )
      throw Error("BROWSER_BUSY");
    if (!work) {
      const provider = providerForReference(ref),
        entry = adapter(provider),
        domains = entry.meta.domains.map((d) => new URL(d).hostname),
        url = referenceUrl(scraperReference(ref), domains),
        key = workReference(ref);
      work = {
        ref: key,
        provider,
        adapter: entry,
        domains,
        original: ref,
        root: url,
        title: "",
        details: {},
        episodes: new Map(),
        seen: new Set(),
        failed: new Set(),
        frontier: [url],
        running: false,
        updated: new Date(now()).toISOString(),
        expires: now() + 1800000,
        reason: null,
      };
      works.set(key, work);
      aliases.set(ref, key);
      while (works.size > maxWorks) {
        const first = [...works].find(([, w]) => !w.running);
        if (!first) break;
        works.delete(first[0]);
        for (const [a, k] of aliases) if (k === first[0]) aliases.delete(a);
      }
    }
    if (["source_refresh", "retry"].includes(reason) && !work.running) {
      work.frontier = [work.root, ...work.failed];
      work.episodes.clear();
      work.seen.clear();
      work.failed.clear();
      work.searchStarted = false;
      work.searchFailed = false;
      work.reason = null;
    }
    schedule(work);
    if (!work.running) persist(work);
    return {
      ref: work.ref,
      state: work.title ? "ready" : "running",
      requested_at: work.updated,
      poll_after_ms: 500,
    };
  }
  function status(ref) {
    const w = get(ref),
      available = Boolean(
        w.title && (w.details.type === "movie" || w.episodes.size),
      );
    return {
      state:
        w.running || w.frontier.length
          ? "running"
          : w.reason && !available
            ? "failed"
            : "ready",
      reason: w.reason,
      index_state: w.running ? "indexing" : w.reason ? "partial" : "ready",
      index_updated_at: w.updated,
      discovery_updated_at: w.updated,
      source_editions: [
        { ref: w.ref, provider: w.provider, title: w.title, available },
      ],
      progress: {
        visited_pages: w.seen.size,
        pending_pages: w.frontier.length,
        episodes: w.episodes.size,
        partial: w.running || w.frontier.length > 0 || w.failed.size > 0,
        cloud_saved: w.cloudSaved === true,
        cloud_error: w.cloudError === true,
        page_limit_reached: w.seen.size >= maxPages,
      },
    };
  }
  function details(ref, { season = 1, offset = 0 } = {}) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(season) ||
      season < 0 ||
      season > 100
    )
      throw Error("BROWSER_BAD_PAGE");
    const w = get(ref);
    if (!w.title) throw Error("SOURCE_INDEX_PENDING");
    const episodes = [...w.episodes.values()].sort(
        (a, b) => a.season - b.season || a.episode - b.episode,
      ),
      seasons = [...new Set(episodes.map((e) => e.season))].sort(
        (a, b) => a - b,
      );
    const selected = seasons.includes(Number(season))
      ? Number(season)
      : seasons[0] || 0;
    const rows = episodes.filter((e) => e.season === selected),
      page = rows.slice(offset, offset + 100);
    return {
      ...w.details,
      ref: w.ref,
      title: displayTitle(w),
      source_title: displayTitle(w),
      source_ref: w.original,
      source_work_ref: w.ref,
      provider: w.provider,
      identity_scope: "source",
      source_index_authoritative: true,
      canonical_identity_verified: false,
      type: w.details.type === "movie" ? "movie" : "series",
      source_poster: w.details.poster || "",
      observed_overview: w.details.overview || w.details.story || "",
      seasons: seasons.map((n) => ({
        season_number: n,
        episode_count: new Set(
          episodes.filter((e) => e.season === n).map((e) => e.episode),
        ).size,
      })),
      available_seasons: seasons,
      season_number: selected,
      episodes: page.map((e) => ({
        ref: w.ref + ":s" + e.season + ":e" + e.episode,
        title: e.title,
        episode_number: e.episode,
        season_number: e.season,
        watch_available: true,
      })),
      episode_pagination: {
        has_more: rows.length > offset + 100,
        next_offset: rows.length > offset + 100 ? offset + 100 : null,
      },
      browser_progress: status(ref).progress,
    };
  }
  async function playback(
    ref,
    { season = 0, episode = 0, platform = "native", refresh = false } = {},
  ) {
    const w = get(ref);
    if (!w.title) return { state: "running", poll_after_ms: 1000 };
    const movie = w.details.type === "movie";
    if (
      ![season, episode].every(Number.isSafeInteger) ||
      season < 0 ||
      season > 100 ||
      episode < 0 ||
      episode > 100000
    )
      throw Error("HARVEST_BAD_EPISODE");
    const key = w.ref + ":" + season + ":" + episode,
      cached = media.get(key);
    if (!refresh && cached?.expires > now() + 30000) {
      const servers = cached.servers.filter(
        (s) => platform !== "web" || s.web_playable,
      );
      return {
        state: servers.length ? "ready" : "unavailable",
        servers,
        reason: servers.length ? null : "PINNED_DIRECT_WEB_UNAVAILABLE",
        cache_hit: true,
      };
    }
    const rows = movie
      ? [{ source_ref: w.original, url: w.root, season: 0, episode: 0 }]
      : [...w.episodes.values()].filter(
          (e) => e.season === season && e.episode === episode,
        );
    if (!rows.length)
      return w.running
        ? { state: "running", poll_after_ms: 1000 }
        : { state: "unavailable", reason: "SOURCE_EPISODE_NOT_FOUND" };
    const existing = resolving.get(key);
    if (existing?.state === "running")
      return { state: "running", poll_after_ms: 1000 };
    if (
      !refresh &&
      existing?.result &&
      existing.state !== "ready" &&
      now() - (existing.finished || 0) < 60000
    )
      return existing.result;
    if (resolving.size >= 128) {
      const first = [...resolving].find(([, job]) => job.state !== "running");
      if (first) resolving.delete(first[0]);
      else return { state: "running", poll_after_ms: 1500 };
    }
    const job = { state: "running" };
    resolving.set(key, job);
    const task = mediaQueue
      .run(() =>
        w.adapter.mediaQueue.run(() =>
          runInBrowserLane(async () => {
            const servers = [];
            for (const row of rows) {
              const d = await w.adapter.module.scrapeDetails(
                row.source_ref,
                network,
              );
              const indexedEvidence=sourceEpisodeEvidence(d,row.source_ref,w.domains);
              if (
                identityTitle(d.title) !== identityTitle(w.title) ||
                (d.year &&
                  w.details.year &&
                  String(d.year) !== String(w.details.year)) ||
                (!movie &&
                  ((explicitEpisode(d.title, row.url) ||
                    Number(d.episode_number)||indexedEvidence?.episode_number) !== episode ||
                    (explicitSeason(d.title, row.url) ||
                      Number(d.season_number) ||indexedEvidence?.season_number||
                      row.season) !== season))
              )
                throw Error("BROWSER_EPISODE_IDENTITY_CONFLICT");
              const chosen=await resolveProviderMedia(w.adapter,row.source_ref,{details:d,network,accept:async candidates=>{
               const accepted=[];
              for (const candidate of candidates) {
                const expiry = mediaExpiry(candidate, now());
                if (!expiry) continue;
                const checked = await probe(candidate, { platform: "native" });
                if (!checked.playable || checked.container_verified!==true || (platform==='web'&&checked.webPlayable!==true)) continue;
                const headers = {};
                for (const [k, v] of Object.entries(candidate.headers || {}))
                  if (
                    ["referer", "origin", "user-agent", "cookie"].includes(
                      k.toLowerCase(),
                    ) &&
                    typeof v === "string" &&
                    v.length <= 8192 &&
                    !/[\r\n]/.test(v)
                  )
                    headers[k] = v;
                accepted.push({
                  ...candidate,
                  kind: "direct",
                  headers,
                  provider: w.provider,
                  provider_id: w.provider,
                  source_ref: row.source_ref,
                  identity_verified: true,
                  canonical_identity_verified: false,
                  web_playable: checked.webPlayable === true,
                  expires_at: new Date(expiry).toISOString(),
                  season: movie ? 0 : season,
                  episode: movie ? 0 : episode,
                  observed_identity: {
                    season: movie ? 0 : season,
                    episode: movie ? 0 : episode,
                  },
                });
                return accepted;
              }
               return accepted;
              }});
              servers.push(...chosen);if(chosen.length)break;
            }
            if (servers.length) {
              media.set(key, {
                servers,
                expires: Math.min(
                  ...servers.map((s) => Date.parse(s.expires_at)),
                ),
              });
              while (media.size > 128) media.delete(media.keys().next().value);
            }
            const visible = servers.filter(
              (s) => platform !== "web" || s.web_playable,
            );
            return {
              state: visible.length ? "ready" : "unavailable",
              servers: visible,
              reason: visible.length ? null : "DIRECT_MEDIA_NOT_FOUND",
            };
          }),
        ),
      )
      .then((result) => {
        job.state = result.state;
        job.result = result;
        job.finished = now();
      })
      .catch((error) => {
        job.state = "unavailable";
        job.finished = now();
        job.result = {
          state: "unavailable",
          reason: /^[A-Z][A-Z0-9_]{2,79}$/.test(error.code || error.message)
            ? error.code || error.message
            : "BROWSER_MEDIA_UNAVAILABLE",
        };
      })
      .finally(() => mediaTasks.delete(task));
    mediaTasks.add(task);
    return { state: "running", poll_after_ms: 1000 };
  }
  return {
    request: (...args) =>
      runInBrowserLane(async () => {
        await hydrate(args[0]);
        return request(...args);
      }),
    status: (...args) =>
      runInBrowserLane(async () => {
        await hydrate(args[0]);
        return status(...args);
      }),
    details: (...args) =>
      runInBrowserLane(async () => {
        await hydrate(args[0]);
        return details(...args);
      }),
    playback: (...args) =>
      runInBrowserLane(async () => {
        let work = await hydrate(args[0]);
        if (!work && args[1]?.origin) {
          const origin = args[1].origin;
          if (
            providerForReference(origin) !==
            providerForReference(String(args[0]).split(":")[1] + ":x")
          )
            throw Error("BROWSER_SOURCE_REQUIRED");
          await hydrate(origin);
          request(origin, { reason: args[1]?.refresh ? "retry" : "card_open" });
          try {
            work = get(args[0]);
          } catch {}
          if (!work) {
            const pendingWork = get(origin);
            return pendingWork.running
              ? { state: "running", poll_after_ms: 1000 }
              : { state: "unavailable", reason: "BROWSER_INDEX_EXPIRED" };
          }
        }
        return playback(...args);
      }),
    metrics: () => ({
      scope: "beta",
      works: works.size,
      pending: pending.size,
      queue: globalQueue.metrics(),
      media_queue: mediaQueue.metrics(),
    }),
    settle: async () => {
      while (pending.size || persisting.size || mediaTasks.size)
        await Promise.allSettled([
          ...pending.values(),
          ...persisting,
          ...mediaTasks,
        ]);
    },
  };
}
