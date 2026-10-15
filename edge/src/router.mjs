const PROVIDERS = ["3isk", "akoam", "alooy", "laroza"];
const BINDINGS = {
  "3isk": "ISK",
  akoam: "AKOAM",
  alooy: "ALOOY",
  laroza: "LAROZA",
};
const CACHE_VERSION = "v4";
const EXPIRY_SAFETY_MS = 30000;
const RESOLUTION_RESPONSE_BYTES = 12288;
const jsonBytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
function arabicCaption(track) {
  return [track?.language, track?.label].some((value) =>
    /^(?:ar|ara|arabic|العربية)(?:$|[-_\s(])/i.test(String(value || "").trim()),
  );
}
// Captions are optional metadata. They must not turn a healthy video into a
// failed resolution merely because a caption URL contains a long signed token.
// Budget complete JSON values, never substrings of URLs or request headers.
function budgetResolution(result) {
  // A subsequent cache hit adds this field. Reserve its bytes now so cached
  // responses obey the same contract as cold responses.
  let bytes = jsonBytes({ ...result, cached: true });
  const captions = result.sources.flatMap((source, sourceIndex) => {
    if (!Array.isArray(source.subtitles)) return [];
    source.subtitles = [...source.subtitles].sort(
      (a, b) => Number(arabicCaption(b)) - Number(arabicCaption(a)),
    );
    return source.subtitles.map((track, trackIndex) => ({
      source,
      sourceIndex,
      track,
      trackIndex,
      arabic: arabicCaption(track),
      bytes: jsonBytes(track),
    }));
  });
  // Discard non-Arabic tracks first, then extra Arabic alternatives. Keep the
  // first caption on each source as long as the response budget permits.
  captions.sort(
    (a, b) =>
      Number(a.arabic) - Number(b.arabic) ||
      b.trackIndex - a.trackIndex ||
      b.sourceIndex - a.sourceIndex,
  );
  for (const caption of captions) {
    if (bytes <= RESOLUTION_RESPONSE_BYTES) break;
    const tracks = caption.source.subtitles;
    const index = tracks.indexOf(caption.track);
    bytes -= caption.bytes + Number(tracks.length > 1);
    tracks.splice(index, 1);
  }
  // Only after optional captions have gone may video alternatives be removed.
  // Remove the largest duplicate-provider row first, retaining at least one
  // complete source from each healthy provider whenever those rows can fit.
  while (bytes > RESOLUTION_RESPONSE_BYTES && result.sources.length) {
    const counts = new Map();
    for (const source of result.sources)
      counts.set(source.provider_id, (counts.get(source.provider_id) || 0) + 1);
    const extras = result.sources.filter((source) => counts.get(source.provider_id) > 1);
    const candidates = extras.length ? extras : result.sources;
    const source = candidates.reduce((largest, next) =>
      jsonBytes(next) >= jsonBytes(largest) ? next : largest,
    );
    bytes -= jsonBytes(source) + Number(result.sources.length > 1);
    result.sources.splice(result.sources.indexOf(source), 1);
  }
  result.status = result.sources.length ? "success" : "unavailable";
  // Status changes when every individually oversized row has been discarded.
  // The remaining envelope is bounded separately rather than truncated.
  if (jsonBytes({ ...result, cached: true }) > RESOLUTION_RESPONSE_BYTES)
    throw Error("RESPONSE_TOO_LARGE");
  return result;
}
// Responses contain metadata only. Bound every service/cache JSON read as well.
async function boundedJson(response, limit = 131072) {
  if (Number(response.headers.get("Content-Length")) > limit) {
    await response.body?.cancel();
    throw Error("RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw Error("RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function activeSources(data, now = Date.now()) {
  return (
    Array.isArray(data?.sources) &&
    data.sources.length > 0 &&
    data.sources.length <= 8 &&
    data.sources.every(
      (source) => Date.parse(source.expires_at) > now + EXPIRY_SAFETY_MS,
    )
  );
}
async function cachedResult(key, hasSources) {
  const response = await caches.default.match(key);
  if (!response) return null;
  try {
    const until = Number(response.headers.get("X-MITV-Cache-Until"));
    if (!Number.isFinite(until) || until <= Date.now()) return null;
    const data = await boundedJson(response);
    return data.status === "success" && (!hasSources || activeSources(data))
      ? data
      : null;
  } catch {
    // Corrupt or stale cache entries never block fresh resolution.
    return null;
  }
}
function cacheResult(key, data, ctx, maximum = 60, hasSources = true) {
  const lifetime = hasSources
    ? Math.min(
        maximum,
        ...data.sources.map((source) =>
          Math.floor(
            (Date.parse(source.expires_at) - Date.now() - EXPIRY_SAFETY_MS) /
              1000,
          ),
        ),
      )
    : maximum;
  if (lifetime > 0)
    ctx.waitUntil(
      caches.default
        .put(
          key,
          Response.json(data, {
            headers: {
              "Cache-Control": `public,max-age=${lifetime}`,
              "X-MITV-Cache-Until": String(Date.now() + lifetime * 1000),
            },
          }),
        )
        .catch(() => {
          console.warn(JSON.stringify({ event: "edge_cache_write_failed" }));
        }),
    );
}
async function permitted(binding, key) {
  // A missing/failed limiter must not silently expose an unguarded gateway.
  if (!binding || typeof binding.limit !== "function")
    throw Error("RATE_LIMITER_UNAVAILABLE");
  try {
    return (await binding.limit({ key })).success === true;
  } catch {
    throw Error("RATE_LIMITER_UNAVAILABLE");
  }
}
// Route names, parameters and canonical cache keys are all defined locally.
// A client cannot turn the metadata gateway into an arbitrary URL fetcher.
function larozaTarget(url) {
  const route = {
    "/v1/laroza/category": "/category",
    "/v1/laroza/search": "/search",
    "/v1/laroza/details": "/details",
  }[url.pathname];
  if (!route) return null;
  const allowed =
    route === "/category"
      ? ["section", "page", "refresh"]
      : route === "/search"
        ? ["q", "page", "refresh"]
        : ["ref", "refresh"];
  for (const [key] of url.searchParams)
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw Error("BAD_CATALOG_QUERY");
  const target = new URL("https://laroza.internal" + route);
  if (route === "/details") {
    const ref = url.searchParams.get("ref") || "";
    if (ref.length > 1500 || !/^laroza:[A-Za-z0-9_-]+$/.test(ref))
      throw Error("BAD_REFERENCE");
    target.searchParams.set("ref", ref);
  } else {
    const page = url.searchParams.get("page") ?? "1";
    if (!/^[1-9][0-9]{0,3}$/.test(page) || Number(page) > 1000)
      throw Error("BAD_CATALOG_QUERY");
    if (route === "/category") {
      const section = url.searchParams.get("section") ?? "latest";
      if (!["latest", "movies", "series", "anime"].includes(section))
        throw Error("BAD_CATALOG_QUERY");
      target.searchParams.set("section", section);
    } else {
      const query = (url.searchParams.get("q") || "").trim().normalize("NFC");
      if (query.length < 2 || query.length > 120 || /[\x00-\x1f\x7f]/.test(query))
        throw Error("BAD_CATALOG_QUERY");
      target.searchParams.set("q", query);
    }
    target.searchParams.set("page", page);
  }
  return target;
}
function metadataOnly(data) {
  const pending = [data];
  let values = 0;
  while (pending.length) {
    if (++values > 10000) return false;
    const value = pending.pop();
    if (typeof value === "string") {
      if (/^https?:\/\/.+\.(?:m3u8|mp4|mpd|mkv|webm|ts)(?:$|[?#])/i.test(value))
        return false;
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["stream_url", "media_url", "video_url"].includes(key) && child)
          return false;
        pending.push(child);
      }
    }
  }
  return true;
}
export async function refKey(ref) {
  return (
    "ref:" +
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ref)),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}
export function providerOf(ref) {
  if (ref.startsWith("3isk:")) return "3isk";
  if (ref.startsWith("alooy:")) return "alooy";
  if (ref.startsWith("legacy:")) return "akoam";
  if (ref.startsWith("laroza:")) return "laroza";
  throw Error("BAD_REFERENCE");
}
export async function aggregate(
  identity,
  env,
  { now = Date.now, verifiedIdentity = false } = {},
) {
  const settled = await Promise.allSettled(
    PROVIDERS.map(async (provider) => {
      const ref = identity.refs[provider];
      if (!ref) return [];
      const started = now();
      const response = await env[BINDINGS[provider]].fetch(
        new Request(
          "https://provider.internal/resolve?ref=" + encodeURIComponent(ref),
          { signal: AbortSignal.timeout(22000) },
        ),
      );
      if (!response.ok) {
        const failure = await boundedJson(response, 4096).catch(() => ({}));
        throw Error(
          /^[A-Z_0-9]+$/.test(failure.error || "")
            ? failure.error
            : "PROVIDER_UNAVAILABLE",
        );
      }
      const data = await boundedJson(response);
      if (!Array.isArray(data.sources)) throw Error("BAD_PROVIDER_RESPONSE");
      return data.sources
        .slice(0, 4)
        .filter(
          (s) =>
            s.provider_id === provider &&
            Date.parse(s.expires_at) > now() + EXPIRY_SAFETY_MS,
        )
        .map((s) => ({
          ...s,
          latency_ms: now() - started,
          priority: PROVIDERS.indexOf(provider),
          edition: identity.edition || "source-original",
          timeline_verified: verifiedIdentity,
          timeline_offset_ms: verifiedIdentity ? 0 : null,
        }));
    }),
  );
  // Preserve at least one healthy source from every available provider before
  // filling remaining slots. A late provider must not disappear behind the
  // first provider's four servers when the unified response is capped at eight.
  const sources = [];
  for (let slot = 0; slot < 4 && sources.length < 8; slot++)
    for (const row of settled)
      if (row.status === "fulfilled" && row.value[slot] && sources.length < 8)
        sources.push(row.value[slot]);
  const result = {
    status: sources.length ? "success" : "unavailable",
    schema_version: 1,
    episode_id: identity.episode_id,
    edition: identity.edition || "source-original",
    timeline_verified: verifiedIdentity,
    sources,
    availability: settled.map((r, i) => ({
      provider_id: PROVIDERS[i],
      status:
        r.status === "rejected"
          ? "unavailable"
          : r.value.length
            ? "available"
            : "unmapped",
      ...(r.status === "rejected"
        ? {
            reason: String(r.reason?.message || "PROVIDER_UNAVAILABLE").slice(
              0,
              80,
            ),
          }
        : {}),
    })),
  };
  return budgetResolution(result);
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url),
      origin = request.headers.get("Origin"),
      cors = { Vary: "Origin" };
    if (
      origin === "https://th-505.github.io" ||
      origin === "http://localhost:8000"
    )
      cors["Access-Control-Allow-Origin"] = origin;
    cors["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    const reply = (body, status = 200, headers = {}) =>
      Response.json(body, {
        status,
        headers: { ...cors, "Cache-Control": "no-store", ...headers },
      });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET")
      return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/health")
      return reply({
        status: "ok",
        schema_version: 1,
        media_proxy: false,
        providers: PROVIDERS,
        cache_before_kv: true,
        public_refresh_bypass: false,
        burst_limits: {
          requests_per_minute: 120,
          cold_resolutions_per_minute: 30,
        },
      });
    if (
      url.pathname !== "/v1/resolve" &&
      !url.pathname.startsWith("/v1/matches") &&
      !url.pathname.startsWith("/v1/laroza/")
    )
      return reply({ error: "NOT_FOUND" }, 404);
    try {
      // CF supplies this header on the public edge. Do not trust client-provided
      // device IDs before anonymous authentication is established. Broad limits
      // allow the twenty-person cohort to share a NAT/mobile-network address.
      // Counters are local/eventually consistent: this is burst protection,
      // not a global daily quota or an exact twenty-user admission system.
      const actor = await refKey(
        request.headers.get("CF-Connecting-IP") || "unattributed",
      );
      if (!(await permitted(env.EDGE_REQUEST_LIMITER, actor)))
        return reply({ error: "RATE_LIMITED" }, 429, { "Retry-After": "60" });
      if (url.pathname.startsWith("/v1/laroza/")) {
        const target = larozaTarget(url);
        if (!target) return reply({ error: "NOT_FOUND" }, 404);
        const cacheKey = new Request(
          url.origin +
            `/cache/${CACHE_VERSION}/laroza/` +
            (await refKey(target.pathname + target.search)),
        );
        const cached = await cachedResult(cacheKey, false);
        if (cached) return reply({ ...cached, cached: true });
        if (!(await permitted(env.EDGE_RESOLVE_LIMITER, actor)))
          return reply({ error: "RESOLUTION_RATE_LIMITED" }, 429, {
            "Retry-After": "60",
          });
        const response = await env.LAROZA.fetch(
          new Request(target, {
            signal: AbortSignal.timeout(22000),
          }),
        );
        const data = await boundedJson(response);
        if (!metadataOnly(data)) throw Error("UNEXPECTED_MEDIA_IN_CATALOG");
        if (response.ok && data.status === "success") {
          const correctShape =
            target.pathname === "/details"
              ? data.data &&
                typeof data.data === "object" &&
                !Array.isArray(data.data)
              : Array.isArray(data.data);
          if (!correctShape) throw Error("BAD_PROVIDER_RESPONSE");
          cacheResult(
            cacheKey,
            data,
            ctx,
            target.pathname === "/details" ? 120 : 300,
            false,
          );
        }
        return reply(data, response.status);
      }
      if (url.pathname.startsWith("/v1/matches")) {
        const route = {
          "/v1/matches": "/list",
          "/v1/matches/servers": "/servers",
          "/v1/matches/playback": "/playback",
          "/v1/matches/resolve": "/resolve",
        }[url.pathname];
        if (!route) return reply({ error: "NOT_FOUND" }, 404);
        if ((url.searchParams.get("ref") || "").length > 3000)
          return reply({ error: "BAD_REFERENCE" }, 400);
        // Public refresh/random query parameters cannot fragment or bypass cache.
        const ref = url.searchParams.get("ref") || "";
        const target = new URL("https://matches.internal" + route);
        if (ref) target.searchParams.set("ref", ref);
        const cacheKey = new Request(
          url.origin +
            `/cache/${CACHE_VERSION}/matches/` +
            encodeURIComponent(route) +
            "/" +
            (await refKey(ref)),
        );
        const hasSources = route === "/playback" || route === "/resolve";
        const cached = await cachedResult(cacheKey, hasSources);
        if (cached) return reply({ ...cached, cached: true });
        if (!(await permitted(env.EDGE_RESOLVE_LIMITER, actor)))
          return reply({ error: "RESOLUTION_RATE_LIMITED" }, 429, {
            "Retry-After": "60",
          });
        const result = await env.MATCHES.fetch(
          new Request(target, {
            signal: AbortSignal.timeout(30000),
          }),
        );
        const data = await boundedJson(result);
        if (
          result.ok &&
          data.status === "success" &&
          (!hasSources || activeSources(data))
        )
          cacheResult(cacheKey, data, ctx, hasSources ? 60 : 15, hasSources);
        return reply(data, result.status);
      }
      const ref = url.searchParams.get("ref"),
        id = url.searchParams.get("episode_id");
      if (
        (!ref && !id) ||
        (ref && id) ||
        (ref && ref.length > 1500) ||
        (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      )
        return reply({ error: "BAD_REFERENCE" }, 400);
      // Reject unknown providers before consuming a KV read. The input selector,
      // rather than a KV-resolved episode ID, is sufficient for the first lookup
      // and keeps translated/dubbed edition references strictly isolated.
      if (ref) providerOf(ref);
      const lookupKey = ref ? await refKey(ref) : "episode:" + id;
      const cacheKey = new Request(
        url.origin +
          `/cache/${CACHE_VERSION}/resolve/` +
          encodeURIComponent(lookupKey),
      );
      const cached = await cachedResult(cacheKey, true);
      if (cached) return reply({ ...cached, cached: true });
      if (!(await permitted(env.EDGE_RESOLVE_LIMITER, actor)))
        return reply({ error: "RESOLUTION_RATE_LIMITED" }, 429, {
          "Retry-After": "60",
        });
      let identity = await env.EPISODES.get(lookupKey, "json");
      // Only an explicitly curated KV edition can assert cross-provider timing.
      // Unregistered individual references remain playable but unverified.
      const verifiedIdentity = Boolean(
        identity &&
        typeof identity.edition === "string" &&
        identity.edition &&
        identity.edition !== "source-original",
      );
      if (!identity) {
        if (!ref) return reply({ error: "EPISODE_NOT_REGISTERED" }, 404);
        identity = {
          episode_id: ref,
          refs: { [providerOf(ref)]: ref },
          edition: "source-original",
        };
      }
      const result = await aggregate(identity, env, { verifiedIdentity });
      if (!result.sources.length) return reply(result, 503);
      cacheResult(cacheKey, result, ctx);
      console.log(
        JSON.stringify({
          event: "edge_resolve",
          providers: result.sources.map((s) => s.provider_id),
          sources: result.sources.length,
        }),
      );
      return reply(result);
    } catch (e) {
      return reply(
        { error: String(e.message).slice(0, 100) },
        /BAD_REFERENCE|BAD_CATALOG_QUERY/.test(e.message)
          ? 400
          : /RATE_LIMITER_UNAVAILABLE/.test(e.message)
            ? 503
            : 502,
      );
    }
  },
};
