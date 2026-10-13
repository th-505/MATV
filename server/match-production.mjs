import { limitedText } from "../edge/src/provider.mjs";
import { PRODUCT_VERSION } from "./content-runtime.mjs";

// Compatibility JSON facade. Match HTML extraction runs on Cloudflare;
// neither this service nor its retired media route forwards video bytes.
export function createProductionMatchRuntime({
  edgeBase = process.env.MITV_EDGE_BASE ||
    "https://matv-edge-resolver.dada1000100.workers.dev",
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = new URL(edgeBase);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.port ||
    base.search ||
    base.hash
  )
    throw Error("INVALID_EDGE_ENDPOINT");
  async function request(path, ref) {
    const url = new URL("/v1/matches" + path, base);
    if (ref) url.searchParams.set("ref", ref);
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(35000),
    });
    const data = JSON.parse(await limitedText(response, 128 * 1024));
    if (!response.ok || data.status !== "success")
      throw Error(data.error || "MATCH_EDGE_UNAVAILABLE");
    return data;
  }
  return {
    async matches() {
      const d = await request("");
      return {
        ...d,
        version: PRODUCT_VERSION,
        kind: "matches",
        source: "basri-matches-edge",
        cached: false,
        stale: false,
        generated_at: new Date().toISOString(),
        health: null,
      };
    },
    async servers(ref) {
      const d = await request("/servers", ref);
      return { ...d, version: PRODUCT_VERSION, kind: "match-servers" };
    },
    async playback(ref) {
      const d = await request("/playback", ref);
      const s = d.sources[0];
      return {
        status: "success",
        version: PRODUCT_VERSION,
        kind: "match-playback",
        data: {
          media_path: s.url,
          stream_url: s.url,
          media_type: s.format === "hls" ? "m3u8" : s.format,
          playback_mode: "direct",
          headers: s.headers,
          expires_at: s.expires_at,
          server_name: s.provider,
          media_sources: d.sources,
        },
      };
    },
    async proxyMedia(_req, res) {
      res.statusCode = 410;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "error",
          message: "MATCH_PROXY_RETIRED_USE_DIRECT_PLAYBACK",
        }),
      );
    },
  };
}
