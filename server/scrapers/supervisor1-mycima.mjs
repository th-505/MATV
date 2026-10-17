// =====================================================================
// SUPERVISOR 01: MYCIMA & CIMANOW SCRAPING ADAPTERS
// =====================================================================

import { load } from 'cheerio';
import { fetchHtmlWithAntiBan } from './anti-ban.mjs';

const MYCIMA_BASE = 'https://mycima.gripe';
const CIMANOW_BASE = 'https://vip.cimanowinc.com';

/**
 * Scrapes MyCima catalog (Movies & Series)
 */
export async function scrapeMyCimaCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies/page/${page}/` : `/series/page/${page}/`;
  const url = `${MYCIMA_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: MYCIMA_BASE });
    const $ = load(html);
    const items = [];

    $('.Grid--WecimaPosts .GridItem, .GridItem--Wecima').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.item-title, .Title--Wecima, .title').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('data-image') || img.attr('src') || '';
      const year = node.find('.year, .Badge').text().trim().match(/\d{4}/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `mycima:${Buffer.from(href).toString('base64url')}`,
          ref: `mycima:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'mycima'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('MyCima catalog scrape error:', err.message);
    return [];
  }
}

/**
 * Scrapes MyCima item details and episodes
 */
export async function scrapeMyCimaDetails(targetUrl) {
  try {
    const { html } = await fetchHtmlWithAntiBan(targetUrl, { referer: MYCIMA_BASE });
    const $ = load(html);

    const title = $('h1.Title--Wecima, h1').first().text().trim() || 'تفاصيل العمل';
    const poster = $('.Poster--Single-begin img').attr('src') || $('.Poster--Single-begin img').attr('data-src') || '';
    const overview = $('.StoryMovieContent, .story').text().trim() || '';

    // Episodes list if it's a TV series
    const episodes = [];
    $('.Episodes--Seasons--Episodes a, .EpisodesList a').each((_, el) => {
      const epLink = $(el).attr('href');
      const epTitle = $(el).text().trim();
      const numMatch = epTitle.match(/\d+/);
      const num = numMatch ? Number(numMatch[0]) : episodes.length + 1;

      if (epLink) {
        episodes.push({
          episode_id: `mycima:ep:${Buffer.from(epLink).toString('base64url')}`,
          ref: epLink,
          link: epLink,
          num,
          title: epTitle || `الحلقة ${num}`
        });
      }
    });

    // Watch & Download servers
    const watchServers = [];
    $('ul.WatchServersList li, .ServersList a').each((i, el) => {
      const sUrl = $(el).attr('data-url') || $(el).attr('href') || $(el).find('a').attr('href');
      const sName = $(el).text().trim() || `سيرفر ${i + 1}`;
      if (sUrl && !sUrl.startsWith('javascript:')) {
        watchServers.push({ name: sName, url: sUrl });
      }
    });

    return {
      status: 'success',
      source: 'mycima',
      movie_title: title,
      poster,
      overview,
      episodes,
      watchServers
    };
  } catch (err) {
    console.warn('MyCima details scrape error:', err.message);
    return null;
  }
}

/**
 * Scrapes CimaNow VIP Catalog
 */
export async function scrapeCimaNowCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/category/movies/page/${page}/` : `/category/series/page/${page}/`;
  const url = `${CIMANOW_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: CIMANOW_BASE });
    const $ = load(html);
    const items = [];

    $('.Box-Video-Item, .Video-Item, .post-item').each((_, el) => {
      const node = $(el);
      const link = node.find('a').first();
      const href = link.attr('href') || '';
      const title = node.find('.video-title, .title').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = title.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `cimanow:${Buffer.from(href).toString('base64url')}`,
          ref: `cimanow:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'cimanow'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('CimaNow catalog scrape error:', err.message);
    return [];
  }
}

const AKOAM_BASE = 'https://akwam.ss';

/**
 * Scrapes Akoam Catalog (Movies & Series)
 */
export async function scrapeAkoamCatalog(type = 'movie', page = 1) {
  const path = type === 'movie' ? `/movies?page=${page}` : `/series?page=${page}`;
  const url = `${AKOAM_BASE}${path}`;

  try {
    const { html } = await fetchHtmlWithAntiBan(url, { referer: AKOAM_BASE });
    const $ = load(html);
    const items = [];

    $('.entry-box, .widget-body .col-lg-auto, .movie-box').each((_, el) => {
      const node = $(el);
      const link = node.find('a.box, a').first();
      const href = link.attr('href') || '';
      const title = node.find('.entry-title, h3, .title').text().trim() || link.attr('title') || '';
      const img = node.find('img').first();
      const poster = img.attr('data-src') || img.attr('src') || '';
      const year = node.find('.badge-secondary, .year').text().trim().match(/\d{4}/)?.[0] || '';

      if (href && title) {
        items.push({
          id: `akoam:${Buffer.from(href).toString('base64url')}`,
          ref: `akoam:${Buffer.from(href).toString('base64url')}`,
          href,
          title,
          poster,
          year: year ? Number(year) : null,
          type: type === 'movie' ? 'movie' : 'series',
          is_series: type !== 'movie',
          source: 'akoam'
        });
      }
    });

    return items;
  } catch (err) {
    console.warn('Akoam catalog scrape error:', err.message);
    return [];
  }
}

