// =====================================================================
// SUPERVISOR 06: WITANIME & EGYDEAD LIVE TV & YALLASHOOT SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan, generateAntiBanHeaders } from './anti-ban.mjs';
import { extractRawStreamsFromText } from './stream-unwrapper.mjs';

const WITANIME_BASE = 'https://witanime.you';
const EGYDEAD_TV_BASE = 'https://tv10.egydead.live';
const YALLASHOOT_BASE = 'https://yalla-shoot.tv';

/**
 * Scrapes WitAnime Catalog
 */
export async function scrapeWitAnimeCatalog(type = 'series', page = 1) {
  const path = type === 'movie' ? `/قائمة-الأنمي/page/${page}/?status=&type=movie` : `/قائمة-الأنمي/page/${page}/`;
  const url = `${WITANIME_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: WITANIME_BASE });
    const $ = load(html);
    const items = [];

    $('.anime-card-container, .anime-card, .col-6').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.anime-card-title, h3, .title').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `witanime:${Buffer.from(href).toString('base64url')}`,
          ref: `witanime:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'witanime'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('WitAnime scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes WitAnime Details and Episode List
 */
export async function scrapeWitAnimeDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: WITANIME_BASE });
    const $ = load(html);

    const title = $('h1.anime-details-title, h1').first().text().trim() || 'تفاصيل الأنمي';
    const poster = $('.anime-thumbnail img').attr('src') || $('.anime-thumbnail img').attr('data-src') || '';
    const overview = $('.anime-story, p').text().trim() || '';

    const episodes = [];
    $('.episodes-card-container a, .episodes-list a').each((_, el) => {
      const epLink = $(el).attr('href');
      const epTitle = $(el).text().trim();
      const numMatch = epTitle.match(/\d+/);
      const num = numMatch ? Number(numMatch[0]) : episodes.length + 1;

      if (epLink) {
        episodes.push({
          episode_id: `witanime:ep:${Buffer.from(epLink).toString('base64url')}`,
          ref: epLink,
          link: epLink,
          num,
          title: epTitle || `الحلقة ${num}`
        });
      }
    });

    return {
      status: 'success',
      source: 'witanime',
      movie_title: title,
      poster,
      overview,
      episodes
    };
  } catch (err) {
    console.warn('WitAnime details error:', err.message);
    return null;
  }
}

/**
 * Scrapes EgyDead Live TV channels
 */
export async function scrapeEgyDeadLiveChannels() {
  try {
    const { html } = await fetchHtmlWithAntiBan(EGYDEAD_TV_BASE, { referer: EGYDEAD_TV_BASE });
    const $ = load(html);
    const channels = [];

    $('.channel-item, .tv-item, a').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      const img = $(el).find('img').attr('src') || '';

      if (href && name && href.includes('/channel/')) {
        channels.push({
          id: `egydead_tv:${Buffer.from(href).toString('base64url')}`,
          name,
          href,
          img
        });
      }
    });

    return channels;
  } catch (err) {
    console.warn('EgyDead TV channels error:', err.message);
    return [];
  }
}

/**
 * Scrapes YallaShoot Matches
 */
export async function scrapeYallaShootMatches() {
  try {
    const { html } = await fetchHtmlWithAntiBan(YALLASHOOT_BASE, { referer: YALLASHOOT_BASE });
    const $ = load(html);
    const matches = [];

    $('.match-item, .match-container').each((_, el) => {
      const node = $(el);
      const team1 = node.find('.team-1 .team-name').text().trim();
      const team2 = node.find('.team-2 .team-name').text().trim();
      const time = node.find('.match-time').text().trim();
      const status = node.find('.match-status').text().trim();
      const link = node.find('a').attr('href') || '';

      if (team1 && team2) {
        matches.push({
          team1: { name: team1 },
          team2: { name: team2 },
          time,
          status: status.includes('مباشر') ? 'live' : 'upcoming',
          link
        });
      }
    });

    return matches;
  } catch (err) {
    console.warn('YallaShoot matches scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes Live Match or Channel direct M3U8 streams with Anti-Ban headers
 */
export async function scrapeLiveStreamServers(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: targetUrl });
    const directStreams = extractRawStreamsFromText(html, targetUrl);
    return directStreams.map(s => ({
      provider: 'live-stream',
      kind: 'direct',
      url: s.url,
      headers: s.headers || generateAntiBanHeaders(targetUrl)
    }));
  } catch (err) {
    console.warn('Live stream scrape error:', err.message);
    return [];
  }
}

