import { limitedText, unpack } from "./provider.mjs";
import {
  normalizeMatch,
  PRODUCT_VERSION,
} from "../../server/content-runtime.mjs";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1";
const CONFIG = {
  origin: "https://api.albasritv1.workers.dev",
  referer: "https://www.albasritv.abrdns.com/2026/09/matches.html",
  pageHosts: ["news.yallowzeno.world", "koooracity.news"],
  mediaHosts: ["pull.gosh6.app"],
};
const b64 = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const un64 = (s) =>
  new TextDecoder().decode(
    Uint8Array.from(
      atob(
        s
          .replaceAll("-", "+")
          .replaceAll("_", "/")
          .padEnd(Math.ceil(s.length / 4) * 4, "="),
      ),
      (x) => x.charCodeAt(0),
    ),
  );
export function assertMatchUrl(value, config = CONFIG, media = false) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !(media ? config.mediaHosts : config.pageHosts).includes(u.hostname)
  )
    throw Error("MATCH_URL_REJECTED");
  return u;
}
export function matchRef(article) {
  return "match:" + b64(article);
}
function articleRef(ref, config) {
  if (!/^match:[\w-]{1,2000}$/.test(ref)) throw Error("BAD_MATCH_REFERENCE");
  return assertMatchUrl(un64(ref.slice(6)), config).href;
}
export function playerCandidates(html, base, config = CONFIG) {
  const decoded = unpack(html)
    .replaceAll("\\/", "/")
    .replace(/\\u([0-9a-f]{4})/gi, (_, s) =>
      String.fromCharCode(parseInt(s, 16)),
    )
    .replace(/\\x([0-9a-f]{2})/gi, (_, s) =>
      String.fromCharCode(parseInt(s, 16)),
    )
    .replaceAll("&amp;", "&");
  const direct = [],
    nested = [];
  const add = (raw, force = false) => {
    try {
      const u = new URL(raw.trim(), base);
      if (force || /\.(m3u8|mp4)(?:$|\?)/i.test(u.href)) {
        assertMatchUrl(u, config, true);
        if (!direct.includes(u.href)) direct.push(u.href);
      } else {
        assertMatchUrl(u, config);
        if (!nested.includes(u.href)) nested.push(u.href);
      }
    } catch {}
  };
  for (const m of decoded.matchAll(
    /AlbaPlayerControl\(\s*['"]([a-zA-Z0-9+/=_-]{1,4096})['"]\s*,\s*['"](hls|mp4|clappr|plyr|jwplayer|videojs|iframe)['"]/g,
  )) {
    try {
      add(un64(m[1]), m[2] !== "iframe");
    } catch {}
  }
  for (const m of decoded.matchAll(
    /atob\(\s*['"]([a-zA-Z0-9+/=]{1,4096})['"]\s*\)/g,
  )) {
    try {
      add(un64(m[1]));
    } catch {}
  }
  // Literal concatenation covers current Clappr configurations without executing scripts.
  const literal = decoded.replace(
    /(['"])(https?:[^'"]+)\1\s*\+\s*(['"])([^'"]*)\3/g,
    (_, q, a, _q, b) => q + a + b + q,
  );
  for (const m of literal.matchAll(
    /(?:['"]?(?:source|file|hls|url)['"]?\s*[:=]\s*|<(?:video|source|iframe)[^>]*\bsrc\s*=\s*)['"]([^'"]+)['"]/gi,
  ))
    add(m[1]);
  for (const m of literal.matchAll(
    /https:\/\/[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?/g,
  ))
    add(m[0]);
  return { direct, nested };
}
export function createMatchEdge({ fetchImpl = fetch, config = CONFIG } = {}) {
  let requests = 0;
  const request = async (...args) => {
    if (++requests > 42) throw Error("MATCH_FETCH_BUDGET");
    return fetchImpl(...args);
  };
  const sourceHeaders = {
    Accept: "application/json",
    Origin: new URL(config.referer).origin,
    Referer: config.referer,
    "X-BSR-Page": new URL(config.referer).pathname,
    "User-Agent": UA,
  };
  async function json(url, headers = sourceHeaders) {
    const r = await request(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw Error("MATCH_SOURCE_HTTP_" + r.status);
    }
    return JSON.parse(await limitedText(r));
  }
  async function session() {
    const d = await json(config.origin + "/session");
    if (typeof d.token !== "string" || d.token.length > 4096)
      throw Error("MATCH_SESSION_INVALID");
    return { ...sourceHeaders, "X-BSR-Token": d.token };
  }
  async function rawList() {
    const d = await json(config.origin + "/", await session());
    if (!Array.isArray(d.data)) throw Error("MATCH_LIST_INVALID");
    return d.data.slice(0, 100);
  }
  function article(entry) {
    const u = new URL(entry.link);
    if (u.origin !== config.origin || u.pathname !== "/")
      throw Error("BAD_MATCH_TARGET");
    return assertMatchUrl(u.searchParams.get("matchUrl"), config).href;
  }
  async function serverRows(ref) {
    const url = articleRef(ref, config);
    const rows = await rawList();
    const found = rows.find((r) => {
      try {
        return article(r) === url;
      } catch {
        return false;
      }
    });
    if (!found) throw Error("MATCH_NOT_LISTED");
    const data = await json(found.link, await session());
    if (!Array.isArray(data.servers)) throw Error("MATCH_SERVERS_INVALID");
    return data.servers.slice(0, 8).map((s, index) => ({
      url: (() => {
        try {
          return assertMatchUrl(s.url || s.src, config).href;
        } catch {
          return assertMatchUrl(s.url || s.src, config, true).href;
        }
      })(),
      name: String(s.name || `Server ${index + 1}`).slice(0, 100),
      type: s.type,
      index,
    }));
  }
  async function page(url, referer, depth = 0) {
    assertMatchUrl(url, config);
    const r = await request(url, {
      headers: { "User-Agent": UA, Referer: referer },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel();
      if (depth >= 3) throw Error("MATCH_REDIRECT_LIMIT");
      return page(
        new URL(r.headers.get("location"), url).href,
        referer,
        depth + 1,
      );
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Error("MATCH_EMBED_HTTP_" + r.status);
    }
    return limitedText(r);
  }
  async function extract(url, parent = undefined, depth = 0, seen = new Set()) {
    if (depth > 3 || seen.has(url) || seen.size >= 8) return [];
    seen.add(url);
    const isMedia = /\.(m3u8|mp4)(?:$|\?)/i.test(url);
    const c = isMedia
      ? { direct: [assertMatchUrl(url, config, true).href], nested: [] }
      : playerCandidates(
          await page(url, parent || new URL(config.referer).origin + "/"),
          url,
          config,
        );
    const resolved = [];
    for (const media of c.direct.slice(0, 4)) {
      const referer = isMedia
        ? parent || new URL(config.referer).origin + "/"
        : url;
      const headers = {
        Referer: referer,
        Origin: new URL(referer).origin,
        "User-Agent": UA,
      };
      const r = await request(media, {
        method: "HEAD",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      await r.body?.cancel();
      if (!r.ok) continue;
      const u = new URL(media);
      const hex = u.searchParams.get("txTime");
      const seconds = u.searchParams.get("expires");
      const expiry = Math.min(
        Date.now() + 180000,
        hex && /^[0-9a-f]+$/i.test(hex) ? parseInt(hex, 16) * 1000 : Infinity,
        seconds && /^\d+$/.test(seconds) ? Number(seconds) * 1000 : Infinity,
      );
      if (expiry < Date.now() + 30000) continue;
      let webPlayable = false;
      try {
        const browser = await request(media, {
          method: "HEAD",
          redirect: "manual",
          headers: {
            Origin: "https://th-505.github.io",
            Referer: "https://th-505.github.io/",
            "User-Agent": UA,
          },
          signal: AbortSignal.timeout(3000),
        });
        await browser.body?.cancel();
        webPlayable =
          browser.ok &&
          ["*", "https://th-505.github.io"].includes(
            browser.headers.get("access-control-allow-origin"),
          );
      } catch {}
      resolved.push({
        provider: "المباريات",
        provider_id: "matches",
        url: media,
        format: u.pathname.endsWith(".mp4") ? "mp4" : "hls",
        headers,
        expires_at: new Date(expiry).toISOString(),
        playback_mode: "edge_direct",
        quality: "مباشر",
        web_playable: webPlayable,
      });
    }
    if (!resolved.length)
      for (const next of c.nested.slice(0, 3)) {
        try {
          resolved.push(...(await extract(next, url, depth + 1, seen)));
        } catch {}
      }
    return resolved;
  }
  return {
    async list() {
      const data = [];
      for (const row of await rawList()) {
        try {
          const ref = matchRef(article(row));
          data.push(normalizeMatch({ ...row, ref, link: ref }));
        } catch {}
      }
      return { status: "success", version: PRODUCT_VERSION, data };
    },
    async servers(ref) {
      const data = await serverRows(ref);
      return {
        status: "success",
        version: PRODUCT_VERSION,
        data: data.map((s) => ({
          name: s.name,
          type: s.type,
          ref: "matchserver:" + b64(JSON.stringify([ref, s.index])),
        })),
      };
    },
    async playback(ref) {
      if (!/^matchserver:[\w-]{1,3000}$/.test(ref))
        throw Error("BAD_MATCH_REFERENCE");
      const parsed = JSON.parse(un64(ref.slice(12)));
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        !Number.isInteger(parsed[1]) ||
        parsed[1] < 0 ||
        parsed[1] > 7
      )
        throw Error("BAD_MATCH_REFERENCE");
      const servers = await serverRows(parsed[0]);
      const selected = servers[parsed[1]];
      if (!selected) throw Error("MATCH_SERVER_MISSING");
      const sources = await extract(selected.url);
      if (!sources.length) throw Error("NO_MATCH_MEDIA");
      return {
        status: "success",
        schema_version: 1,
        episode_id: parsed[0],
        sources: sources.map((s) => ({
          ...s,
          provider: selected.name,
          source_ref: ref,
        })),
      };
    },
    async resolve(ref) {
      const servers = await serverRows(ref);
      const settled = await Promise.allSettled(
        servers.slice(0, 3).map(async (s) =>
          (await extract(s.url)).map((p) => ({
            ...p,
            provider: s.name,
            source_ref: "matchserver:" + b64(JSON.stringify([ref, s.index])),
          })),
        ),
      );
      const sources = settled
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value)
        .slice(0, 8);
      if (!sources.length) throw Error("NO_MATCH_MEDIA");
      return { status: "success", schema_version: 1, episode_id: ref, sources };
    },
  };
}
export default {
  async fetch(request, env) {
    try {
      const u = new URL(request.url);
      if (request.method !== "GET")
        return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
      const config =
        typeof env.MATCH_CONFIG === "string"
          ? JSON.parse(env.MATCH_CONFIG)
          : env.MATCH_CONFIG || CONFIG;
      const engine = createMatchEdge({ config });
      const routes = {
        "/list": () => engine.list(),
        "/servers": () => engine.servers(u.searchParams.get("ref") || ""),
        "/playback": () => engine.playback(u.searchParams.get("ref") || ""),
        "/resolve": () => engine.resolve(u.searchParams.get("ref") || ""),
      };
      if (!routes[u.pathname])
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      return Response.json(await routes[u.pathname]());
    } catch (e) {
      return Response.json(
        { status: "error", error: String(e.message).slice(0, 80) },
        { status: /BAD_|REJECTED/.test(e.message) ? 400 : 502 },
      );
    }
  },
};
