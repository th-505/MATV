import { load } from "cheerio";
import { TtlCache } from "../content-runtime.mjs";
export const ALOOY_ORIGIN = "https://fa.alooytv16.xyz";
export const ALOOY_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
export function alooyPage(value) {
  const u = new URL(value, ALOOY_ORIGIN);
  if (
    u.origin !== ALOOY_ORIGIN ||
    u.username ||
    u.password ||
    u.hash ||
    !/^\/watch\/[\w-]+\.html$/.test(u.pathname) ||
    [...u.searchParams.keys()].some((k) => k !== "key") ||
    u.searchParams.getAll("key").length > 1 ||
    (u.search && !/^[\w-]{1,120}$/.test(u.searchParams.get("key") || ""))
  )
    throw new Error("ALOOY_BAD_REFERENCE");
  return u;
}
export function encodeAlooyRef(value) {
  const u = alooyPage(value);
  return "alooy:" + Buffer.from(u.pathname + u.search).toString("base64url");
}
export function decodeAlooyRef(ref) {
  if (!/^alooy:[\w-]{1,1500}$/.test(ref))
    throw new Error("ALOOY_BAD_REFERENCE");
  const u = alooyPage(Buffer.from(ref.slice(6), "base64url").toString());
  if (encodeAlooyRef(u.href) !== ref) throw new Error("ALOOY_BAD_REFERENCE");
  return u;
}
export function alooyMedia(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    u.hash ||
    !/^(?:vid\d+\.)?ujeklsj\.site$/.test(u.hostname) ||
    !/\.(mp4|webm)$/i.test(u.pathname)
  )
    throw new Error("ALOOY_BAD_MEDIA");
  return u;
}
export function parseAlooyCatalog(html) {
  const $ = load(html),
    rows = new Map();
  $(".latest-movie-img-container").each((_, node) => {
    const a = $(node).find('a[href*="/watch/"]').first(),
      img = $(node).find("img").first();
    try {
      const ref = encodeAlooyRef(a.attr("href"));
      rows.set(ref, {
        id: ref,
        ref,
        title: img.attr("alt") || a.text().trim(),
        poster: img.attr("data-src") || img.attr("src") || "",
        type: "series",
        is_series: true,
        source: "alooy",
      });
    } catch {}
  });
  return [...rows.values()].map((row) => ({
    ...row,
    poster: row.poster ? new URL(row.poster, ALOOY_ORIGIN).href : "",
  }));
}
export function parseAlooyDetails(html, pageUrl) {
  const $ = load(html),
    episodes = new Map(),
    streams = new Map();
  $('a[href*="?key="]').each((_, n) => {
    try {
      const a = $(n),
        u = alooyPage(a.attr("href"));
      if (u.pathname !== pageUrl.pathname) return;
      const ref = encodeAlooyRef(u.href),
        num = Number(a.text().match(/\d+/)?.[0]);
      if (num > 0)
        episodes.set(ref, {
          ref,
          episode_id: ref,
          episode_number: num,
          title: `الحلقة ${num}`,
          watch_available: true,
        });
    } catch {}
  });
  if (pageUrl.searchParams.has("key")) {
    const candidates = $("video source, video[src]")
      .toArray()
      .map((n) => $(n).attr("src"));
    $("script").each((_, n) =>
      candidates.push(
        ...($(n)
          .html()
          ?.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|webm)(?:\?[^\s"'<>]*)?/g) ||
          []),
      ),
    );
    for (const raw of candidates)
      try {
        const url = alooyMedia(raw).href;
        if (streams.has(url)) continue;
        streams.set(url, {
          media_path: url,
          media_type: new URL(url).pathname.endsWith(".webm") ? "webm" : "mp4",
          playback_mode: "local_proxy",
          headers: {
            Referer: pageUrl.href,
            Origin: ALOOY_ORIGIN,
            "User-Agent": ALOOY_UA,
          },
          label: `المصدر ${streams.size + 1}`,
        });
      } catch {}
  }
  const img =
    $("video").attr("poster") ||
    $('meta[property="og:image"]').attr("content") ||
    "";
  return {
    status: "success",
    source: "alooy",
    movie_title:
      $("h1").first().text().trim() || $("title").text().split("|")[0].trim(),
    poster: img ? new URL(img, ALOOY_ORIGIN).href : "",
    episodes: [...episodes.values()].sort(
      (a, b) => a.episode_number - b.episode_number,
    ),
    download_available: false,
    ...(streams.size
      ? {
          ...streams.values().next().value,
          media_sources: [...streams.values()],
          expires_at: new Date(Date.now() + 300000).toISOString(),
        }
      : pageUrl.search
        ? { playback_unavailable: true, playback_reason: "ALOOY_NO_MEDIA" }
        : {}),
  };
}
export function createAlooyProvider({ fetchImpl = globalThis.fetch } = {}) {
  const cache = new TtlCache({ maxEntries: 96 }),
    pending = new Map();
  async function page(u, refresh = false) {
    const key = u.href;
    if (!refresh && cache.get(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const res = await fetchImpl(key, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": ALOOY_UA, Referer: ALOOY_ORIGIN + "/" },
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`ALOOY_HTTP_${res.status}`);
      }
      let size = 0,
        body = "";
      const dec = new TextDecoder();
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("ALOOY_PAGE_TOO_LARGE");
        body += dec.decode(chunk, { stream: true });
      }
      body += dec.decode();
      cache.set(key, body, u.search ? 30000 : 120000);
      return body;
    })();
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }
  return {
    async category(id = "alooy-series", p = 1) {
      if (id !== "alooy-series" || !Number.isInteger(p) || p < 1 || p > 500)
        throw new Error("ALOOY_BAD_CATEGORY");
      const u = new URL(
        p === 1 ? "/tv-series.html" : `/tvseries/home/${(p - 1) * 24}.html`,
        ALOOY_ORIGIN,
      );
      return {
        status: "success",
        source: "alooy",
        data: parseAlooyCatalog(await page(u)),
      };
    },
    async details(ref, { refresh = false } = {}) {
      const u = decodeAlooyRef(ref);
      return parseAlooyDetails(await page(u, refresh), u);
    },
    async search(query) {
      const q = String(query || "")
        .trim()
        .slice(0, 120);
      if (q.length < 2) return { status: "success", source: "alooy", data: [] };
      const u = new URL("/home/autocompleteajax", ALOOY_ORIGIN);
      u.searchParams.set("term", q);
      const json = JSON.parse(await page(u));
      const rows = [];
      for (const row of Array.isArray(json) ? json : []) {
        try {
          const ref = encodeAlooyRef(row.url);
          rows.push({
            id: ref,
            ref,
            title: String(row.title || ""),
            poster: new URL(row.image || "", ALOOY_ORIGIN).href,
            type: "series",
            source: "alooy",
          });
        } catch {}
      }
      return { status: "success", source: "alooy", data: rows };
    },
    async metadata(ref) {
      const u = decodeAlooyRef(ref);
      u.search = "";
      const data = parseAlooyDetails(await page(u), u);
      return data;
    },
    status() {
      return {
        provider: "alooy",
        playback_mode: "local_proxy",
        media_hosts: ["ujeklsj.site"],
        cache_entries: cache.size,
      };
    },
  };
}
