// =====================================================================
// SUPERVISOR 04: ANIME4UP & QFILM & RISTOANIME SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan } from './anti-ban.mjs';

const ANIME4UP_BASE = 'https://4f.7grcy6t.shop';
const QFILM_BASE = 'https://a.qfilm.tv';
const RISTO_BASE = 'https://ristoanime.me';

/**
 * Scrapes Anime4Up Catalog (Movies & Series)
 */
export async function scrapeAnime4upCatalog(type = 'series', page = 1) {
  const path = type === 'movie' ? `/anime-type/movie/page/${page}/` : `/anime-season/page/${page}/`;
  const url = `${ANIME4UP_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: ANIME4UP_BASE });
    const $ = load(html);
    const items = [];

    $('.anime-card-container, .anime-list-item, .item-list').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.anime-card-title, .title, h3').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `anime4up:${Buffer.from(href).toString('base64url')}`,
          ref: `anime4up:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'anime4up'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('Anime4Up scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes Anime4Up Episode List and Video Embeds
 */
export async function scrapeAnime4upDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: ANIME4UP_BASE });
    const $ = load(html);

    const title = $('h1.anime-details-title, h1').first().text().trim() || 'تفاصيل الأنمي';
    const poster = $('.anime-thumbnail img').attr('src') || $('.anime-thumbnail img').attr('data-src') || '';
    const overview = $('.anime-story, p.story').text().trim() || '';

    const episodes = [];
    $('.episodes-card-container a, .ep-card a').each((_, el) => {
      const epLink = $(el).attr('href');
      const epTitle = $(el).text().trim();
      const numMatch = epTitle.match(/\d+/);
      const num = numMatch ? Number(numMatch[0]) : episodes.length + 1;

      if (epLink) {
        episodes.push({
          episode_id: `anime4up:ep:${Buffer.from(epLink).toString('base64url')}`,
          ref: epLink,
          link: epLink,
          num,
          title: epTitle || `الحلقة ${num}`
        });
      }
    });

    return {
      status: 'success',
      source: 'anime4up',
      movie_title: title,
      poster,
      overview,
      episodes
    };
  } catch (err) {
    console.warn('Anime4Up details error:', err.message);
    return null;
  }
}

/**
 * Scrapes QFilm Anime Catalog
 */
export async function scrapeQfilmCatalog(type = 'movie', page = 1) {
  const url = `${QFILM_BASE}/page/${page}`;
  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: QFILM_BASE });
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
          id: `qfilm:${Buffer.from(href).toString('base64url')}`,
          ref: `qfilm:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'qfilm'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('QFilm scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes RistoAnime Catalog
 */
export async function scrapeRistoCatalog(page = 1) {
  const url = `${RISTO_BASE}/anime-list/page/${page}`;
  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: RISTO_BASE });
    const $ = load(html);
    const items = [];

    $('.anime-item, .item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.title').text().trim();
      const poster = node.find('img').attr('src') || '';

      if (href && title) {
        items.push({
          id: `risto:${Buffer.from(href).toString('base64url')}`,
          ref: `risto:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          type: 'series',
          is_series: true,
          source: 'ristoanime'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('RistoAnime scrape error:', err.message);
    return [];
  }
}
