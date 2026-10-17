// =====================================================================
// SUPERVISOR 03: EGYDEAD & IPA UNIVERSE SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan } from './anti-ban.mjs';

const EGYDEAD_BASE = 'https://w1.egydead.top';
const IPA_BASE = 'https://watch.ipauniverse.com';

/**
 * Scrapes EgyDead catalog
 */
export async function scrapeEgyDeadCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies/page/${page}/` : `/series/page/${page}/`;
  const url = `${EGYDEAD_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: EGYDEAD_BASE });
    const $ = load(html);
    const items = [];

    $('.BlockItem, .movie-item, .post-item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.ItemTitle, .title, h3').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `egydead:${Buffer.from(href).toString('base64url')}`,
          ref: `egydead:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'egydead'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('EgyDead scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes EgyDead Details & Episode List
 */
export async function scrapeEgyDeadDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: EGYDEAD_BASE });
    const $ = load(html);

    const title = $('h1.ItemTitle, h1').first().text().trim() || 'تفاصيل العمل';
    const poster = $('.ItemPoster img').attr('src') || $('.ItemPoster img').attr('data-src') || '';
    const overview = $('.StoryContent, .story').text().trim() || '';

    const episodes = [];
    $('.EpisodesList a, .ep-link').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const numMatch = text.match(/\d+/);
      const num = numMatch ? Number(numMatch[0]) : episodes.length + 1;
      if (href) {
        episodes.push({
          episode_id: `egydead:ep:${Buffer.from(href).toString('base64url')}`,
          ref: href,
          link: href,
          num,
          title: text || `الحلقة ${num}`
        });
      }
    });

    return {
      status: 'success',
      source: 'egydead',
      movie_title: title,
      poster,
      overview,
      episodes
    };
  } catch (err) {
    console.warn('EgyDead details error:', err.message);
    return null;
  }
}

/**
 * Scrapes IPA Universe Catalog
 */
export async function scrapeIpaUniverseCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies?page=${page}` : `/series?page=${page}`;
  const url = `${IPA_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: IPA_BASE });
    const $ = load(html);
    const items = [];

    $('.card, .video-card, .item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.title, h4, h3').text().trim();
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';

      if (href && title) {
        items.push({
          id: `ipa:${Buffer.from(href).toString('base64url')}`,
          ref: `ipa:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'ipa'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('IPA Universe scrape error:', err.message);
    return [];
  }
}

const THREE_CK_BASE = 'https://e.3cktv.com';

/**
 * Scrapes 3ck TV Turkish Drama Catalog
 */
export async function scrape3ckTvCatalog(type = 'series', page = 1) {
  const path = `/page/${page}/`;
  const url = `${THREE_CK_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: THREE_CK_BASE });
    const $ = load(html);
    const items = [];

    $('article.post, .BlockItem, .item-box').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.title, h2, h3').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('data-img') || img.attr('src') || '';

      if (href && title) {
        items.push({
          id: `3cktv:${Buffer.from(href).toString('base64url')}`,
          ref: `3cktv:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: '3cktv'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('3ckTV scrape error:', err.message);
    return [];
  }
}

