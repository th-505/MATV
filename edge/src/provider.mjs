const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
export function decodeRef(ref, config) {
  let value;
  if (config.provider === "akoam") {
    if (!ref.startsWith("legacy:")) throw Error("BAD_REFERENCE");
    value = decodeURIComponent(ref.slice(7));
    // Existing references retain old origins when an origin is hotfixed.
    const u = new URL(value);
    if (!config.sourceOrigins.includes(u.origin)) throw Error("BAD_REFERENCE");
    value = u.pathname + u.search;
  } else {
    if (
      !ref.startsWith(config.provider + ":") ||
      !new RegExp(`^${config.provider}:[A-Za-z0-9_-]{1,1500}$`).test(ref)
    )
      throw Error("BAD_REFERENCE");
    value = new TextDecoder().decode(
      Uint8Array.from(
        atob(
          ref
            .split(":")[1]
            .replaceAll("-", "+")
            .replaceAll("_", "/")
            .padEnd(Math.ceil(ref.split(":")[1].length / 4) * 4, "="),
        ),
        (c) => c.charCodeAt(0),
      ),
    );
  }
  const u = new URL(value, config.origin);
  assertUrl(u, config, false);
  const pattern = {
    akoam: /^\/(episode|movie)\/[^?#]+$/,
    "3isk": /^\/watch\/(episodes|movies)\/[\w-]+\/$/,
    alooy: /^\/watch\/[\w-]+\.html$/,
  }[config.provider];
  if (!pattern.test(u.pathname)) throw Error("EXPECTED_PLAYABLE_REFERENCE");
  if (
    config.provider === "alooy" &&
    (!/^[\w-]{1,120}$/.test(u.searchParams.get("key") || "") ||
      u.searchParams.getAll("key").length !== 1 ||
      [...u.searchParams.keys()].some((k) => k !== "key"))
  )
    throw Error("BAD_REFERENCE");
  if (config.provider !== "alooy" && u.search) throw Error("BAD_REFERENCE");
  return u;
}
export function assertUrl(value, config, media = false) {
  const u = value instanceof URL ? value : new URL(value);
  const exact = media ? config.mediaHosts : config.pageHosts;
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !exact.some((h) =>
      h.startsWith("*.")
        ? u.hostname.endsWith(h.slice(1)) && u.hostname !== h.slice(2)
        : u.hostname === h,
    )
  )
    throw Error("BAD_UPSTREAM_URL");
  if (media && !/\.(m3u8|mp4|webm|mkv|mpd|ts|m2ts)$/i.test(u.pathname))
    throw Error("BAD_MEDIA_URL");
  return u;
}
export async function limitedText(response, max = 512 * 1024) {
  const r = response.body?.getReader();
  if (!r) return "";
  const dec = new TextDecoder();
  let n = 0,
    out = "";
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      n += value.length;
      if (n > max) throw Error("PAGE_TOO_LARGE");
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  } finally {
    await r.cancel();
  }
}
export function unpack(html) {
  const m = html.match(
    /\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\s*\.split\(\s*'\|'\s*\)/,
  );
  if (!m) return html;
  const radix = Number(m[2]),
    count = Number(m[3]);
  if (
    radix < 2 ||
    radix > 62 ||
    count > 4096 ||
    m[1].length > 100000 ||
    m[4].length > 100000
  )
    throw Error("BAD_PACKER");
  const literal = (s) => s.replace(/\\(['\\/])/g, "$1");
  const words = literal(m[4]).split("|"),
    digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    table = new Map();
  for (let i = 0; i < count; i++) {
    let n = i,
      key = "";
    do {
      key = digits[n % radix] + key;
      n = Math.floor(n / radix);
    } while (n);
    if (words[i]) table.set(key, words[i]);
  }
  return literal(m[1]).replace(/\b\w+\b/g, (k) => table.get(k) || k);
}
function urls(html, config) {
  const plain = unpack(html).replaceAll("\\/", "/").replaceAll("&amp;", "&");
  return [
    ...new Set(
      plain.match(
        /https:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|webm|mkv|mpd|ts|m2ts)(?:\?[^\s"'<>\\]*)?/g,
      ) || [],
    ),
  ].filter((v) => {
    try {
      assertUrl(v, config, true);
      return true;
    } catch {
      return false;
    }
  });
}
function format(value) {
  const p = new URL(value).pathname.toLowerCase();
  return p.endsWith(".m3u8")
    ? "hls"
    : p.endsWith(".mpd")
      ? "dash"
      : p.endsWith(".mkv")
        ? "matroska"
        : p.split(".").pop();
}
export async function resolveProvider(ref, config, fetchImpl = fetch) {
  const source = decodeRef(ref, config),
    cookies = new Map();
  let calls = 0;
  async function page(value, referer = config.origin + "/", depth = 0) {
    const u = assertUrl(value, config);
    if (++calls > 18) throw Error("FETCH_BUDGET");
    const headers = {
      "User-Agent": UA,
      Referer: referer,
      Accept: "text/html,application/json",
    };
    if (u.origin === config.origin && cookies.size)
      headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await fetchImpl(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers,
    });
    if (u.origin === config.origin)
      for (const raw of r.headers.getSetCookie?.() || []) {
        const p = raw.split(";")[0],
          i = p.indexOf("=");
        if (i > 0) cookies.set(p.slice(0, i), p.slice(i + 1));
      }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel();
      if (depth === 3 || !r.headers.get("location"))
        throw Error("REDIRECT_LIMIT");
      const next = new URL(r.headers.get("location"), u);
      try {
        assertUrl(next, config, true);
        return `<source src="${next.href}">`;
      } catch {}
      return page(next, referer, depth + 1);
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Error("UPSTREAM_HTTP_" + r.status);
    }
    return limitedText(r);
  }
  let html = await page(source),
    candidates = [],
    headers = { Referer: source.href, "User-Agent": UA };
  if (config.provider === "alooy") {
    headers.Origin = source.origin;
    candidates = urls(html, config);
  }
  if (config.provider === "akoam") {
    const watches = [...html.matchAll(/href=["']([^"']*\/watch\/[^"']+)["']/g)]
      .map((m) => new URL(m[1].replaceAll("&amp;", "&"), source).href)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 3);
    for (const watch of watches) {
      let current = watch,
        referer = source.href;
      for (let depth = 0; depth < 3; depth++) {
        const body = await page(current, referer);
        const found = urls(body, config);
        if (found.length) {
          candidates.push(
            ...found.map((url) => ({
              url,
              headers: { Referer: current, "User-Agent": UA },
            })),
          );
          break;
        }
        const next = unpack(body).match(
          /(?:<iframe[^>]+src|location(?:\.href|\.replace|\.assign)?)\s*(?:=|\()\s*["']([^"']+)["']/i,
        )?.[1];
        if (!next) break;
        referer = current;
        current = assertUrl(new URL(next, current), config).href;
      }
    }
  }
  if (config.provider === "3isk") {
    const see = await page(source.href + "see/", source.href);
    let wrapper = see.match(
      /https:\/\/[^\s"'<>]+\/embed\/\d+\/\d+\/[12]\//,
    )?.[0];
    if (!wrapper) {
      const post = html.match(/\bpostid-(\d+)\b/)?.[1];
      if (post)
        wrapper = `${config.origin}/embed/1/${post}/${source.pathname.includes("/movies/") ? 1 : 2}/`;
    }
    if (!wrapper) throw Error("EMBED_NOT_FOUND");
    const w = assertUrl(wrapper, config);
    if (
      w.origin !== config.origin ||
      !/^\/embed\/\d+\/\d+\/[12]\/$/.test(w.pathname)
    )
      throw Error("BAD_WRAPPER");
    const middle = await page(w.href, config.origin + "/");
    const players = [...middle.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => new URL(m[1], w))
      .filter((u) => config.playerHosts.includes(u.hostname));
    if (!players.length) throw Error("PLAYER_NOT_FOUND");
    const player = players[0];
    const mira = player.hostname === "miravd.com";
    if (
      !(mira ? /^\/embed-[a-zA-Z0-9]+\.html$/ : /^\/e\/[\w-]+\/?$/).test(
        player.pathname,
      )
    )
      throw Error("BAD_PLAYER");
    const body = await page(player, mira ? w.href : config.origin + "/");
    headers = { Referer: mira ? player.origin + "/" : "", "User-Agent": UA };
    const apiLiteral = !mira && body.match(/\bfetch\(\s*("(?:\\.|[^"\\])*")/);
    if (apiLiteral) {
      const api = new URL(JSON.parse(apiLiteral[1]), player);
      if (
        api.origin !== player.origin ||
        !/^\/api\/videos\/[\w-]+\/playback$/.test(api.pathname)
      )
        throw Error("BAD_PLAYER_API");
      const json = JSON.parse(await page(api, player.href));
      candidates = [assertUrl(json.url, config, true).href];
    } else candidates = urls(body, config);
    if (!mira)
      candidates = candidates.map((url) => ({
        url,
        headers: { ...headers, Referer: new URL(url).origin + "/" },
      }));
  }
  const results = await Promise.allSettled(
    candidates.slice(0, 4).map(async (c) => {
      const url = assertUrl(typeof c === "string" ? c : c.url, config, true),
        requestHeaders = typeof c === "string" ? headers : c.headers;
      let current = url,
        r;
      for (let d = 0; d < 3; d++) {
        r = await fetchImpl(current, {
          method: "HEAD",
          redirect: "manual",
          headers: requestHeaders,
          signal: AbortSignal.timeout(5000),
        });
        await r.body?.cancel();
        if (![301, 302, 303, 307, 308].includes(r.status)) break;
        const next = r.headers.get("location");
        if (!next) throw Error("BAD_MEDIA_REDIRECT");
        current = assertUrl(new URL(next, current), config, true);
      }
      if (!r.ok) throw Error("MEDIA_HTTP_" + r.status);
      const rawExpiry = Number(current.searchParams.get("expires"));
      const expires = Math.min(
        Date.now() + 240000,
        rawExpiry > 0 ? rawExpiry * 1000 : Infinity,
      );
      if (expires < Date.now() + 30000) throw Error("STREAM_EXPIRED");
      let webPlayable = false;
      if (config.provider !== "alooy") {
        try {
          const browser = await fetchImpl(current, {
            method: "HEAD",
            redirect: "manual",
            signal: AbortSignal.timeout(3000),
            headers: {
              Origin: "https://th-505.github.io",
              Referer: "https://th-505.github.io/",
              "User-Agent": UA,
            },
          });
          await browser.body?.cancel();
          const acao = browser.headers.get("access-control-allow-origin");
          webPlayable =
            browser.ok && (acao === "*" || acao === "https://th-505.github.io");
        } catch {}
      }
      return {
        web_playable: webPlayable,
        provider: config.label,
        provider_id: config.provider,
        format: format(current.href),
        url: current.href,
        headers: requestHeaders,
        quality: current.pathname.match(/(\d{3,4})p\b/i)?.[0] || "تلقائي",
        expires_at: new Date(expires).toISOString(),
        playback_mode:
          config.provider === "alooy" ? "edge_local_proxy" : "edge_direct",
        source_ref: ref,
      };
    }),
  );
  const sources = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  if (!sources.length) throw Error("NO_HEALTHY_SOURCES");
  return { sources, fetches: calls };
}
export default {
  async fetch(request, env) {
    try {
      const u = new URL(request.url);
      if (request.method !== "GET" || u.pathname !== "/resolve")
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      const r = await resolveProvider(
        u.searchParams.get("ref") || "",
        typeof env.PROVIDER_CONFIG === "string"
          ? JSON.parse(env.PROVIDER_CONFIG)
          : env.PROVIDER_CONFIG,
      );
      return Response.json(r);
    } catch (e) {
      return Response.json(
        { error: String(e.message).slice(0, 100) },
        { status: 502 },
      );
    }
  },
};
