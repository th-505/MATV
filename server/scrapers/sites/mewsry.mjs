// server/scrapers/sites/mewsry.mjs
// Standalone scraper module for Syria Live / Mewsry (https://www.manasorya.site / https://www.mewsry.live) — Code: MY
//
// Domain & Architecture Contract:
// - Primary live domain: https://www.manasorya.site
// - Historical/mirror domains: https://www.mewsry.live, https://www.soryatv.live (both 301 redirect to www.manasorya.site)
// - Platform: WordPress + Aboooda Sports + ENI Matches theme
// - Capabilities:
//   - catalog (match schedules: today, yesterday, tomorrow)
//   - live (today's active and upcoming live matches)
//   - search (WordPress ?s={query} query combined with team schedule filter)
//   - details (structured match / event / video details)
//   - servers (unwrapped video streams / embeds with MY-1, MY-2.. codes)
//   - resolve (stream verification and recursive unwrap)
//   - episodes (unsupported: live sports matches are standalone events without episodes)
// - Backward Compatibility:
//   - Exports extractMewsryStreams(targetUrl) matching specialized-portals.mjs contract

import * as cheerio from 'cheerio';
import {
  fetchProviderHtml,
  fetchSafeResponse,
  resolveSafeUrl,
  assertSafeScraperUrl
} from '../shared/http.mjs';
import {
  cleanTitleText,
  normalizeDigits
} from '../shared/normalize.mjs';
import {
  SCRAPER_ERROR_CODES,
  ScraperError,
  classifyNetworkError,
  attachResultMeta,
  createEmptyArrayResult
} from '../shared/errors.mjs';
import {
  extractRawStreamsFromText,
  isValidDirectMediaUrl,
  unwrapEmbedToDirectStreams,
  unwrapBase64BridgeUrl,
  unpackDeanEdwards
} from '../stream-unwrapper.mjs';

const PROVIDER_ID = 'mewsry';
const PROVIDER_NAME = 'سوريا لايف (Mewsry / Syria Live)';
const PROVIDER_CODE = 'MY';
const PRIMARY_DOMAIN = 'https://www.manasorya.site';
const FALLBACK_DOMAINS = ['https://www.mewsry.live', 'https://www.soryatv.live'];

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_DOMAIN, ...FALLBACK_DOMAINS]),
  mirrorOf: null,
  capabilities: Object.freeze({
    catalog: true,
    search: true,
    details: true,
    episodes: false,
    servers: true,
    resolve: true,
    live: true
  }),
  searchSpec: Object.freeze({
    method: 'GET',
    pathTemplate: '/?s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: false
  }),
  notImplemented: Object.freeze({
    episodes: 'Sports matches are standalone live events and do not feature serialized seasons or episodes'
  })
});

export const MEWSRY_CONFIG = Object.freeze({
  id: PROVIDER_ID,
  key: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_DOMAIN,
  fallbackUrl: FALLBACK_DOMAINS[0],
  domains: Object.freeze([PRIMARY_DOMAIN, ...FALLBACK_DOMAINS]),
  categories: Object.freeze({
    today: '/?match_day=today',
    yesterday: '/?match_day=yesterday',
    tomorrow: '/?match_day=tomorrow',
    live: '/?match_day=today',
    matches: '/?match_day=today',
    home: '/'
  })
});

/**
 * Decodes a provider reference (`mewsry:...`, `mewsry:match:...`, base64url, or relative URL)
 * into a safe absolute URL on or referenced by Mewsry / Syria Live.
 */
export function resolveTargetUrl(urlOrRef = '', fallbackPath = '/') {
  if (!urlOrRef) {
    return resolveSafeUrl(fallbackPath, MEWSRY_CONFIG.baseUrl, { allowHttp: true });
  }

  if (typeof urlOrRef === 'object') {
    const candidate =
      urlOrRef.url || urlOrRef.sourceUrl || urlOrRef.href || urlOrRef.link || urlOrRef.ref || '';
    return resolveTargetUrl(candidate, fallbackPath);
  }

  let raw = String(urlOrRef).trim();

  // Strip known provider prefixes
  for (const prefix of ['mewsry:match:', 'mewsry:ep:', 'mewsry:', 'legacy:mewsry:']) {
    if (raw.toLowerCase().startsWith(prefix)) {
      raw = raw.slice(prefix.length).trim();
      break;
    }
  }

  if (!raw) {
    return resolveSafeUrl(fallbackPath, MEWSRY_CONFIG.baseUrl, { allowHttp: true });
  }

  // Handle base64url or base64 encoded URL
  if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/') && !raw.startsWith('?')) {
    for (const encoding of ['base64url', 'base64']) {
      try {
        const decoded = Buffer.from(raw, encoding).toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/')) {
          raw = decoded;
          break;
        }
      } catch (_) {}
    }
  }

  // Handle match slug syntax: home-vs-away:ts
  if (raw.includes('-vs-') && !raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) {
    return resolveSafeUrl(`/?match=${encodeURIComponent(raw)}`, MEWSRY_CONFIG.baseUrl, { allowHttp: true });
  }

  return resolveSafeUrl(raw, MEWSRY_CONFIG.baseUrl, { allowHttp: true });
}

/**
 * Extracts and normalizes .eni-match match cards from Syria Live HTML.
 */
export function parseMatchesFromHtml(html, baseUrl = MEWSRY_CONFIG.baseUrl, day = 'today') {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];

  $('.eni-match').each((_, el) => {
    const node = $(el);
    const homeName = node.find('.eni-team-home span').text().trim();
    const rawHomeLogo = node.find('.eni-team-home img').attr('src') || node.find('.eni-team-home img').attr('data-src') || '';
    const homeLogo = rawHomeLogo ? resolveSafeUrl(rawHomeLogo, baseUrl, { allowHttp: true }) : '';

    const awayName = node.find('.eni-team-away span').text().trim();
    const rawAwayLogo = node.find('.eni-team-away img').attr('src') || node.find('.eni-team-away img').attr('data-src') || '';
    const awayLogo = rawAwayLogo ? resolveSafeUrl(rawAwayLogo, baseUrl, { allowHttp: true }) : '';

    const comp = node.find('.eni-competition').text().trim();
    const kickoff = node.find('.eni-kickoff').text().trim();
    const rawTs = node.find('.eni-kickoff').attr('data-ts') || '';
    const countdown = node.find('.eni-countdown').text().trim();

    const scoreSpans = node.find('.eni-score').map((_, s) => $(s).text().trim()).get();
    const hasValidScores = scoreSpans.length >= 2 && scoreSpans.every((s) => s && s !== '–' && s !== '-');
    const score = hasValidScores ? `${scoreSpans[0]} - ${scoreSpans[1]}` : 'لم تبدأ بعد';

    if (!homeName && !awayName) return;

    const title = cleanTitleText(`${homeName} ضد ${awayName}`);
    const slug = `${encodeURIComponent(homeName)}-vs-${encodeURIComponent(awayName)}`;
    const matchId = `mewsry:match:${slug}:${rawTs || '0'}`;
    const matchUrl = resolveSafeUrl(`/?match_day=${day}#${slug}`, baseUrl, { allowHttp: true });

    // Status classification: finished, live, or upcoming
    let status = 'upcoming';
    if (hasValidScores && day === 'yesterday') {
      status = 'finished';
    } else if (countdown === 'تبدأ الآن' || (rawTs && Math.floor(Date.now() / 1000) >= Number(rawTs))) {
      status = hasValidScores ? 'finished' : 'live';
    }

    items.push({
      id: matchId,
      ref: matchId,
      title,
      homeTeam: { name: homeName, logo: homeLogo },
      awayTeam: { name: awayName, logo: awayLogo },
      competition: comp,
      time: kickoff,
      timestamp: rawTs ? Number(rawTs) : null,
      score,
      status,
      type: 'live',
      category: comp || 'مباريات كرة القدم',
      poster: homeLogo || awayLogo || '',
      url: matchUrl,
      source: PROVIDER_ID,
      serverPrefix: PROVIDER_CODE
    });
  });

  return items;
}

/**
 * Extracts and normalizes WordPress post cards (.ab-post-card, article.post).
 */
export function parsePostCardsFromHtml(html, baseUrl = MEWSRY_CONFIG.baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const items = [];

  $('.ab-post-card, article.post, article.eni_match').each((_, el) => {
    const node = $(el);
    const titleLink = node.find('.ab-post-title a, h2 a, h3 a').first();
    const rawHref = titleLink.attr('href') || node.find('a').first().attr('href') || '';
    const url = resolveSafeUrl(rawHref, baseUrl, { allowHttp: true });
    const rawTitle = titleLink.text().trim() || node.find('.ab-post-title, h2, h3').text().trim();
    if (!url || !rawTitle) return;

    const title = cleanTitleText(rawTitle);
    const excerpt = node.find('.ab-post-excerpt, p').first().text().trim();
    const date = node.find('time').attr('datetime') || node.find('time').text().trim();
    const rawImg = node.find('img').first().attr('src') || node.find('img').first().attr('data-src') || '';
    const poster = rawImg ? resolveSafeUrl(rawImg, baseUrl, { allowHttp: true }) : '';

    items.push({
      id: `mewsry:${Buffer.from(url).toString('base64url')}`,
      ref: `mewsry:${Buffer.from(url).toString('base64url')}`,
      title,
      description: excerpt,
      url,
      poster,
      date,
      type: 'live',
      category: 'مباريات كرة القدم',
      source: PROVIDER_ID,
      serverPrefix: PROVIDER_CODE
    });
  });

  return items;
}

/**
 * Scrapes match catalog from Syria Live (manasorya.site / mewsry.live).
 * Categories: 'today' | 'yesterday' | 'tomorrow' | 'live' | 'matches' | 'home'
 */
export async function scrapeCatalog(category = 'today', page = 1, options = {}) {
  const normCat = String(category || 'today').trim().toLowerCase();
  let day = 'today';
  let targetPath = '/?match_day=today';

  if (normCat === 'yesterday' || normCat === 'archive') {
    day = 'yesterday';
    targetPath = '/?match_day=yesterday';
  } else if (normCat === 'tomorrow' || normCat === 'upcoming') {
    day = 'tomorrow';
    targetPath = '/?match_day=tomorrow';
  }

  const targetUrl = resolveSafeUrl(targetPath, MEWSRY_CONFIG.baseUrl, { allowHttp: true });

  try {
    const fetchRes = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      allowHttp: true
    });

    if (!fetchRes.ok && fetchRes.status === 404) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Catalog page not found', {
        url: targetUrl
      });
    }

    const matches = parseMatchesFromHtml(fetchRes.html, MEWSRY_CONFIG.baseUrl, day);
    const posts = parsePostCardsFromHtml(fetchRes.html, MEWSRY_CONFIG.baseUrl);

    // Merge match cards with any article posts
    const items = [...matches, ...posts];

    if (items.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'No matches scheduled for this date', {
        url: targetUrl
      });
    }

    return attachResultMeta(items, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      category: day,
      page
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    const emptyResult = createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl,
      status: classified.status
    });
    return emptyResult;
  }
}

/**
 * Scrapes live streaming matches currently active or scheduled for today.
 */
export async function scrapeLive(options = {}) {
  const catalog = await scrapeCatalog('today', 1, options);
  if (!catalog || catalog.length === 0) {
    return catalog;
  }

  const liveOrUpcoming = catalog.map((item) => ({
    ...item,
    isLive: item.status === 'live' || item.status === 'upcoming'
  }));

  return attachResultMeta(liveOrUpcoming, {
    ok: true,
    providerId: PROVIDER_ID,
    url: catalog._meta?.url || `${MEWSRY_CONFIG.baseUrl}/?match_day=today`,
    liveCount: liveOrUpcoming.filter((m) => m.status === 'live').length,
    totalCount: liveOrUpcoming.length
  });
}

/**
 * Scrapes search results using the real WordPress ?s={query} endpoint,
 * augmented with an in-memory team filter across today's and yesterday's matches.
 */
export async function scrapeSearch(query, page = 1, options = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Query string is empty');
  }

  const searchPath = `/?s=${encodeURIComponent(cleanQuery)}`;
  const searchUrl = resolveSafeUrl(searchPath, MEWSRY_CONFIG.baseUrl, { allowHttp: true });

  try {
    const fetchRes = await fetchProviderHtml(searchUrl, {
      ...options,
      providerId: PROVIDER_ID,
      allowHttp: true
    });

    // 1. Parse static WordPress search result articles
    const postResults = parsePostCardsFromHtml(fetchRes.html, MEWSRY_CONFIG.baseUrl);

    // 2. Query today's live matches to find any team/competition matching query
    let scheduleMatches = [];
    if (!options.fixtureHtml) {
      try {
        const todaySchedule = await scrapeCatalog('today', 1, options);
        scheduleMatches = (todaySchedule || []).filter((item) => {
          const q = cleanQuery.toLowerCase();
          const title = (item.title || '').toLowerCase();
          const comp = (item.competition || '').toLowerCase();
          const home = (item.homeTeam?.name || '').toLowerCase();
          const away = (item.awayTeam?.name || '').toLowerCase();
          return title.includes(q) || comp.includes(q) || home.includes(q) || away.includes(q);
        });
      } catch (_) {}
    }

    const seenUrls = new Set();
    const merged = [];

    for (const item of [...postResults, ...scheduleMatches]) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        merged.push(item);
      }
    }

    if (merged.length === 0) {
      return createEmptyArrayResult(PROVIDER_ID, SCRAPER_ERROR_CODES.EMPTY_RESULT, 'No search results found', {
        url: searchUrl,
        query: cleanQuery
      });
    }

    return attachResultMeta(merged, {
      ok: true,
      providerId: PROVIDER_ID,
      url: searchUrl,
      query: cleanQuery,
      page
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: searchUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: searchUrl,
      query: cleanQuery,
      status: classified.status
    });
  }
}

/**
 * Scrapes detailed information for a match or video URL/reference.
 */
export async function scrapeDetails(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);

  try {
    const fetchRes = await fetchProviderHtml(targetUrl, {
      ...options,
      providerId: PROVIDER_ID,
      allowHttp: true
    });

    const $ = cheerio.load(fetchRes.html || '');
    const pageTitle = cleanTitleText($('title').text().trim());

    // Check if URL represents a match card on the schedule page
    const matches = parseMatchesFromHtml(fetchRes.html, MEWSRY_CONFIG.baseUrl);
    const decodedUrl = decodeURIComponent(targetUrl);
    let matchedItem = null;

    if (matches.length > 0) {
      for (const m of matches) {
        if (decodedUrl.includes(m.homeTeam.name) || decodedUrl.includes(m.awayTeam.name)) {
          matchedItem = m;
          break;
        }
      }
      if (!matchedItem && targetUrl.includes('#')) {
        const hash = targetUrl.split('#')[1];
        matchedItem = matches.find((m) => m.id.includes(hash) || m.url.includes(hash)) || matches[0];
      }
    }

    if (matchedItem) {
      const detailsResult = {
        id: matchedItem.id,
        ref: matchedItem.id,
        title: matchedItem.title,
        description: `بث مباشر لمباراة ${matchedItem.title} ضمن منافسات ${matchedItem.competition || 'كرة القدم'}. النتيجة: ${matchedItem.score}`,
        poster: matchedItem.poster,
        homeTeam: matchedItem.homeTeam,
        awayTeam: matchedItem.awayTeam,
        competition: matchedItem.competition,
        time: matchedItem.time,
        timestamp: matchedItem.timestamp,
        score: matchedItem.score,
        status: matchedItem.status,
        type: 'live',
        category: matchedItem.category,
        url: matchedItem.url,
        servers: []
      };
      return attachResultMeta(detailsResult, {
        ok: true,
        providerId: PROVIDER_ID,
        url: targetUrl
      });
    }

    // Generic post or legacy video details
    const heading = cleanTitleText($('.ab-post-title, h1.entry-title, h1').first().text().trim() || pageTitle);
    const excerpt = $('.ab-post-content, .entry-content, p').first().text().trim();
    const poster = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '';

    const genericResult = {
      id: `mewsry:${Buffer.from(targetUrl).toString('base64url')}`,
      ref: `mewsry:${Buffer.from(targetUrl).toString('base64url')}`,
      title: heading || 'سوريا لايف بث مباشر',
      description: excerpt,
      poster: poster ? resolveSafeUrl(poster, MEWSRY_CONFIG.baseUrl, { allowHttp: true }) : '',
      type: 'live',
      category: 'مباريات كرة القدم',
      url: targetUrl,
      servers: []
    };

    return attachResultMeta(genericResult, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    const errorResult = {
      id: `mewsry:${Buffer.from(targetUrl).toString('base64url')}`,
      title: 'Failed to load details',
      url: targetUrl,
      servers: []
    };
    return attachResultMeta(errorResult, {
      ok: false,
      errorCode: classified.code,
      errorMessage: classified.message,
      providerId: PROVIDER_ID,
      url: targetUrl,
      status: classified.status
    });
  }
}

/**
 * Episodes capability: Live sports matches are standalone events and do not feature episodes.
 * Supports legacy PHP Melody video playlists when given an explicit PHP Melody URL.
 */
export async function scrapeEpisodes(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);

  // If this is a legacy PHP Melody video page, extract related video episodes
  if (targetUrl.includes('watch.php?vid=') || targetUrl.includes('play.php?vid=')) {
    try {
      const fetchRes = await fetchProviderHtml(targetUrl, {
        ...options,
        providerId: PROVIDER_ID,
        allowHttp: true
      });
      const $ = cheerio.load(fetchRes.html || '');
      const episodes = [];

      $('.pm-ul-browse-videos li a[href*="watch.php?vid="]').each((idx, el) => {
        const epHref = $(el).attr('href') || '';
        const epText = $(el).attr('title') || $(el).text().trim();
        const epNum = Number(epText.match(/(\d+)/)?.[1]) || idx + 1;
        if (epHref) {
          episodes.push({
            number: epNum,
            episodeNumber: epNum,
            title: epText || `الجزء ${epNum}`,
            label: epText || `الجزء ${epNum}`,
            url: resolveSafeUrl(epHref, MEWSRY_CONFIG.baseUrl, { allowHttp: true })
          });
        }
      });

      return attachResultMeta(episodes, {
        ok: true,
        providerId: PROVIDER_ID,
        url: targetUrl
      });
    } catch (_) {}
  }

  // Live match capability contract: matches do not have serialized episodes
  return createEmptyArrayResult(
    PROVIDER_ID,
    SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY,
    'Sports matches are standalone live events and do not feature serialized seasons or episodes',
    { url: targetUrl }
  );
}

/**
 * Scrapes streaming servers for a match, embed, or video player.
 * Server codes: MY-1, MY-2, MY-3..
 * Types: 'm3u8' | 'mp4' | 'embed' | 'download'
 */
export async function scrapeServers(urlOrRef, options = {}) {
  const targetUrl = resolveTargetUrl(urlOrRef);
  const playUrl = targetUrl.replace('watch.php?vid=', 'play.php?vid=');

  try {
    const fetchRes = await fetchProviderHtml(playUrl, {
      ...options,
      providerId: PROVIDER_ID,
      allowHttp: true
    }).catch(async () => {
      return fetchProviderHtml(targetUrl, {
        ...options,
        providerId: PROVIDER_ID,
        allowHttp: true
      });
    });

    const html = fetchRes.html || '';
    const $ = cheerio.load(html);
    const candidates = [];

    // 1. Selector-based stream and embed discovery
    $('.watch-servers li, [data-embed], #Playerholder iframe, video source, iframe[src], a[data-stream-link="1"], .player-wrapper iframe, .player-wrapper video').each((_, el) => {
      const u =
        $(el).attr('data-embed') ||
        $(el).attr('src') ||
        $(el).attr('data-src') ||
        $(el).attr('href') ||
        '';
      if (u && u.startsWith('http') && !candidates.includes(u)) {
        candidates.push(u);
      }
    });

    // 2. Direct raw streams extracted from scripts / inline text
    const directStreams = extractRawStreamsFromText(html, playUrl);

    // 3. Unwrap embed candidates to direct media streams
    const unwrappedLists = await Promise.all(
      candidates.slice(0, 6).map(async (u) => {
        try {
          return await unwrapEmbedToDirectStreams(u, playUrl);
        } catch (_) {
          return [];
        }
      })
    );

    const mergedStreams = [...directStreams, ...unwrappedLists.flat()];
    const seenStreamUrls = new Set();
    const finalServers = [];

    let serverIdx = 1;

    // Add direct media streams first
    for (const stream of mergedStreams) {
      if (stream.url && !seenStreamUrls.has(stream.url)) {
        seenStreamUrls.add(stream.url);
        finalServers.push({
          id: `${PROVIDER_CODE}-${serverIdx}`,
          code: `${PROVIDER_CODE}-${serverIdx}`,
          name: `سيرفر ${serverIdx} (${stream.streamType?.toUpperCase() || 'HLS'})`,
          provider: PROVIDER_ID,
          type: stream.streamType || (stream.url.includes('.m3u8') ? 'm3u8' : 'mp4'),
          url: stream.url,
          quality: stream.quality || 'Auto',
          headers: stream.headers || {
            Referer: `${MEWSRY_CONFIG.baseUrl}/`,
            Origin: MEWSRY_CONFIG.baseUrl
          },
          verified: false, // Verification performed during stream probing
          expiresHint: /[?&](exp|token|expires|h)=/i.test(stream.url)
        });
        serverIdx++;
      }
    }

    // If no direct streams unwrapped, preserve candidates as type 'embed'
    if (finalServers.length === 0) {
      for (const candUrl of candidates) {
        if (!seenStreamUrls.has(candUrl)) {
          seenStreamUrls.add(candUrl);
          finalServers.push({
            id: `${PROVIDER_CODE}-${serverIdx}`,
            code: `${PROVIDER_CODE}-${serverIdx}`,
            name: `سيرفر خارجي ${serverIdx}`,
            provider: PROVIDER_ID,
            type: 'embed',
            url: candUrl,
            headers: {
              Referer: `${MEWSRY_CONFIG.baseUrl}/`,
              Origin: MEWSRY_CONFIG.baseUrl
            },
            verified: false,
            expiresHint: false
          });
          serverIdx++;
        }
      }
    }

    if (finalServers.length === 0) {
      return createEmptyArrayResult(
        PROVIDER_ID,
        SCRAPER_ERROR_CODES.EMPTY_RESULT,
        'No active streaming servers found for this match/event',
        { url: targetUrl }
      );
    }

    return attachResultMeta(finalServers, {
      ok: true,
      providerId: PROVIDER_ID,
      url: targetUrl,
      count: finalServers.length
    });
  } catch (err) {
    const classified = classifyNetworkError(err, { providerId: PROVIDER_ID, url: targetUrl });
    return createEmptyArrayResult(PROVIDER_ID, classified.code, classified.message, {
      url: targetUrl,
      status: classified.status
    });
  }
}

/**
 * Resolves a stream URL to direct playable video (.m3u8 or .mp4).
 * Performs minimal probe verification without downloading full stream.
 */
export async function resolveStream(urlOrRef, options = {}) {
  const streamUrl = typeof urlOrRef === 'object' && urlOrRef?.url ? urlOrRef.url : String(urlOrRef || '').trim();
  if (!streamUrl) {
    throw new ScraperError(SCRAPER_ERROR_CODES.EMPTY_RESULT, 'Stream URL is missing or empty', {
      providerId: PROVIDER_ID
    });
  }

  assertSafeScraperUrl(streamUrl, { allowHttp: true });

  const isDirectHls = streamUrl.toLowerCase().includes('.m3u8') || streamUrl.toLowerCase().includes('/hls/');
  const isDirectMp4 = streamUrl.toLowerCase().includes('.mp4');

  const headers = {
    Referer: `${MEWSRY_CONFIG.baseUrl}/`,
    Origin: MEWSRY_CONFIG.baseUrl,
    ...(options.headers || {})
  };

  // If already a direct media URL
  if (isDirectHls || isDirectMp4) {
    let verified = false;

    // Optional verification probe if not disabled in options
    if (options.skipProbe !== true && !options.fixtureHtml) {
      try {
        const probeRes = await fetchSafeResponse(streamUrl, {
          allowHttp: true,
          timeoutMs: 4000,
          customHeaders: {
            ...headers,
            Range: isDirectMp4 ? 'bytes=0-1023' : undefined
          }
        });
        if (probeRes.ok) {
          if (isDirectHls && (probeRes.html.includes('#EXTM3U') || probeRes.html.includes('#EXT-X-'))) {
            verified = true;
          } else if (isDirectMp4 && (probeRes.status === 206 || probeRes.status === 200)) {
            verified = true;
          }
        }
      } catch (_) {
        verified = false;
      }
    }

    return {
      streamUrl,
      type: isDirectHls ? 'm3u8' : 'mp4',
      headers,
      verified,
      expiresHint: /[?&](exp|token|expires|h)=/i.test(streamUrl)
    };
  }

  // If embed, attempt recursive unwrap
  const unwrapped = await unwrapEmbedToDirectStreams(streamUrl, MEWSRY_CONFIG.baseUrl);
  if (unwrapped && unwrapped.length > 0) {
    const first = unwrapped[0];
    return {
      streamUrl: first.url,
      type: first.streamType || (first.url.includes('.m3u8') ? 'm3u8' : 'mp4'),
      headers: first.headers || headers,
      verified: false,
      expiresHint: /[?&](exp|token|expires|h)=/i.test(first.url)
    };
  }

  // Return as embed if unwrapping did not find direct media
  return {
    streamUrl,
    type: 'embed',
    headers,
    verified: false,
    expiresHint: false
  };
}

/**
 * Backward-compatible helper matching specialized-portals.mjs:
 * export async function extractMewsryStreams(targetUrl) -> { episodes, servers }
 */
export async function extractMewsryStreams(targetUrl) {
  const playUrl = (targetUrl || '').replace('watch.php?vid=', 'play.php?vid=');
  const safeTarget = resolveTargetUrl(playUrl || targetUrl);

  try {
    const [episodes, servers] = await Promise.all([
      scrapeEpisodes(safeTarget),
      scrapeServers(safeTarget)
    ]);
    return {
      episodes: Array.isArray(episodes) ? episodes : [],
      servers: Array.isArray(servers) ? servers : []
    };
  } catch (_) {
    return { episodes: [], servers: [] };
  }
}
