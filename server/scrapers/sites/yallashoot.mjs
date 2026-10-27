// server/scrapers/sites/yallashoot.mjs
// Standalone provider module for YallaShoot (يلا شوت - Yalla Shoot, code: YS)
// Specialized for live match scheduling, tournament tracking, and channel broadcasting
import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl
} from '../shared/http.mjs';
import {
  normalizeDigits,
  cleanTitleText,
  normalizeCatalogItem,
  normalizeDetailsResult,
  normalizeServerList
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  attachResultMeta,
  createEmptyArrayResult,
  classifyNetworkError
} from '../shared/errors.mjs';
import {
  unwrapEmbedToDirectStreams,
  isValidDirectMediaUrl,
  extractRawStreamsFromText
} from '../stream-unwrapper.mjs';

export const PROVIDER_META = Object.freeze({
  id: 'yallashoot',
  name: 'يلا شوت (Yalla Shoot)',
  code: 'YS',
  domains: Object.freeze(['https://yalla-shootz.cc', 'https://yalla-shoot.tv']),
  mirrorOf: null,
  capabilities: Object.freeze({
    catalog: true,
    search: false,
    details: true,
    episodes: false,
    servers: true,
    resolve: true,
    live: true
  }),
  searchSpec: null,
  notImplemented: Object.freeze({})
});

export const YALLASHOOT_SITE_CONFIG = Object.freeze({
  id: 'yallashoot',
  name: 'يلا شوت (Yalla Shoot)',
  code: 'YS',
  baseUrl: 'https://yalla-shootz.cc',
  fallbackBaseUrl: 'https://yalla-shoot.tv',
  domains: Object.freeze(['https://yalla-shootz.cc', 'https://yalla-shoot.tv']),
  categories: Object.freeze({
    all: '/matches-today',
    today: '/matches-today',
    yesterday: '/matches-yesterday',
    tomorrow: '/matches-tomorrow',
    live: '/matches-today'
  })
});

const ACTIVE_DOMAINS = ['https://yalla-shootz.cc', 'https://yalla-shoot.tv'];

/**
 * Rewrites legacy or redirected YallaShoot hostnames to the primary active domain.
 */
export function rewriteToActiveYallaShootDomain(rawUrl = '', preferredOrigin = YALLASHOOT_SITE_CONFIG.baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('/')) {
    return `${preferredOrigin.replace(/\/+$/, '')}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('yalla-shoot.tv') || parsed.hostname.includes('yalla-shootz.cc')) {
      const preferred = new URL(preferredOrigin);
      parsed.protocol = preferred.protocol;
      parsed.host = preferred.host;
      return parsed.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Decodes provider reference string (e.g. yallashoot:<base64url>) or raw URL.
 */
export function resolveYallaShootTargetUrl(urlOrRef = '', preferredOrigin = YALLASHOOT_SITE_CONFIG.baseUrl) {
  if (!urlOrRef || typeof urlOrRef !== 'string') return '';
  const trimmed = urlOrRef.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('yallashoot:')) {
    const rawRef = trimmed.slice('yallashoot:'.length);
    if (rawRef.startsWith('http://') || rawRef.startsWith('https://')) {
      return rewriteToActiveYallaShootDomain(rawRef, preferredOrigin);
    }
    try {
      const decoded = Buffer.from(rawRef, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
        return rewriteToActiveYallaShootDomain(decoded, preferredOrigin);
      }
    } catch {
      // Fallback
    }
  }

  return rewriteToActiveYallaShootDomain(trimmed, preferredOrigin);
}

/**
 * Parses match cards from raw HTML of YallaShoot pages.
 */
export function parseMatchesFromHtml(html = '', baseUrl = YALLASHOOT_SITE_CONFIG.baseUrl, options = {}) {
  const { liveOnly = false } = options;
  if (!html || typeof html !== 'string') {
    return [];
  }

  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $('.match-container, .match-item').each((_, el) => {
    const node = $(el);

    // 1. Teams & Logos
    const rightTeam =
      node.find('.right-team .team-name, .team-1 .team-name').text().trim() ||
      node.find('.right-team, .team-1').find('.name, span').first().text().trim();

    const rightImgNode = node.find('.right-team img, .team-1 img').first();
    const rightLogo =
      rightImgNode.attr('data-src') ||
      rightImgNode.attr('src') ||
      '';

    const leftTeam =
      node.find('.left-team .team-name, .team-2 .team-name').text().trim() ||
      node.find('.left-team, .team-2').find('.name, span').first().text().trim();

    const leftImgNode = node.find('.left-team img, .team-2 img').first();
    const leftLogo =
      leftImgNode.attr('data-src') ||
      leftImgNode.attr('src') ||
      '';

    if (!rightTeam && !leftTeam) {
      return;
    }

    // 2. Timing, Result, Status
    const rawTime = node.find('.match-time, .time').text().trim();
    const matchTime = normalizeDigits(rawTime);
    const rawScore = node.find('.result, .match-result, .score').text().trim();
    const score = normalizeDigits(rawScore);

    const statusNode = node.find('.date, .match-status');
    const statusText = statusNode.text().trim();
    const containerClasses = (node.attr('class') || '').toLowerCase();

    let status = 'upcoming';
    const isLive =
      containerClasses.includes('live') ||
      containerClasses.includes('in-progress') ||
      /مباشر|جاري الآن|جارية الآن|الشوط الأول|الشوط الثاني/i.test(statusText);

    const isFinished =
      containerClasses.includes('end') ||
      /انتهت|نهاية/i.test(statusText);

    if (isLive) {
      status = 'live';
    } else if (isFinished) {
      status = 'finished';
    } else {
      status = 'upcoming';
    }

    if (liveOnly && status !== 'live') {
      return;
    }

    // 3. Channel, Commentator, Tournament
    const infoItems = node.find('.match-info ul li');
    const channel = infoItems.eq(0).text().trim();
    const commentator = infoItems.eq(1).text().trim();
    const tournament = infoItems.eq(2).text().trim();

    // 4. Link & Title
    const linkNode = node.find('a').first();
    const rawHref = linkNode.attr('href') || node.attr('href') || '';
    const resolvedUrl = resolveSafeUrl(rawHref, baseUrl);

    if (!resolvedUrl || seenUrls.has(resolvedUrl)) {
      return;
    }
    seenUrls.add(resolvedUrl);

    const cardTitle = linkNode.attr('title') || `${rightTeam} ضد ${leftTeam}`;
    const cleanTitle = cleanTitleText(cardTitle) || `${rightTeam} ضد ${leftTeam}`;
    const ref = `yallashoot:${Buffer.from(resolvedUrl).toString('base64url')}`;
    const poster = rightLogo && !rightLogo.startsWith('data:') ? rightLogo : leftLogo && !leftLogo.startsWith('data:') ? leftLogo : '';

    items.push({
      id: ref,
      ref,
      title: cleanTitle,
      originalTitle: cardTitle,
      teams: {
        team1: { name: rightTeam, logo: rightLogo },
        team2: { name: leftTeam, logo: leftLogo }
      },
      team1: { name: rightTeam, logo: rightLogo },
      team2: { name: leftTeam, logo: leftLogo },
      score,
      time: matchTime,
      status,
      tournament: tournament || 'مباراة كرة قدم',
      channel: channel || 'غير معروف',
      commentator: commentator || 'غير معروف',
      url: resolvedUrl,
      sourceUrl: resolvedUrl,
      poster,
      image: poster,
      year: new Date().getFullYear().toString(),
      type: 'live',
      category: 'match',
      is_series: false,
      source: 'yallashoot',
      serverPrefix: 'YS'
    });
  });

  return items;
}

/**
 * Scrapes match schedules by category (today, yesterday, tomorrow, live).
 */
export async function scrapeCatalog(category = 'today', page = 1, options = {}) {
  const normCategory = String(category || 'today').trim().toLowerCase();
  const pageNum = parseInt(page, 10) || 1;

  // Single-page schedule layout per date: page > 1 has no additional matches
  if (pageNum > 1) {
    return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_MORE_PAGES', {
      category: normCategory,
      page: pageNum
    });
  }

  let relPath = YALLASHOOT_SITE_CONFIG.categories[normCategory] || YALLASHOOT_SITE_CONFIG.categories.today;
  const targetUrl = `${YALLASHOOT_SITE_CONFIG.baseUrl}${relPath}`;

  try {
    const fetchRes = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      referer: YALLASHOOT_SITE_CONFIG.baseUrl
    });

    if (!fetchRes.ok && fetchRes.status === 404) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'CATALOG_NOT_FOUND', {
        category: normCategory,
        url: targetUrl
      });
    }

    const liveOnly = normCategory === 'live';
    const items = parseMatchesFromHtml(fetchRes.html, fetchRes.url || targetUrl, { liveOnly });

    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'NO_MATCHES_FOUND', {
        category: normCategory,
        url: targetUrl
      });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_META.id,
      category: normCategory,
      page: pageNum,
      count: items.length,
      url: targetUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
  }
}

/**
 * Scrapes currently active live matches.
 */
export async function scrapeLive(options = {}) {
  try {
    const res = await scrapeCatalog('live', 1, options);
    return res;
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: YALLASHOOT_SITE_CONFIG.baseUrl });
  }
}

/**
 * Search is genuinely unsupported on YallaShoot (site does not index matches for search).
 */
export async function scrapeSearch(query = '', page = 1, options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'YallaShoot does not support search query for matches',
    { query, page }
  );
}

/**
 * Episodes capability is unsupported for live sports broadcasts.
 */
export async function scrapeEpisodes(urlOrRef = '', options = {}) {
  return createEmptyArrayResult(
    PROVIDER_META.id,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'Sports live broadcasts are standalone events without episodes',
    { urlOrRef }
  );
}

/**
 * Scrapes match details and info card.
 */
export async function scrapeDetails(urlOrRef = '', options = {}) {
  const targetUrl = resolveYallaShootTargetUrl(urlOrRef);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_OR_EMPTY_MATCH_URL', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  try {
    const fetchRes = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      referer: YALLASHOOT_SITE_CONFIG.baseUrl
    });

    if (!fetchRes.ok && (fetchRes.status === 404 || fetchRes.status === 410)) {
      throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, `MATCH_NOT_FOUND_${fetchRes.status}`, {
        providerId: PROVIDER_META.id,
        url: targetUrl,
        status: fetchRes.status
      });
    }

    const $ = cheerio.load(fetchRes.html);

    // Title
    const rawTitle =
      $('h1.EntryTitle, h1').first().text().trim() ||
      $('title').text().split('|')[0].trim() ||
      'مباراة كرة قدم';
    const title = cleanTitleText(rawTitle);

    // Overview
    const overview = $('.entry-content p, .entry p').first().text().trim();

    // Table data
    let tournament = '';
    let matchDate = '';
    let matchTime = '';
    let channel = '';
    let commentator = '';
    let stadium = '';

    $('.AY-MatchInfo table tr, table.table-bordered tr, table tr').each((_, tr) => {
      const header = $(tr).find('th').text().trim();
      const val = $(tr).find('td').text().trim();
      if (/البطولة/i.test(header)) tournament = val;
      else if (/تاريخ/i.test(header)) matchDate = normalizeDigits(val);
      else if (/توقيت/i.test(header)) matchTime = normalizeDigits(val);
      else if (/قناة|القناة/i.test(header)) channel = val;
      else if (/معلق|المعلق/i.test(header)) commentator = val;
      else if (/ملعب|الملعب/i.test(header)) stadium = val;
    });

    // Derive teams and team logos
    let team1Name = '';
    let team1Logo = '';
    let team2Name = '';
    let team2Logo = '';

    // A) Real match card header: .baMatch .colmd
    const colmds = $('.baMatch .colmd:not(.ce), .coMatch .colmd:not(.ce)');
    if (colmds.length >= 2) {
      const col1 = colmds.eq(0);
      team1Name = col1.find('.teamname').text().trim();
      team1Logo =
        col1.find('.teamlogo').attr('data-src') ||
        col1.find('.teamlogo img').attr('data-src') ||
        col1.find('.teamlogo img').attr('src') ||
        '';

      const col2 = colmds.eq(1);
      team2Name = col2.find('.teamname').text().trim();
      team2Logo =
        col2.find('.teamlogo').attr('data-src') ||
        col2.find('.teamlogo img').attr('data-src') ||
        col2.find('.teamlogo img').attr('src') ||
        '';
    }

    // B) Alba Live Matches single view: .alm-single .AC_Team
    if (!team1Name && !team2Name) {
      const almTeams = $('.alm-single .AC_Team, .alm-stadium .AC_Team');
      if (almTeams.length >= 2) {
        const t1 = almTeams.eq(0);
        team1Name = t1.find('.AC_TeamTitle').text().trim();
        team1Logo =
          t1.find('.AC_TeamImg img').attr('data-src') ||
          t1.find('.AC_TeamImg img').attr('src') ||
          '';

        const t2 = almTeams.eq(1);
        team2Name = t2.find('.AC_TeamTitle').text().trim();
        team2Logo =
          t2.find('.AC_TeamImg img').attr('data-src') ||
          t2.find('.AC_TeamImg img').attr('src') ||
          '';
      }
    }

    // C) Fallback title regex: "إيفرتون و تشيلسي" or "إيفرتون ضد تشيلسي"
    if (!team1Name || !team2Name) {
      const vsMatch = title.match(/(.+?)\s+(?:و|Vs|vs|ضد)\s+(.+)/i);
      if (vsMatch) {
        if (!team1Name) team1Name = vsMatch[1].trim();
        if (!team2Name) team2Name = vsMatch[2].trim();
      }
    }

    const poster = team1Logo || team2Logo || '';

    // Extract servers on page if available
    let servers = [];
    try {
      servers = await scrapeServers(targetUrl, {
        ...options,
        fixtureHtml: fetchRes.html
      });
    } catch {
      servers = [];
    }

    const ref = `yallashoot:${Buffer.from(targetUrl).toString('base64url')}`;
    const result = {
      id: ref,
      ref,
      title,
      originalTitle: rawTitle,
      poster,
      image: poster,
      overview,
      story: overview,
      tournament: tournament || 'مباراة كرة قدم',
      date: matchDate,
      time: matchTime,
      channel: channel || 'غير معروف',
      commentator: commentator || 'غير معروف',
      stadium: stadium || '',
      teams: {
        team1: { name: team1Name, logo: team1Logo },
        team2: { name: team2Name, logo: team2Logo }
      },
      team1: { name: team1Name, logo: team1Logo },
      team2: { name: team2Name, logo: team2Logo },
      status: servers.length > 0 ? 'live' : 'scheduled',
      type: 'live',
      category: 'match',
      is_series: false,
      source: 'yallashoot',
      sourceUrl: targetUrl,
      servers: Array.isArray(servers) ? servers : [],
      episodes: [],
      seasons: []
    };

    return attachResultMeta(result, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: targetUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
  }
}

/**
 * Scrapes server embeds and streams for a match page.
 */
export async function scrapeServers(urlOrRef = '', options = {}) {
  const targetUrl = resolveYallaShootTargetUrl(urlOrRef);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_OR_EMPTY_MATCH_URL', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  try {
    const fetchRes = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_META.id,
      referer: YALLASHOOT_SITE_CONFIG.baseUrl
    });

    if (!fetchRes.ok && (fetchRes.status === 404 || fetchRes.status === 410)) {
      return createEmptyArrayResult(PROVIDER_META.id, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'MATCH_NOT_FOUND', {
        url: targetUrl
      });
    }

    const $ = cheerio.load(fetchRes.html);
    const rawServers = [];
    const seenUrls = new Set();

    // 1. Alba Live Matches plugin server tabs: .asp-server-name a
    $('.asp-server-name a').each((i, el) => {
      const a = $(el);
      const name = a.text().trim() || `سيرفر ${i + 1}`;
      const rawUrl =
        a.attr('data-url') ||
        a.attr('data-src') ||
        a.attr('data-embed') ||
        a.attr('href') ||
        '';

      const trimmedUrl = String(rawUrl || '').trim();
      if (!trimmedUrl || trimmedUrl.startsWith('#') || trimmedUrl.startsWith('javascript:')) {
        return;
      }

      const resolved = resolveSafeUrl(trimmedUrl, targetUrl);
      if (
        !resolved ||
        seenUrls.has(resolved) ||
        resolved === targetUrl ||
        resolved.endsWith('#') ||
        resolved.startsWith(`${targetUrl}#`)
      ) {
        return;
      }

      seenUrls.add(resolved);
      rawServers.push({
        name,
        url: resolved,
        quality: name.includes('متعدد') ? 'MULTI-QUALITY' : 'HD'
      });
    });

    // 2. Video serv links: .video-serv a
    $('.video-serv a').each((i, el) => {
      const a = $(el);
      const name = a.text().trim() || `سيرفر ${rawServers.length + 1}`;
      const rawUrl = a.attr('data-url') || a.attr('data-src') || a.attr('href') || '';
      const trimmedUrl = String(rawUrl || '').trim();
      if (!trimmedUrl || trimmedUrl.startsWith('#') || trimmedUrl.startsWith('javascript:')) {
        return;
      }

      const resolved = resolveSafeUrl(trimmedUrl, targetUrl);
      if (
        !resolved ||
        seenUrls.has(resolved) ||
        resolved === targetUrl ||
        resolved.endsWith('#') ||
        resolved.startsWith(`${targetUrl}#`)
      ) {
        return;
      }

      seenUrls.add(resolved);
      rawServers.push({
        name,
        url: resolved,
        quality: null
      });
    });

    // 3. Direct iframes: .asp-server-body iframe, .server-body iframe, .AlbaEmbed iframe, .entry iframe
    $('.asp-server-body iframe, .server-body iframe, .AlbaEmbed iframe, .entry iframe, iframe').each((i, el) => {
      const iframe = $(el);
      const src = iframe.attr('src') || iframe.attr('data-src') || '';
      const trimmedSrc = String(src || '').trim();
      if (!trimmedSrc || trimmedSrc.startsWith('#') || trimmedSrc.startsWith('javascript:')) {
        return;
      }

      const resolved = resolveSafeUrl(trimmedSrc, targetUrl);
      if (
        resolved &&
        !seenUrls.has(resolved) &&
        resolved !== targetUrl &&
        !resolved.endsWith('#') &&
        !resolved.startsWith(`${targetUrl}#`) &&
        !/googleads|doubleclick|facebook|disqus|twitter|recaptcha/i.test(resolved)
      ) {
        seenUrls.add(resolved);
        rawServers.push({
          name: `مشغل البث الرئيسي ${rawServers.length + 1}`,
          url: resolved,
          quality: 'AUTO-HLS'
        });
      }
    });

    // 4. Raw streams inside scripts (extractRawStreamsFromText returns an array of stream objects)
    const textStreams = extractRawStreamsFromText(fetchRes.html, targetUrl);
    if (Array.isArray(textStreams)) {
      for (const streamItem of textStreams) {
        const streamUrl = streamItem?.url || '';
        const resolved = resolveSafeUrl(streamUrl, targetUrl);
        if (resolved && !seenUrls.has(resolved)) {
          seenUrls.add(resolved);
          rawServers.push({
            name: `بث مباشر ${(streamItem.streamType || 'm3u8').toUpperCase()}`,
            url: resolved,
            type: streamItem.streamType || 'm3u8',
            quality: streamItem.quality || 'AUTO-HLS'
          });
        }
      }
    }

    if (rawServers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_META.id,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'NO_SERVERS_AVAILABLE',
        { url: targetUrl }
      );
    }

    // Assign standard server codes: YS-1, YS-2...
    const normalized = rawServers.map((srv, idx) => {
      const code = `YS-${idx + 1}`;
      const streamType =
        srv.type ||
        (srv.url.toLowerCase().includes('.m3u8') || srv.url.toLowerCase().includes('/hls/')
          ? 'm3u8'
          : srv.url.toLowerCase().includes('.mp4')
            ? 'mp4'
            : 'embed');

      return {
        id: `yallashoot-srv-${idx + 1}`,
        code,
        serverCode: code,
        name: srv.name || `سيرفر ${idx + 1}`,
        label: `${code} - ${srv.name || 'بث مباشر'}`,
        url: srv.url,
        quality: srv.quality || '',
        type: streamType,
        streamType,
        source: 'yallashoot',
        headers: {
          Referer: targetUrl,
          Origin: new URL(targetUrl).origin
        },
        verified: false
      };
    });

    return attachResultMeta(normalized, {
      ok: true,
      providerId: PROVIDER_META.id,
      count: normalized.length,
      url: targetUrl
    });
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw classifyNetworkError(err, { providerId: PROVIDER_META.id, url: targetUrl });
  }
}

/**
 * Resolves a stream URL or embed to direct media playback.
 */
export async function resolveStream(urlOrRef = '', options = {}) {
  const targetUrl = resolveYallaShootTargetUrl(urlOrRef);
  if (!targetUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.UNSAFE_URL, 'INVALID_STREAM_URL', {
      providerId: PROVIDER_META.id,
      url: urlOrRef
    });
  }

  // 1. Direct media URL (.m3u8 or .mp4)
  if (isValidDirectMediaUrl(targetUrl)) {
    const isHls = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls/');
    let verified = false;

    if (options.verifyPlayback && !options.fixtureHtml) {
      try {
        const probeRes = await fetchSafeResponse(targetUrl, {
          timeoutMs: 5000,
          headers: { Referer: options.referer || YALLASHOOT_SITE_CONFIG.baseUrl }
        });
        if (probeRes.ok && (probeRes.html.includes('#EXTM3U') || probeRes.status === 200 || probeRes.status === 206)) {
          verified = true;
        }
      } catch {
        verified = false;
      }
    }

    const resolved = {
      url: targetUrl,
      type: isHls ? 'm3u8' : 'mp4',
      streamType: isHls ? 'm3u8' : 'mp4',
      headers: {
        Referer: options.referer || YALLASHOOT_SITE_CONFIG.baseUrl,
        Origin: new URL(YALLASHOOT_SITE_CONFIG.baseUrl).origin
      },
      verified
    };

    return attachResultMeta(resolved, {
      ok: true,
      providerId: PROVIDER_META.id,
      url: targetUrl
    });
  }

  // 2. Embed URL: attempt unwrapping
  try {
    const unwrapped = await unwrapEmbedToDirectStreams(targetUrl, {
      referer: options.referer || YALLASHOOT_SITE_CONFIG.baseUrl,
      timeoutMs: options.timeoutMs || 10000
    });

    if (unwrapped && unwrapped.length > 0) {
      const topStream = unwrapped[0];
      const resolved = {
        url: topStream.url,
        type: topStream.type || 'm3u8',
        streamType: topStream.type || 'm3u8',
        headers: topStream.headers || { Referer: targetUrl },
        verified: false
      };
      return attachResultMeta(resolved, {
        ok: true,
        providerId: PROVIDER_META.id,
        url: targetUrl
      });
    }
  } catch {
    // Fall back to returning embed
  }

  // 3. Fallback: return embed iframe URL
  const resolved = {
    url: targetUrl,
    type: 'embed',
    streamType: 'embed',
    headers: {
      Referer: options.referer || YALLASHOOT_SITE_CONFIG.baseUrl
    },
    verified: false
  };

  return attachResultMeta(resolved, {
    ok: true,
    providerId: PROVIDER_META.id,
    url: targetUrl
  });
}

/**
 * Backward compatibility bridge for supervisor6 and existing callers.
 */
export async function scrapeYallaShootMatches(options = {}) {
  try {
    const catalog = await scrapeCatalog('today', 1, options);
    return catalog.map((item) => ({
      team1: item.team1 || { name: item.teams?.team1?.name || '' },
      team2: item.team2 || { name: item.teams?.team2?.name || '' },
      time: item.time || '',
      status: item.status || 'upcoming',
      link: item.url || item.link || '',
      channel: item.channel || '',
      commentator: item.commentator || '',
      tournament: item.tournament || '',
      score: item.score || ''
    }));
  } catch (err) {
    console.warn('YallaShoot matches scrape error:', err.message);
    return [];
  }
}
