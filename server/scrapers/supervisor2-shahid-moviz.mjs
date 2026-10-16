// =====================================================================
// SUPERVISOR 02: SHAHID4U & MOVIZ TIME & SHII4U SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan } from './anti-ban.mjs';

const SHAHID4U_BASE = 'https://cdn.shahid4u.asia';
const MOVIZ_BASE = 'https://moviz-time.quest';
const SHII4U_BASE = 'https://shii4u.cam';

/**
 * Scrapes Shahid4U catalog
 */
export async function scrapeShahid4uCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/all-movies/page/${page}/` : `/all-series/page/${page}/`;
  const url = `${SHAHID4U_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: SHAHID4U_BASE });
    const $ = load(html);
    const items = [];

    $('.MediaItem, .content-box, .post-item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.Title, .title, h3').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `shahid4u:${Buffer.from(href).toString('base64url')}`,
          ref: `shahid4u:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'shahid4u'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('Shahid4U scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes Moviz Time catalog
 */
export async function scrapeMovizTimeCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies/page/${page}/` : `/series/page/${page}/`;
  const url = `${MOVIZ_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: MOVIZ_BASE });
    const $ = load(html);
    const items = [];

    $('.movie-item, .box, .item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.movie-title, .title').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `moviz:${Buffer.from(href).toString('base64url')}`,
          ref: `moviz:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'moviz'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('MovizTime scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes Shii4U catalog
 */
export async function scrapeShii4uCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies/page/${page}` : `/series/page/${page}`;
  const url = `${SHII4U_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: SHII4U_BASE });
    const $ = load(html);
    const items = [];

    $('.item, .post').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.title, h2').text().trim();
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';

      if (href && title) {
        items.push({
          id: `shii4u:${Buffer.from(href).toString('base64url')}`,
          ref: `shii4u:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'shii4u'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('Shii4U scrape error:', err.message);
    return [];
  }
}
