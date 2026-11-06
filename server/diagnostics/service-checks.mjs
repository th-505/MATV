import {cascadeResolveStream} from '../scrapers/stream-unwrapper.mjs';
import {resolveProviderMedia} from "../scrapers/shared/provider-media.mjs";
import { randomUUID } from "node:crypto";
import { createConcurrencyQueue } from "../scrapers/shared/concurrency.mjs";
import {
  getProvider,
  listIndependentProviders,
} from "../scrapers/registry.mjs";
import { fetchSafeResponse } from "../scrapers/shared/http.mjs";
import {
  directCandidate,
  identityTitle,
} from "../scrapers/content-discovery.mjs";
import { probeHarvestMedia } from "../harvest/media-probe.mjs";
import { runInBrowserLane, runInDiagnosticLane } from "../browser/traffic.mjs";
import {getProvider as getBetaProvider, listIndependentProviders as listBetaProviders} from '../browser/registry.mjs';
export function createServiceChecks({
  tmdb,
  database,
  providers = listIndependentProviders,
  lookup = getProvider,
  betaLookup = lookup === getProvider ? getBetaProvider : lookup,
  betaProviders = providers === listIndependentProviders ? listBetaProviders : providers,
  fetchResponse = fetchSafeResponse,
  probe = probeHarvestMedia,
  now = Date.now,
} = {}) {
  const jobs = new Map(),
    queue = createConcurrencyQueue({ concurrency: 4, maxQueued: 100 });
  let recent = null;
  const reason = (e) =>
    /^[A-Z][A-Z0-9_]{2,79}$/.test(e?.code || e?.message)
      ? e.code || e.message
      : "SERVICE_UNAVAILABLE";
  async function providerCheck(id, scope) {
    return (scope === "beta" ? runInBrowserLane : runInDiagnosticLane)(
      async () => {
        const entry = (scope === 'beta' ? betaLookup : lookup)(id),
          stages = [];
        if (!entry || entry.meta.enabled === false)
          return { state: "disabled", stages };
        const options = {
          strict: true,
          allowHttp: false,
          timeoutMs: 5000,
          maxRetries: 0,
        };
        const step = async (name, fn) => {
          try {
            const value = await fn();
            stages.push({ stage: name, state: "passed", ...(name==='media'&&value?.verified_sources?{verified_sources:value.verified_sources,server_scan:value.server_scan}: {}) });
            return value;
          } catch (e) {
            stages.push({ stage: name, state: "failed", reason: reason(e) });
            return null;
          }
        };
        const rows = await step("catalog", async () => {
          const value = await entry.module.scrapeCatalog(undefined, 1, options);
          if (value?._meta?.errorCode) throw Error(value._meta.errorCode);
          if (!Array.isArray(value) || !value.length)
            throw Error("EMPTY_UNCONFIRMED");
          return value;
        });
        if (!rows) return { state: "failed", stages };
        const sample = rows[0],
          source = sample.ref || sample.url;
        if (entry.meta.capabilities?.search && entry.module.scrapeSearch)
          await step("search", async () => {
            const hits = await entry.module.scrapeSearch(
              identityTitle(sample.title),
              1,
              options,
            );
            if (hits?._meta?.errorCode) throw Error(hits._meta.errorCode);
            if (!Array.isArray(hits) || !hits.some(hit=>identityTitle(hit.title)===identityTitle(sample.title)))
              throw Error("SEARCH_UNCONFIRMED");
            const negative=await entry.module.scrapeSearch('najd_probe_'+randomUUID().replaceAll('-',''),1,options);
            if(!Array.isArray(negative)||negative.length||(negative?._meta?.errorCode&&negative._meta.errorCode!=='EMPTY_RESULT'))throw Error('SEARCH_QUERY_NOT_RESPECTED');
            return hits;
          });
        const details = await step("details", async () => {
          const d = await entry.module.scrapeDetails(source, options);
          if (!d?.title) throw Error("DETAILS_UNAVAILABLE");
          return d;
        });
        if (!details) return { state: "partial", stages };
        await step("media", async () => {
          const episode = details.episodes?.find((e) => e.ref || e.url),
            target = episode?.ref || episode?.url || source;
          const accepted=await resolveProviderMedia(entry,target,{details:episode?{}:details,network:options,resolveEmbed:(target,parent,deadline)=>cascadeResolveStream(target,parent,0,new Set(),deadline),accept:async candidates=>{
           for(const candidate of candidates){const result=await probe(candidate,{platform:'native'});if(result.playable&&result.container_verified)return[candidate]}return[];
          }});
          if(!accepted.length)throw Error('DIRECT_MEDIA_NOT_FOUND');
          return {verified_sources:accepted.length,server_scan:accepted._meta||null};

        });
        return {
          state: stages.every((s) => s.state === "passed")
            ? "passed"
            : "partial",
          stages,
        };
      },
    );
  }
  function start(scope = "all") {
    if (
      !["all", "najd", "beta", "tmdb", "subtitles", "database"].includes(scope)
    )
      throw Error("INVALID_CHECK_SCOPE");
    if (recent && now() - recent.created < 30000 && recent.scope === scope)
      return snapshot(recent);
    for (const [id, j] of jobs) if (now() - j.created > 600000) jobs.delete(id);
    if ([...jobs.values()].some((j) => j.state === "running"))
      throw Error("CHECK_ALREADY_RUNNING");
    const job = {
      id: randomUUID(),
      scope,
      created: now(),
      state: "running",
      checks: [],
    };
    jobs.set(job.id, job);
    recent = job;
    const tasks = [];
    function add(id, label, task) {
      const row = { id, label, state: "queued" };
      job.checks.push(row);
      tasks.push(
        queue.run(async () => {
          row.state = "running";
          const began = now();
          try {
            Object.assign(row, await task());
          } catch (error) {
            row.state = "failed";
            row.reason = reason(error);
          }
          row.duration_ms = now() - began;
        }),
      );
    }
    if (["all", "tmdb"].includes(scope))
      add("tmdb", "TMDB", async () => {
        const result = await tmdb.details("tmdb:movie:550");
        if (!result?.data?.title) throw Error("TMDB_UNAVAILABLE");
        return { state: "passed" };
      });
    if (["all", "database"].includes(scope))
      add("database", "قاعدة البيانات", async () => {
        if (!database) throw Error("DATABASE_NOT_CONFIGURED");
        await database();
        return { state: "passed" };
      });
    if (["all", "subtitles"].includes(scope))
      add("subtitles", "خدمة الترجمة", async () => {
        const r = await fetchResponse(
          "https://opensubtitles-v3.strem.io/subtitles/movie/tt0137523.json",
          {
            allowHttp: false,
            maxRetries: 0,
            timeoutMs: 6000,
            maxBytes: 512000,
          },
        );
        const data = JSON.parse(r.html || "{}");
        if (!Array.isArray(data.subtitles))
          throw Error("SUBTITLE_SERVICE_UNAVAILABLE");
        return {
          state: data.subtitles.length ? "passed" : "partial",
          reason: data.subtitles.length ? null : "EMPTY_UNCONFIRMED",
        };
      });
    for (const mode of ["najd", "beta"])
      if (scope === "all" || scope === mode)
        for (const provider of (mode === 'beta' ? betaProviders : providers)().filter(
          (p) => p.capabilities?.catalog,
        ))
          add(
            mode + ":" + provider.id,
            (mode === "beta" ? "بيتا · " : "نجد · ") + provider.name,
            () => providerCheck(provider.id, mode),
          );
    Promise.allSettled(tasks).then(() => {
      job.state = "ready";
    });
    return snapshot(job);
  }
  const snapshot = (job) => ({
    id: job.id,
    scope: job.scope,
    state: job.state,
    checks: structuredClone(job.checks),
    finished: job.checks.filter((r) => !["queued", "running"].includes(r.state))
      .length,
    total: job.checks.length,
  });
  return {
    start,
    status: (id) => {
      const job = jobs.get(id);
      if (!job) throw Error("CHECK_EXPIRED");
      return snapshot(job);
    },
  };
}
