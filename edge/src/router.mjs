const PROVIDERS = ["3isk", "akoam", "alooy"];
const BINDINGS = { "3isk": "ISK", akoam: "AKOAM", alooy: "ALOOY" };
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
        const failure = await response.json().catch(() => ({}));
        throw Error(
          /^[A-Z_0-9]+$/.test(failure.error || "")
            ? failure.error
            : "PROVIDER_UNAVAILABLE",
        );
      }
      const data = await response.json();
      if (!Array.isArray(data.sources)) throw Error("BAD_PROVIDER_RESPONSE");
      return data.sources
        .slice(0, 4)
        .filter(
          (s) =>
            s.provider_id === provider &&
            Date.parse(s.expires_at) > now() + 30000,
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
    const reply = (body, status = 200) =>
      Response.json(body, {
        status,
        headers: { ...cors, "Cache-Control": "no-store" },
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
      });
    if (url.pathname !== "/v1/resolve")
      return reply({ error: "NOT_FOUND" }, 404);
    try {
      const ref = url.searchParams.get("ref"),
        id = url.searchParams.get("episode_id");
      if (
        (!ref && !id) ||
        (ref && id) ||
        (ref && ref.length > 1500) ||
        (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      )
        return reply({ error: "BAD_REFERENCE" }, 400);
      let identity = ref
        ? await env.EPISODES.get(await refKey(ref), "json")
        : await env.EPISODES.get("episode:" + id, "json");
      if (!identity) {
        if (!ref) return reply({ error: "EPISODE_NOT_REGISTERED" }, 404);
        identity = {
          episode_id: ref,
          refs: { [providerOf(ref)]: ref },
          edition: "source-original",
        };
      }
      const cacheKey = new Request(
        url.origin + "/cache/v1/" + encodeURIComponent(identity.episode_id),
      );
      const cached =
        url.searchParams.get("refresh") !== "1" &&
        (await caches.default.match(cacheKey));
      if (cached) {
        const data = await cached.json();
        if (
          data.sources.every(
            (s) => Date.parse(s.expires_at) > Date.now() + 30000,
          )
        )
          return reply({ ...data, cached: true });
      }
      const result = await aggregate(identity, env);
      if (!result.sources.length) return reply(result, 503);
      const lifetime = Math.min(
        60,
        ...result.sources.map((s) =>
          Math.floor((Date.parse(s.expires_at) - Date.now() - 30000) / 1000),
        ),
      );
      if (lifetime > 0)
        ctx.waitUntil(
          caches.default.put(
            cacheKey,
            Response.json(result, {
              headers: { "Cache-Control": `public,max-age=${lifetime}` },
            }),
          ),
        );
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
        /BAD_REFERENCE/.test(e.message) ? 400 : 502,
      );
    }
  },
};
