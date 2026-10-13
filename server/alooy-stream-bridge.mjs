import https from "node:https";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import {
  alooyMedia,
  alooyPage,
  ALOOY_ORIGIN,
  ALOOY_UA,
} from "./providers/alooy.mjs";
import { TtlCache } from "./content-runtime.mjs";
export function createAlooyWebBridge({ requestImpl = https.request } = {}) {
  const refs = new TtlCache({ maxEntries: 256 });
  function register(source) {
    const target = alooyMedia(source.media_path);
    const ref = alooyPage(source.headers.Referer);
    if (!ref.searchParams.has("key")) throw new Error("ALOOY_BAD_REFERENCE");
    const id = randomUUID();
    refs.set(id, { target, referer: ref.href }, 300000);
    return {
      ...source,
      media_path: `/api/alooy/media?id=${id}`,
      playback_mode: "proxy",
      headers: {},
    };
  }
  async function upstream(target, headers, depth = 0) {
    alooyMedia(target.href);
    return new Promise((resolve, reject) => {
      const r = requestImpl(
        target,
        { method: "GET", headers },
        async (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            response.destroy();
            try {
              if (depth === 3 || !response.headers.location)
                throw new Error("ALOOY_REDIRECT_LIMIT");
              resolve(
                await upstream(
                  new URL(response.headers.location, target),
                  headers,
                  depth + 1,
                ),
              );
            } catch (e) {
              reject(e);
            }
          } else resolve(response);
        },
      );
      r.setTimeout(30000, () => r.destroy(new Error("ALOOY_STREAM_TIMEOUT")));
      r.on("error", reject);
      r.end();
    });
  }
  return {
    register,
    async proxy(req, res, id) {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      const entry = refs.get(id);
      if (!entry) {
        res.writeHead(410);
        res.end();
        return;
      }
      const headers = {
        Referer: entry.referer,
        Origin: ALOOY_ORIGIN,
        "User-Agent": ALOOY_UA,
        "Accept-Encoding": "identity",
      };
      if (req.headers.range) headers.Range = req.headers.range;
      if (req.headers["if-range"])
        headers["If-Range"] = req.headers["if-range"];
      const response = await upstream(entry.target, headers);
      res.statusCode = response.statusCode;
      for (const key of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
        "content-encoding",
      ])
        if (response.headers[key] != null)
          res.setHeader(key, response.headers[key]);
      res.setHeader("cache-control", "no-store");
      const abort = () => response.destroy();
      res.once("close", abort);
      try {
        if (req.method === "HEAD") {
          response.destroy();
          res.end();
        } else await pipeline(response, res);
      } finally {
        res.off("close", abort);
        response.destroy();
      }
    },
  };
}
