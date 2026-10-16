// server/scrapers/sites/moviztime.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const MOVIZTIME_CONFIG = {
  key: 'moviztime',
  code: 'ME',
  baseUrl: 'https://moviz-time.quest',
  categories: {
    movies_all: '/movies/',
    series_all: '/tvshows/',
    series_asian: '/genre/asian-drama/'
  }
};

export async function scrapeMovizTimeCategory(catKey = 'movies_all', page = 1) {
  const subPath = MOVIZTIME_CONFIG.categories[catKey] || MOVIZTIME_CONFIG.categories.movies_all;
  const url = page > 1 ? `${MOVIZTIME_CONFIG.baseUrl}${subPath}page/${page}/` : `${MOVIZTIME_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('article.item, .result-item').each((_, el) => {
    const a = $(el).find('.poster a, .title a, h3 a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('h3 a, .title a').text().trim() || a.attr('title') || '';
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
    const year = $(el).find('.data span').first().text().trim() || '2025';
    const rating = $(el).find('.rating').text().replace(/[^\d.]/g, '').trim() || '8.1';

    if (href && title) {
      items.push({
        id: `moviztime:${Buffer.from(href).toString('base64url')}`,
        title,
        year,
        rating,
        poster,
        url: href,
        source: 'moviztime',
        serverPrefix: 'ME',
        type: href.includes('/tvshows/') || href.includes('/episodes/') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function extractMovizTimeStreamsAndEpisodes(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const episodes = [];
  const candidateEmbeds = [];

  // 1. استخراج الحلقات من #seasons .episodios li
  $('#seasons ul.episodios li').each((idx, el) => {
    const a = $(el).find('.episodiotitle a');
    const epHref = a.attr('href') || '';
    const numText = $(el).find('.numerando').text().trim();
    const epNum = Number(numText.split('-').pop()?.trim()) || (idx + 1);
    if (epHref) {
      episodes.push({
        number: epNum,
        episodeNumber: epNum,
        title: `الحلقة ${epNum}`,
        label: `الحلقة ${epNum}`,
        url: epHref
      });
    }
  });

  // 2. استخراج السيرفرات عبر DooPlay AJAX (action=doo_player_ajax)
  const playerOpts = [];
  $('#playeroptionsul li.dooplay_player_option').each((_, el) => {
    const post = $(el).attr('data-post');
    const nume = $(el).attr('data-nume');
    const type = $(el).attr('data-type') || 'movie';
    if (post && nume && nume !== 'trailer') {
      playerOpts.push({ post, nume, type });
    }
  });

  for (const opt of playerOpts.slice(0, 5)) {
    try {
      const res = await fetch(`${MOVIZTIME_CONFIG.baseUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
          ...generateAntiBanHeaders(targetUrl),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: targetUrl
        },
        body: new URLSearchParams({ action: 'doo_player_ajax', post: opt.post, nume: opt.nume, type: opt.type }).toString()
      });
      if (res.ok) {
        const data = await res.json();
        const embedUrl = data?.embed_url || (String(data?.embed_url || '').match(/src=["']([^"']+)["']/) || [])[1] || '';
        if (embedUrl && embedUrl.startsWith('http')) {
          candidateEmbeds.push(embedUrl);
        }
      }
    } catch (_) {}
  }

  // 3. سحب روابط التحميل المباشر من جدول #download
  $('#download tr a[href^="http"], .links_table a[href^="http"]').each((_, el) => {
    candidateEmbeds.push($(el).attr('href'));
  });

  const unwrapped = await Promise.all(
    candidateEmbeds.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, targetUrl))
  );

  const servers = [];
  for (const grp of unwrapped) {
    for (const s of grp) {
      servers.push({
        provider: 'moviztime',
        code: `ME-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
