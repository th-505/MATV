// =====================================================================
// SUPERVISOR 05: ARABSEED & MEWSRY LIVE SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan } from './anti-ban.mjs';

const ARABSEED_BASE = 'https://www.arabseed.wine';
const MEWSRY_BASE = 'https://www.mewsry.live';

/**
 * Scrapes ArabSeed Catalog
 */
export async function scrapeArabSeedCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies/page/${page}/` : `/series/page/${page}/`;
  const url = `${ARABSEED_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: ARABSEED_BASE });
    const $ = load(html);
    const items = [];

    $('.MovieBlock, .PostBlock, .item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.Title, h3, h4').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `arabseed:${Buffer.from(href).toString('base64url')}`,
          ref: `arabseed:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'arabseed'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('ArabSeed scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes ArabSeed Details & Episodes
 */
export async function scrapeArabSeedDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: ARABSEED_BASE });
    const $ = load(html);

    const title = $('h1.Title, h1').first().text().trim() || 'تفاصيل العمل';
    const poster = $('.Poster img').attr('src') || $('.Poster img').attr('data-src') || '';
    const overview = $('.Story, .story').text().trim() || '';

    const episodes = [];
    $('.ContainerEpisodesList a, .EpisodesList a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const numMatch = text.match(/\d+/);
      const num = numMatch ? Number(numMatch[0]) : episodes.length + 1;
      if (href) {
        episodes.push({
          episode_id: `arabseed:ep:${Buffer.from(href).toString('base64url')}`,
          ref: href,
          link: href,
          num,
          title: text || `الحلقة ${num}`
        });
      }
    });

    return {
      status: 'success',
      source: 'arabseed',
      movie_title: title,
      poster,
      overview,
      episodes
    };
  } catch (err) {
    console.warn('ArabSeed details error:', err.message);
    return null;
  }
}

/**
 * Scrapes Mewsry Live Catalog
 */
export async function scrapeMewsryCatalog(type = 'movie', page = 1) {
  const url = `${MEWSRY_BASE}/page/${page}`;
  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: MEWSRY_BASE });
    const $ = load(html);
    const items = [];

    $('.item, .card').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.title').text().trim();
      const poster = node.find('img').attr('src') || '';

      if (href && title) {
        items.push({
          id: `mewsry:${Buffer.from(href).toString('base64url')}`,
          ref: `mewsry:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'mewsry'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('Mewsry scrape error:', err.message);
    return [];
  }
}
