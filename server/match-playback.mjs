import crypto from "node:crypto";
import net from "node:net";

const REF_TTL_MS = 15 * 60_000;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function isPrivateIpv4(host) {
  const parts = host.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

function isPrivateIpv6(host) {
  const h = host.toLowerCase();
  return (
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80:")
  );
}

export function assertPublicHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("MATCH_URL_HTTPS_REQUIRED");
  if (url.username || url.password)
    throw new Error("MATCH_URL_CREDENTIALS_REJECTED");
  if (url.port && url.port !== "443")
    throw new Error("MATCH_URL_PORT_REJECTED");
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    throw new Error("MATCH_URL_HOST_REJECTED");
  const ipKind = net.isIP(host);
  if (
    (ipKind === 4 && isPrivateIpv4(host)) ||
    (ipKind === 6 && isPrivateIpv6(host))
  )
    throw new Error("MATCH_URL_PRIVATE_IP");
  return url;
}

function inferType(url, rawType = "") {
  const type = text(rawType).toLowerCase();
  if (["m3u8", "hls"].includes(type)) return "m3u8";
  if (["mp4", "video/mp4"].includes(type)) return "mp4";
  if (["mpeg-ts", "mpegts", "ts", "video/mp2t"].includes(type)) return "stream";
  const target = text(url).toLowerCase();
  if (/\.m3u8(?:$|\?)/.test(target)) return "m3u8";
  if (/\.mp4(?:$|\?)/.test(target)) return "mp4";
  if (/\.(?:ts|m2ts)(?:$|\?)/.test(target)) return "stream";
  return "embed";
}

function prune(map) {
  const now = Date.now();
  for (const [key, entry] of map) if (entry.expiresAt <= now) map.delete(key);
  while (map.size > 256) map.delete(map.keys().next().value);
}

function store(map, value) {
  prune(map);
  const id = crypto.randomBytes(18).toString("base64url");
  map.set(id, { ...value, expiresAt: Date.now() + REF_TTL_MS });
  return id;
}

function resolveRef(map, ref, code) {
  const id = text(ref).replace(/^[^:]+:/, "");
  const entry = map.get(id);
  if (!entry || entry.expiresAt <= Date.now()) {
    map.delete(id);
    throw new Error(code);
  }
  return entry;
}

function decodeCandidateValue(value) {
  return text(value)
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
}

function candidateUrls(html, baseUrl) {
  const direct = [];
  const nested = [];
  const seen = new Set();
  const add = (rawValue) => {
    const decoded = decodeCandidateValue(rawValue);
    if (
      !decoded ||
      decoded.startsWith("data:") ||
      decoded.startsWith("javascript:")
    )
      return;
    try {
      const url = assertPublicHttpsUrl(new URL(decoded, baseUrl).href).href;
      if (seen.has(url)) return;
      seen.add(url);
      if (inferType(url) === "embed") nested.push(url);
      else direct.push(url);
    } catch {}
  };

  const patterns = [
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
    /<(?:iframe)[^>]+src=["']([^"']+)["']/gi,
    /data-(?:src|url|file|hls|manifest|playlist)=["']([^"']+)["']/gi,
    /(?:file|src|url|source|hls|manifest|playlist)\s*[:=]\s*["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    for (const match of String(html || "").matchAll(re)) add(match[1]);
  }

  for (const match of String(html || "").matchAll(/https?:\\\/\\\/[^"'\s<]+/gi))
    add(match[0]);
  for (const match of String(html || "").matchAll(
    /atob\(\s*["']([A-Za-z0-9+/=]{12,})["']\s*\)/gi,
  )) {
    try {
      add(Buffer.from(match[1], "base64").toString("utf8"));
    } catch {}
  }
  return { direct, nested };
}

export function __candidateUrlsForTest(html, baseUrl = "https://example.org/") {
  return candidateUrls(html, baseUrl);
}

export function createMatchPlaybackRuntime({ fetchServers, matchOrigin }) {
  if (typeof fetchServers !== "function")
    throw new TypeError("fetchServers is required");
  const workerOrigin = new URL(matchOrigin).origin;
  const matches = new Map();
  const servers = new Map();

  function maskMatchesPayload(payload) {
    const list = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];
    const data = list.map((match) => {
      const raw = text(match?.link || match?.url || match?.ref);
      let ref = "";
      if (raw) {
        const target = new URL(raw);
        if (target.origin !== workerOrigin) throw new Error("BAD_MATCH_TARGET");
        ref = `match:${store(matches, { url: target.href })}`;
      }
      return { ...match, link: ref, ref };
    });
    return Array.isArray(payload) ? data : { ...payload, data };
  }

  async function listServers(matchRef) {
    const match = resolveRef(matches, matchRef, "MATCH_REFERENCE_EXPIRED");
    const payload = await fetchServers(match.url);
    const list = Array.isArray(payload?.servers) ? payload.servers : [];
    return list
      .map((server, index) => {
        const raw = text(server?.url || server?.src);
        if (!raw) return null;
        const target = assertPublicHttpsUrl(raw);
        const type = inferType(target.href, server?.type);
        const ref = `server:${store(servers, { url: target.href, type, name: text(server?.name) || `سيرفر ${index + 1}` })}`;
        return { ref, name: text(server?.name) || `سيرفر ${index + 1}`, type };
      })
      .filter(Boolean);
  }

  async function resolveServer(serverRef) {
    const server = resolveRef(
      servers,
      serverRef,
      "MATCH_SERVER_REFERENCE_EXPIRED",
    );
    let resolved = null;
    if (server.type !== "embed") {
      resolved = { url: server.url, referer: "", type: server.type };
    } else {
      throw new Error("MATCH_EMBED_REQUIRES_EDGE_RESOLVER");
    }
    if (!resolved?.url) throw new Error("NO_MATCH_MEDIA");
    const target = assertPublicHttpsUrl(resolved.url);
    const mediaType =
      resolved.type === "m3u8"
        ? "m3u8"
        : resolved.type === "mp4"
          ? "mp4"
          : "stream";
    return {
      media_path: target.href,
      stream_url: target.href,
      media_type: mediaType,
      playback_mode: "direct",
      headers: { Referer: server.url },
      server_name: server.name,
    };
  }

  async function proxyMedia(_req, res) {
    res.statusCode = 410;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        status: "error",
        message: "MATCH_PROXY_RETIRED_USE_DIRECT_PLAYBACK",
      }),
    );
  }

  return { maskMatchesPayload, listServers, resolveServer, proxyMedia };
}
