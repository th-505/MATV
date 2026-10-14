const PROVIDERS = ["3isk", "akoam", "alooy"];
const BINDINGS = { "3isk": "ISK", akoam: "AKOAM", alooy: "ALOOY" };
const CACHE_VERSION = "v2";
const EXPIRY_SAFETY_MS = 30000;
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
  throw Error("BAD_REFERENCE");
}
export async function aggregate(identity, env, { now = Date.now } = {}) {
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
          timeline_offset_ms: 0,
        }));
    }),
  );
  const sources = settled
    .filter((s) => s.status === "fulfilled")
    .flatMap((s) => s.value)
    .slice(0, 8);
  const result = {
    status: sources.length ? "success" : "unavailable",
    schema_version: 1,
    episode_id: identity.episode_id,
    edition: identity.edition || "source-original",
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
  if (new TextEncoder().encode(JSON.stringify(result)).length > 12288)
    throw Error("RESPONSE_TOO_LARGE");
  return result;
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
      !url.pathname.startsWith("/v1/matches")
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
      if (!identity) {
        if (!ref) return reply({ error: "EPISODE_NOT_REGISTERED" }, 404);
        identity = {
          episode_id: ref,
          refs: { [providerOf(ref)]: ref },
          edition: "source-original",
        };
      }
      const result = await aggregate(identity, env);
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
        /BAD_REFERENCE/.test(e.message)
          ? 400
          : /RATE_LIMITER_UNAVAILABLE/.test(e.message)
            ? 503
            : 502,
      );
    }
  },
};
