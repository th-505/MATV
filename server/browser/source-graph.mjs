import * as cheerio from "cheerio";
import {
  scanEpisodeIndex,
  referenceUrl,
  shortHash,
} from "../harvest/episode-index.mjs";
import { identityTitle } from "../scrapers/content-discovery.mjs";
import {
  explicitEpisode,
  explicitSeason,
} from "../../shared/content-identity.js";
import { resolveSafeUrl } from "../scrapers/shared/http.mjs";
const titleKey = (value) =>
  identityTitle(value)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
const cut = (value) =>
  /مدبلج|dubbed/i.test(value)
    ? "dubbed"
    : /مترجم|subtit/i.test(value)
      ? "subtitled"
      : null;
/** Only observed, same-site links. Episode seeds are entry points, never the whole work. */
export function scanSourceGraph(
  html,
  url,
  { provider, domains, details } = {},
) {
  const index = scanEpisodeIndex(html, url, {
    provider,
    domains,
    title: details.title,
    episodes: details.episodes || [],
  });
  const $ = cheerio.load(html),
    parents = new Set(index.parents),
    neighbors = new Set(),
    rows = new Map(index.episodes.map((e) => [e.url, e]));
  const key = titleKey(
      details.series_title || details.parent_title || details.title,
    ),
    edition = cut(details.title);
  const safe = (href) =>
    resolveSafeUrl(href, url, { allowHttp: false, allowedHosts: domains });
  const ref = (href) =>
    provider + ":" + Buffer.from(href).toString("base64url");
  const ownEpisode = explicitEpisode(details.title, url);
  if (ownEpisode)
    rows.set(url, {
      url,
      source_ref: ref(url),
      title: details.title,
      season: explicitSeason(details.title, url) || 1,
      episode: ownEpisode,
    });
  $("a[href]").each((_, el) => {
    const a = $(el),
      href = safe(a.attr("href"));
    if (!href || href === url) return;
    const label = (a.attr("title") || a.text()).replace(/\s+/g, " ").trim();
    if (edition && cut(label) && edition !== cut(label)) return;
    const expectedYear = String(details.year || details.title).match(
        /\b(?:19|20)\d{2}\b/,
      )?.[0],
      actualYear = label.match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (expectedYear && actualYear && expectedYear !== actualYear) return;
    const same = Boolean(key && titleKey(label) === key);
    const number = explicitEpisode(label, href);
    if (same && number) {
      rows.set(href, {
        url: href,
        source_ref: ref(href),
        title: label,
        season:
          explicitSeason(label, href) ||
          explicitSeason(details.title, url) ||
          1,
        episode: number,
      });
      return;
    }
    const parentContext =
      a.is('[rel="up"]') ||
      a.closest(
        ".breadcrumb,.breadcrumbs,.episode-parent,.series-info,.season-list,.seasons,.seasons-list,.SeasonsList",
      ).length > 0;
    if (
      !number &&
      a.closest(".season-list,.seasons,.seasons-list,.SeasonsList").length &&
      /^(?:الموسم|موسم|season)\s*/i.test(label) &&
      explicitSeason(label, href)
    ) {
      parents.add(href);
      return;
    }
    if (
      same &&
      !number &&
      (parentContext ||
        /\/(?:series|serie|season|show|مسلسل|انمي|anime)\//i.test(
          new URL(href).pathname,
        ))
    )
      parents.add(href);
    const navigation =
      a.closest(
        ".episode-navigation,.episodes-navigation,.next-episode,.prev-episode,.episode-nav",
      ).length > 0;
    if (
      number &&
      (navigation || a.is('[rel="prev"],[rel="next"]')) &&
      (same || /الحلقة|الحلقه|episode/i.test(label))
    )
      neighbors.add(href);
  });
  return {
    ...index,
    episodes: [...rows.values()].sort(
      (a, b) => a.season - b.season || a.episode - b.episode,
    ),
    parents: [...parents],
    neighbors: [...neighbors],
    fingerprint: shortHash([...rows.keys()].sort().join("\n")),
  };
}
export { referenceUrl };
