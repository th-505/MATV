import { limitedText, unpack } from "./provider.mjs";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1";
const MOVIE_CATEGORIES = ["all_movies_13", "arabic-movies35", "indian-movies9", "6-asian-movies", "anime-movies-7", "7-aflammdblgh", "8-aflam3isk"];
const FEED_GENRES = { all_movies_13: "foreign", "arabic-movies35": "arabic", "indian-movies9": "indian", "6-asian-movies": "asian", "anime-movies-7": "anime", "7-aflammdblgh": "dubbed", "8-aflam3isk": "turkish" };
export const LAROZA_CONFIG = Object.freeze({
  provider: "laroza", label: "Laroza", origin: "https://larooza.beer",
  pageHosts: ["larooza.beer", "mp5.okhd.site", "mp4plus.org", "vidspeed.org", "vidmoly.net", "vidmoly.biz"],
  playerHosts: ["mp5.okhd.site", "mp4plus.org", "vidspeed.org", "vidmoly.net", "vidmoly.biz"],
  mediaHosts: ["cdn2.okprimeone.site", "*.cdnz.quest", "*.vmget.online"],
  imageHosts: ["larooza.beer"], subtitleHosts: ["larooza.beer", "cdn2.okprimeone.site", "*.cdnz.quest", "*.vmget.online"],
  fetchBudget: 40, timeoutMs: 8000,
});
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const un64 = (s) => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)));
const hostMatches = (host, allowed = []) => allowed.some((v) => v.startsWith("*.") ? host.endsWith(v.slice(1)) && host !== v.slice(2) : host === v);
function safeUrl(value, hosts, base) {
  if (String(value).length > 4096) throw Error("LAROZA_URL_REJECTED");
  const u = new URL(value, base);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash || !hostMatches(u.hostname, hosts)) throw Error("LAROZA_URL_REJECTED");
  return u;
}
function exactQuery(u, keys) {
  const actual = [...u.searchParams.keys()];
  if (actual.length !== keys.length || keys.some((k) => u.searchParams.getAll(k).length !== 1) || actual.some((k) => !keys.includes(k))) throw Error("BAD_LAROZA_REFERENCE");
}
export function permanentLarozaUrl(value, config = LAROZA_CONFIG) {
  const configuredOrigin = new URL(config.origin);
  const u = safeUrl(value, [configuredOrigin.hostname], config.origin);
  if (u.origin !== configuredOrigin.origin) throw Error("BAD_LAROZA_REFERENCE");
  const key = u.pathname === "/view-serie1.php" ? "ser" : ["/video.php", "/play.php"].includes(u.pathname) ? "vid" : null;
  if (!key) throw Error("BAD_LAROZA_REFERENCE");
  exactQuery(u, [key]);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(u.searchParams.get(key))) throw Error("BAD_LAROZA_REFERENCE");
  if (key === "vid") u.pathname = "/play.php";
  u.search = "?" + key + "=" + u.searchParams.get(key);
  return u;
}
export function larozaRef(value, config = LAROZA_CONFIG) {
  const u = permanentLarozaUrl(value, config);
  return "laroza:" + b64(u.pathname + u.search);
}
export function decodeLarozaRef(ref, config = LAROZA_CONFIG, playable = false) {
  if (!/^laroza:[A-Za-z0-9_-]{1,1493}$/.test(ref)) throw Error("BAD_LAROZA_REFERENCE");
  let raw;
  try { raw = un64(ref.slice(7)); } catch { throw Error("BAD_LAROZA_REFERENCE"); }
  if (!raw.startsWith("/") || raw.startsWith("//")) throw Error("BAD_LAROZA_REFERENCE");
  const u = permanentLarozaUrl(raw, config);
  if (larozaRef(u, config) !== ref) throw Error("BAD_LAROZA_REFERENCE");
  if (playable && u.pathname !== "/play.php") throw Error("LAROZA_SERIES_METADATA_ONLY");
  return u;
}
function entity(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, n) => {
    const names = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (!n.startsWith("#")) return names[n.toLowerCase()];
    const cp = n[1].toLowerCase() === "x" ? parseInt(n.slice(2), 16) : Number(n.slice(1));
    return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "\ufffd";
  });
}
function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    if (Object.keys(out).length >= 80) break;
    out[m[1].toLowerCase()] = entity(m[2] ?? m[3] ?? m[4] ?? "").slice(0, 8192);
  }
  return out;
}
// A bounded tree is enough for the provider's cards/episode groups. Scripts are data,
// never executed, and are excluded entirely from metadata/advertising link traversal.
function tree(html) {
  const root = { tag: "root", a: {}, children: [] }, stack = [root];
  const clean = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  let count = 0;
  for (const m of clean.matchAll(/<[^>]{1,8192}>|[^<]+/g)) {
    const part = m[0];
    if (++count > 18000) throw Error("LAROZA_HTML_LIMIT");
    if (!part.startsWith("<")) { stack.at(-1).children.push(entity(part)); continue; }
    const end = part.match(/^<\/([a-z][\w-]*)/i);
    if (end) {
      const i = stack.findLastIndex((n) => n.tag === end[1].toLowerCase());
      if (i > 0) stack.length = i;
      continue;
    }
    const start = part.match(/^<([a-z][\w-]*)\b([^>]*)>/i);
    if (!start) continue;
    const node = { tag: start[1].toLowerCase(), a: attrs(start[2]), children: [], parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(node.tag) && !part.endsWith("/>")) {
      if (stack.length >= 100) throw Error("LAROZA_HTML_LIMIT");
      stack.push(node);
    }
  }
  return root;
}
function nodes(root, predicate) {
  const out = [], pending = [root];
  while (pending.length) {
    const n = pending.pop();
    if (predicate(n)) out.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) if (typeof n.children[i] !== "string") pending.push(n.children[i]);
  }
  return out;
}
const hasClass = (n, value) => (n.a.class || "").split(/\s+/).includes(value);
function text(n) {
  if (!n) return "";
  const parts = [], pending = [n];
  while (pending.length) {
    const v = pending.pop();
    if (typeof v === "string") parts.push(v);
    else for (let i = v.children.length - 1; i >= 0; i--) pending.push(v.children[i]);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
}
function safeImage(value, config) {
  if (!String(value || "").trim()) return "";
  try { return safeUrl(value, config.imageHosts, config.origin).href; } catch { return ""; }
}
const ORDINAL_SEASONS = new Map([
  ["الاول", 1], ["الاولى", 1], ["الثاني", 2], ["الثانية", 2], ["الثالث", 3], ["الثالثة", 3],
  ["الرابع", 4], ["الرابعة", 4], ["الخامس", 5], ["الخامسة", 5], ["السادس", 6], ["السادسة", 6],
  ["السابع", 7], ["السابعة", 7], ["الثامن", 8], ["الثامنة", 8], ["التاسع", 9], ["التاسعة", 9],
  ["العاشر", 10], ["العاشرة", 10], ["الحادي عشر", 11], ["الحادية عشرة", 11],
  ["الثاني عشر", 12], ["الثانية عشرة", 12], ["الثالث عشر", 13], ["الثالثة عشرة", 13],
  ["الرابع عشر", 14], ["الرابعة عشرة", 14], ["الخامس عشر", 15], ["الخامسة عشرة", 15],
  ["السادس عشر", 16], ["السادسة عشرة", 16], ["السابع عشر", 17], ["السابعة عشرة", 17],
  ["الثامن عشر", 18], ["الثامنة عشرة", 18], ["التاسع عشر", 19], ["التاسعة عشرة", 19],
  ["العشرون", 20], ["العشرين", 20],
]);
export function explicitLarozaSeason(title) {
  const normalized = title.replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا");
  const numeric = normalized.match(/(?:الموسم|موسم|season|\bS)\s*([0-9٠-٩]+)/i)?.[1];
  if (numeric) {
    const value = Number(numeric.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)));
    return value >= 1 && value <= 999 ? value : null;
  }
  // Ordinals are accepted only after the explicit season label. Titles such
  // as "The Fifth" and episode ordinals never imply a season or a timeline.
  const match = normalized.match(/الموسم\s+([\u0621-\u063a\u0641-\u064a]+)(?:\s+([\u0621-\u063a\u0641-\u064a]+))?/);
  if (!match) return null;
  const compound = match[2] ? `${match[1]} ${match[2]}` : "";
  if (ORDINAL_SEASONS.has(compound)) return ORDINAL_SEASONS.get(compound);
  if (["عشر", "عشرة"].includes(match[2])) return null;
  return ORDINAL_SEASONS.get(match[1]) || null;
}
function metadata(title, type, section = "") {
  const episode = title.match(/(?:الحلقة|حلقة|episode|\bE)\s*([0-9٠-٩]+)/i);
  const digits = (s) => String(s).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660));
  const dubbed = /مدبلج/.test(title);
  return {
    type, year: Number(title.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) || null,
    genres: section === "anime" || /أنمي|انمي|كرتون/.test(title) ? ["anime"] : [],
    audio_language: dubbed ? "ar" : null,
    edition: dubbed ? "arabic-dubbed" : "unknown",
    season_number: explicitLarozaSeason(title),
    episode_number: episode ? Number(digits(episode[1])) : null,
    imdb_id: null, identity_verified: false,
  };
}
function rawCardItem(card, config, section) {
  let link, u;
  for (const m of card.matchAll(/<a\b([^>]{1,8192})>/gi)) {
    const a = attrs(m[1]);
    try { u = permanentLarozaUrl(a.href, config); link = a; break; } catch {}
  }
  if (!link) return null;
  const img = attrs(card.match(/<img\b([^>]{1,8192})>/i)?.[1] || "");
  const heading = card.match(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]\s*>/i)?.[1];
  const title = (heading ? entity(heading.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim() : link.title || link["aria-label"] || img.alt || "").slice(0, 300);
  if (!title) return null;
  const type = u.pathname === "/view-serie1.php" || /مسلسل|الحلقة|حلقة|series|episode/i.test(title) ? "series" : /فيلم|movie|film/i.test(title) || section === "movies" ? "movie" : "unknown";
  return { id: u.searchParams.get("ser") || u.searchParams.get("vid"), ref: "laroza:" + b64(u.pathname + u.search), source: "laroza", title, poster: safeImage(img["data-echo"] || img["data-original-thumbnail"] || img["data-src"] || img.src || "", config), ...metadata(title, type, section) };
}
export function parseLarozaCatalog(html, config = LAROZA_CONFIG, section = "latest") {
  const seen = new Set(), data = [], cards = [];
  // Parse only declared card fragments. Building a tree for navigation/SVGs,
  // comments and advertisements in seven category pages wastes free-tier CPU.
  const clean = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const m of clean.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) if (/\b(?:pm-video-thumb|lr-series-card|serie-card)\b/.test(m[1])) cards.push(m[1]);
  for (const m of clean.matchAll(/<article\b[^>]*\bclass=["'][^"']*\bls-card\b[^"']*["'][^>]*>([\s\S]*?)<\/article\s*>/gi)) cards.push(m[1]);
  const sliderStarts = [...clean.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bsub-card\b[^"']*["'][^>]*>/gi)];
  for (let i = 0; i < sliderStarts.length; i++) cards.push(clean.slice(sliderStarts[i].index, Math.min(sliderStarts[i + 1]?.index || clean.length, sliderStarts[i].index + 12000)));
  for (const card of cards.slice(0, 300)) {
    const item = rawCardItem(card, config, section);
    if (item && !seen.has(item.ref)) { data.push(item); seen.add(item.ref); }
    if (data.length >= 60) break;
  }
  return data;
}
function hasNextPage(html, current) {
  for (const m of html.matchAll(/<a\b[^>]{0,8192}?\bhref=["']([^"']*\bpage=\d+[^"']*)["']/gi)) {
    try {
      const next = new URL(entity(m[1]), current);
      if (next.origin !== current.origin || next.pathname !== current.pathname || next.searchParams.get("cat") !== current.searchParams.get("cat") || next.searchParams.get("keywords") !== current.searchParams.get("keywords")) continue;
      if (Number(next.searchParams.get("page")) === Number(current.searchParams.get("page")) + 1) return true;
    } catch {}
  }
  return false;
}
function meta(root, name) {
  return nodes(root, (n) => n.tag === "meta" && [n.a.name, n.a.property, n.a.itemprop].includes(name))[0]?.a.content || "";
}
export function parseLarozaDetails(html, ref, config = LAROZA_CONFIG) {
  const u = decodeLarozaRef(ref, config), root = tree(html);
  const main = nodes(root, (n) => n.a.id === "content")[0] || nodes(root, (n) => hasClass(n, "pm-video-watch-main"))[0] || nodes(root, (n) => hasClass(n, "pm-section-highlighted"))[0] || root;
  const title = (text(nodes(main, (n) => n.tag === "h1")[0]) || text(nodes(root, (n) => n.tag === "h1")[0]) || meta(root, "og:title") || text(nodes(root, (n) => n.tag === "title")[0]).replace(/\s*-\s*فيديو لاروزا\s*$/, "")).slice(0, 300);
  const type = u.pathname === "/view-serie1.php" || /مسلسل|الحلقة|حلقة/i.test(title) ? "series" : "movie";
  const base = { id: u.searchParams.get("ser") || u.searchParams.get("vid"), ref, source: "laroza", title, poster: safeImage(meta(root, "og:image") || meta(root, "thumbnailUrl"), config), ...metadata(title, type) };
  const episodes = [], seen = new Set();
  // Only the source's declared same-work episode areas are traversed. Related
  // recommendations, footer links, comments and generic video links are ignored.
  const areas = u.pathname === "/view-serie1.php" ? nodes(main, (n) => hasClass(n, "SeasonsEpisodes") || hasClass(n, "ls-episodes")) : [];
  for (const area of areas) {
    const areaSeason = /^\d{1,3}$/.test(area.a["data-serie"] || "") ? Number(area.a["data-serie"]) : base.season_number;
    for (const a of nodes(area, (n) => n.tag === "a" && n.a.href)) {
      let episodeUrl;
      try { episodeUrl = permanentLarozaUrl(a.a.href, config); } catch { continue; }
      if (episodeUrl.pathname !== "/play.php") continue;
      const episodeTitle = (a.a.title || text(a) || "").slice(0, 300);
      const info = metadata(episodeTitle, "series");
      const declared = a.parent?.a["data-episode"];
      const number = info.episode_number || (/^\d{1,4}$/.test(declared || "") ? Number(declared) : Number(text(nodes(a, (n) => n.tag === "em")[0])));
      const episodeRef = larozaRef(episodeUrl, config);
      if (!number || number < 1 || number > 9999 || seen.has(episodeRef)) continue;
      seen.add(episodeRef);
      episodes.push({ id: episodeUrl.searchParams.get("vid"), episode_id: episodeUrl.searchParams.get("vid"), title: episodeTitle || `الحلقة ${number}`, ref: episodeRef, source: "laroza", episode_number: number, season_number: info.season_number || areaSeason || null, watch_available: true, edition: info.edition === "unknown" ? base.edition : info.edition });
      if (episodes.length >= 200) break;
    }
  }
  episodes.sort((a, b) => (a.season_number || 0) - (b.season_number || 0) || a.episode_number - b.episode_number);
  // Only an explicit IMDb link inside this work's main content proves identity.
  const imdb = nodes(main, (n) => n.tag === "a" && n.a.href && /^https:\/\/(?:www\.)?imdb\.com\/title\/tt\d{7,10}\/?(?:\?[^#]*)?$/.test(n.a.href))[0]?.a.href.match(/tt\d{7,10}/)?.[0] || null;
  return { ...base, imdb_id: imdb, work_identity_verified: imdb !== null, identity_verified: false, timeline_verified: false, description: meta(root, "description").slice(0, 2000), backdrop: base.poster, episodes, subtitles: [], download_available: false };
}
function format(url) { const path = url.pathname.toLowerCase(); return path.endsWith(".m3u8") ? "hls" : path.endsWith(".webm") ? "webm" : "mp4"; }
function mediaUrl(raw, config, base) {
  if (String(raw).length > 2048) throw Error("BAD_LAROZA_MEDIA");
  const u = safeUrl(entity(raw).replaceAll("\\/", "/"), config.mediaHosts, base);
  if (!/\.(m3u8|mp4|webm)$/i.test(u.pathname)) throw Error("BAD_LAROZA_MEDIA");
  return u;
}
function subtitle(raw, config, base, headers, language, title) {
  try {
    const u = safeUrl(entity(raw).replaceAll("\\/", "/"), config.subtitleHosts, base);
    const ext = u.pathname.match(/\.(srt|vtt|ass)$/i)?.[1].toLowerCase();
    if (!ext) return null;
    if (u.href.length > 2048) return null;
    return { id: b64(u.origin + u.pathname), provider: "laroza", url: u.href, format: ext, language: /^(ar|ara|Arabic|العربية)$/i.test(language || title || "") ? "ara" : String(language || "und").slice(0, 12), label: String(title || language || "ترجمة").slice(0, 100), headers, kind: "subtitles", origin: "attached", encoding_hint: null };
  } catch { return null; }
}
export function larozaPlayerData(html, page, config = LAROZA_CONFIG) {
  const plain = (html + "\n" + unpack(html)).replaceAll("\\/", "/").replaceAll("&amp;", "&");
  const candidates = [], seen = new Set(), headers = { Referer: page, Origin: new URL(page).origin, "User-Agent": UA };
  const add = (raw) => { try { const u = mediaUrl(raw, config, page); if (!seen.has(u.href)) { candidates.push(u.href); seen.add(u.href); } } catch {} };
  for (const m of plain.matchAll(/(?:\bfile\s*:\s*|<(?:source|video)\b[^>]*\bsrc\s*=\s*)["']([^"']+)["']/gi)) add(m[1]);
  for (const m of plain.matchAll(/https:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>\\]*)?/g)) add(m[0]);
  const subtitles = [];
  const addSub = (d) => { if (d && subtitles.length < 8 && !subtitles.some((s) => s.url === d.url)) subtitles.push(d); };
  for (const m of plain.matchAll(/<track\b([^>]{1,8192})>/gi)) {
    const a = attrs(m[1]);
    if (["subtitles", "captions"].includes((a.kind || "").toLowerCase())) addSub(subtitle(a.src, config, page, headers, a.srclang, a.label));
  }
  // Literal JWPlayer track objects only; arbitrary expressions/JS are ignored.
  for (const list of plain.matchAll(/\btracks\s*:\s*\[([^\]]{0,12000})\]/gi)) for (const m of list[1].matchAll(/\{([^{}]{1,4096})\}/g)) {
    const values = {};
    for (const p of m[1].matchAll(/(?:["']?)(file|kind|label|language)(?:["']?)\s*:\s*["']((?:\\.|[^"'\\])*)["']/g)) values[p[1]] = entity(p[2]);
    if (["subtitles", "captions"].includes(values.kind)) addSub(subtitle(values.file, config, page, headers, values.language, values.label));
  }
  return { candidates: candidates.slice(0, 4), subtitles, headers };
}
export function larozaExpiry(url, now = Date.now()) {
  let expiry = now + 240000;
  const epoch = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n > 1e12 ? n : n * 1000 : Infinity; };
  for (const key of ["expires", "expire", "exp", "expires_at"]) if (url.searchParams.has(key)) expiry = Math.min(expiry, epoch(url.searchParams.get(key)));
  const start = Number(url.searchParams.get("s")), duration = Number(url.searchParams.get("e"));
  if (start > 1e9 && start < 1e11 && duration > 0 && duration < 864000) expiry = Math.min(expiry, (start + duration) * 1000);
  else if (duration > 1e9) expiry = Math.min(expiry, epoch(duration));
  if (expiry < now + 30000) throw Error("LAROZA_STREAM_EXPIRED");
  return expiry;
}
export function createLarozaEdge({ fetchImpl = fetch, config = LAROZA_CONFIG, now = Date.now } = {}) {
  config = { ...LAROZA_CONFIG, ...config };
  const origin = new URL(config.origin);
  safeUrl(origin, [origin.hostname]);
  let calls = 0;
  const budget = Math.min(40, Math.max(1, Number(config.fetchBudget) || 40));
  const timeout = Math.min(20000, Math.max(1000, Number(config.timeoutMs) || 8000));
  const signal = AbortSignal.timeout(20000);
  async function request(url, options) {
    if (signal.aborted) throw Error("LAROZA_TIMEOUT");
    if (calls >= budget) throw Error("LAROZA_FETCH_BUDGET");
    calls++;
    return fetchImpl(url, { ...options, redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
  }
  function pageUrl(raw, metadataOnly = false) {
    const u = safeUrl(raw, metadataOnly ? [origin.hostname] : config.pageHosts, origin);
    if (u.origin === origin.origin) {
      if (["/play.php", "/view-serie1.php"].includes(u.pathname)) return permanentLarozaUrl(u, config);
      const allowed = { "/newvideos1.php": ["page"], "/moslslat4.php": ["page"], "/category.php": ["cat", "page"], "/search.php": ["keywords", "page"] }[u.pathname];
      if (!allowed) throw Error("LAROZA_URL_REJECTED");
      exactQuery(u, allowed);
      if (!/^[1-9]\d{0,3}$/.test(u.searchParams.get("page")) || Number(u.searchParams.get("page")) > 1000) throw Error("BAD_LAROZA_PAGE");
      if (u.pathname === "/category.php" && ![...MOVIE_CATEGORIES, "6-anime-series"].includes(u.searchParams.get("cat"))) throw Error("LAROZA_URL_REJECTED");
      if (u.pathname === "/search.php" && !validQuery(u.searchParams.get("keywords"))) throw Error("BAD_LAROZA_QUERY");
    } else if (!config.playerHosts.includes(u.hostname) || !/^\/embed-[A-Za-z0-9]+\.html$/.test(u.pathname) || u.search) throw Error("LAROZA_URL_REJECTED");
    return u;
  }
  async function page(raw, referer = origin.href, metadataOnly = false) {
    let current = pageUrl(raw, metadataOnly);
    for (let depth = 0; depth <= 3; depth++) {
      const r = await request(current, { headers: { "User-Agent": UA, Referer: referer, Accept: "text/html" } });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        await r.body?.cancel();
        if (depth === 3 || !r.headers.get("location")) throw Error("LAROZA_REDIRECT_LIMIT");
        current = pageUrl(new URL(r.headers.get("location"), current), metadataOnly);
        continue;
      }
      if (!r.ok) { await r.body?.cancel(); throw Error("LAROZA_UPSTREAM_HTTP_" + r.status); }
      const type = r.headers.get("content-type") || "";
      if (type && !/^text\/html\b/i.test(type)) { await r.body?.cancel(); throw Error("LAROZA_BAD_PAGE_TYPE"); }
      return { html: await limitedText(r, 512 * 1024), url: current };
    }
  }
  function pageNumber(value) { if (!/^[1-9]\d{0,3}$/.test(String(value)) || Number(value) > 1000) throw Error("BAD_LAROZA_PAGE"); return Number(value); }
  async function category(section = "latest", number = 1) {
    const p = pageNumber(number);
    const paths = { latest: ["/newvideos1.php"], series: ["/moslslat4.php"], anime: ["/category.php?cat=6-anime-series", "/category.php?cat=anime-movies-7"], movies: [] }[section];
    if (!paths) throw Error("BAD_LAROZA_SECTION");
    const feeds = section === "movies" ? [0, 1].map((slot) => {
      const offset = 2 * (p - 1) + slot;
      return { path: "/category.php?cat=" + MOVIE_CATEGORIES[offset % MOVIE_CATEGORIES.length], page: Math.floor(offset / MOVIE_CATEGORIES.length) + 1 };
    }) : paths.map((path) => ({ path, page: p }));
    const results = await Promise.allSettled(feeds.map(async (feed) => {
      const u = new URL(feed.path, origin); u.searchParams.set("page", String(feed.page));
      const r = await page(u, origin.href, true), genre = FEED_GENRES[u.searchParams.get("cat")];
      const items = parseLarozaCatalog(r.html, config, section).map((item) => genre ? { ...item, feed: u.searchParams.get("cat"), genres: [...new Set([...item.genres, genre])] } : item);
      return { items, has_more: hasNextPage(r.html, u) };
    }));
    if (results.every((r) => r.status === "rejected")) throw Error("LAROZA_CATALOG_UNAVAILABLE");
    const complete = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const data = [...new Map(complete.flatMap((r) => r.items).map((i) => [i.ref, i])).values()].slice(0, 60);
    const hasMore = complete.some((r) => r.has_more || (section === "movies" && r.items.length > 0));
    return { status: "success", source: "laroza", data, page: p, section, has_more: hasMore, pagination: { page: p, has_more: hasMore, next_page: p < 1000 ? p + 1 : null, ...(section === "movies" ? { bounded_feed_rotation: true } : {}) } };
  }
  async function search(query, number = 1) {
    if (!validQuery(query)) throw Error("BAD_LAROZA_QUERY");
    const p = pageNumber(number), u = new URL("/search.php", origin);
    u.searchParams.set("keywords", query.trim()); u.searchParams.set("page", String(p));
    const r = await page(u, origin.href, true);
    const hasMore = hasNextPage(r.html, u);
    return { status: "success", source: "laroza", data: parseLarozaCatalog(r.html, config), page: p, has_more: hasMore, pagination: { page: p, has_more: hasMore, next_page: hasMore && p < 1000 ? p + 1 : null } };
  }
  async function details(ref) { const u = decodeLarozaRef(ref, config), r = await page(u, origin.href, true); return { status: "success", source: "laroza", data: parseLarozaDetails(r.html, ref, config) }; }
  async function mediaHead(raw, headers) {
    let u = mediaUrl(raw, config), response;
    for (let depth = 0; depth <= 3; depth++) {
      response = await request(u, { method: "HEAD", headers });
      await response.body?.cancel();
      if (![301, 302, 303, 307, 308].includes(response.status)) return { url: u, response };
      if (depth === 3 || !response.headers.get("location")) throw Error("LAROZA_REDIRECT_LIMIT");
      u = mediaUrl(response.headers.get("location"), config, u);
    }
  }
  async function resolve(ref) {
    const source = decodeLarozaRef(ref, config, true), r = await page(source), root = tree(r.html);
    const area = nodes(root, (n) => hasClass(n, "WatchList"))[0];
    if (!area) throw Error("LAROZA_SERVERS_NOT_FOUND");
    const preferred = ["mp5.okhd.site", "vidspeed.org", "vidmoly.net", "vidmoly.biz", "mp4plus.org"], picked = new Map();
    for (const n of nodes(area, (n) => n.tag === "li" && n.a["data-embed-url"])) {
      try { const u = pageUrl(n.a["data-embed-url"]); if (config.playerHosts.includes(u.hostname)) picked.set(u.hostname === "vidmoly.biz" ? "vidmoly.net" : u.hostname, u); } catch {}
    }
    const players = [...picked.values()].sort((a, b) => preferred.indexOf(a.hostname) - preferred.indexOf(b.hostname)).slice(0, 4);
    const info = parseLarozaDetails(r.html, ref, config);
    const results = await Promise.allSettled(players.map(async (player) => {
      const p = await page(player, source.href), found = larozaPlayerData(p.html, p.url.href, config);
      for (const candidate of found.candidates.slice(0, 2)) {
        try {
          const head = await mediaHead(candidate, found.headers);
          if (!head.response.ok) continue;
          const type = head.response.headers.get("content-type") || "";
          if (type && !/^(video\/(mp4|webm)|application\/(vnd\.apple\.mpegurl|x-mpegurl)|audio\/mpegurl|application\/octet-stream)\b/i.test(type)) continue;
          const expires = larozaExpiry(head.url, now());
          let webPlayable = false;
          try {
            const browser = await mediaHead(head.url, { Origin: "https://th-505.github.io", Referer: "https://th-505.github.io/", "User-Agent": UA });
            const acao = browser.response.headers.get("access-control-allow-origin");
            webPlayable = browser.response.ok && ["*", "https://th-505.github.io"].includes(acao) && ["hls", "mp4", "webm"].includes(format(browser.url));
          } catch {}
          return { provider_id: "laroza", provider: config.label, source_ref: ref, url: head.url.href, format: format(head.url), playback_mode: "edge_direct", headers: found.headers, expires_at: new Date(expires).toISOString(), web_playable: webPlayable, quality: head.url.pathname.match(/\b(\d{3,4})p\b/i)?.[0] || "تلقائي", server: p.url.hostname, edition: info.edition, audio_language: info.audio_language, identity_verified: false, timeline_verified: false, subtitles: found.subtitles };
        } catch (e) { if (["LAROZA_FETCH_BUDGET", "LAROZA_TIMEOUT"].includes(e.message)) throw e; }
      }
      throw Error("LAROZA_SERVER_UNAVAILABLE");
    }));
    const sources = results.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!sources.length) throw Error("NO_HEALTHY_LAROZA_SOURCES");
    const body = { status: "success", schema_version: 1, source: "laroza", sources, fetches: calls };
    const size = () => new TextEncoder().encode(JSON.stringify(body)).length;
    // Stream references are more valuable than optional subtitle descriptors.
    // Keep the resolver's response small enough for the gateway contract.
    while (size() > 12000 && sources.some((s) => s.subtitles.length)) for (const s of sources) s.subtitles.pop();
    while (size() > 12000 && sources.length > 1) sources.pop();
    if (size() > 12000) throw Error("LAROZA_RESPONSE_TOO_LARGE");
    return body;
  }
  return { category, search, details, resolve, get fetches() { return calls; } };
}
function validQuery(query) { return typeof query === "string" && query.trim().length >= 2 && query.trim().length <= 120 && !/[\u0000-\u001f\u007f]/.test(query); }
export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (request.method !== "GET") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const keys = { "/category": ["section", "page"], "/search": ["q", "page"], "/details": ["ref"], "/resolve": ["ref"] }[u.pathname];
    if (!keys) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if ([...u.searchParams.keys()].some((k) => !keys.includes(k) || u.searchParams.getAll(k).length !== 1)) return Response.json({ error: "BAD_LAROZA_QUERY" }, { status: 400 });
    try {
      const config = typeof env.PROVIDER_CONFIG === "string" ? JSON.parse(env.PROVIDER_CONFIG) : env.PROVIDER_CONFIG;
      const engine = createLarozaEdge({ config });
      const body = u.pathname === "/category" ? await engine.category(u.searchParams.get("section") || "latest", u.searchParams.get("page") || "1") : u.pathname === "/search" ? await engine.search(u.searchParams.get("q") || "", u.searchParams.get("page") || "1") : u.pathname === "/details" ? await engine.details(u.searchParams.get("ref") || "") : await engine.resolve(u.searchParams.get("ref") || "");
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const error = /^[A-Z_0-9]+$/.test(e.message || "") ? e.message : "LAROZA_PROVIDER_UNAVAILABLE";
      return Response.json({ error }, { status: /^(BAD_|LAROZA_SERIES_METADATA_ONLY)/.test(error) ? 400 : 503 });
    }
  },
};
