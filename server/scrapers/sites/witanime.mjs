// server/scrapers/sites/witanime.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const WITANIME_CONFIG = {
  key: 'witanime',
  code: 'WE',
  baseUrl: 'https://witanime.you',
  categories: {
    anime_series: '/anime-type/tv/',
    anime_movies: '/anime-type/movie/',
    anime_airing: '/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86/'
  }
};

export async function scrapeWitAnimeCategory(catKey = 'anime_series', page = 1) {
  const subPath = WITANIME_CONFIG.categories[catKey] || WITANIME_CONFIG.categories.anime_series;
  const url = page > 1 ? `${WITANIME_CONFIG.baseUrl}${subPath}page/${page}/` : `${WITANIME_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('.anime-card-container').each((_, el) => {
    const a = $(el).find('.anime-card-title h3 a, .anime-card-poster a').first();
    const href = a.attr('href') || '';
    const title = a.text().trim() || a.attr('title') || '';
    const poster = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';

    if (href && title) {
      items.push({
        id: `witanime:${Buffer.from(href).toString('base64url')}`,
        title,
        poster,
        url: href,
        source: 'witanime',
        category: 'anime',
        serverPrefix: 'WE',
        type: catKey === 'anime_movies' ? 'movie' : 'series'
      });
    }
  });
  return items;
}

export async function extractWitAnimeStreamsAndEpisodes(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const candidateUrls = [];
  const episodes = [];

  // 1. فك مصفوفات الـ Base64 المخزنة في متغيرات السكربت الخاصة بويت أنمي
  const b64Matches = html.match(/['"]([A-Za-z0-9+/=]{28,})['"]/g) || [];
  for (const rawQuotes of b64Matches) {
    const token = rawQuotes.slice(1, -1);
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8').trim();
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        if (decoded.includes('/episode/')) {
          const numMatch = decoded.match(/(\d+)\/?$/);
          const epNum = numMatch ? Number(numMatch[1]) : episodes.length + 1;
          episodes.push({
            number: epNum,
            episodeNumber: epNum,
            title: `الحلقة ${epNum}`,
            label: `الحلقة ${epNum}`,
            url: decoded
          });
        } else {
          candidateUrls.push(decoded);
        }
      }
    } catch (_) {}
  }

  // 2. سحب أي روابط في #episode-servers li a
  $('#episode-servers li a[data-ep-url], #episode-servers li a[data-url]').each((_, el) => {
    const raw = $(el).attr('data-ep-url') || $(el).attr('data-url') || '';
    if (raw) {
      try {
        const dec = raw.startsWith('http') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        if (dec.startsWith('http')) candidateUrls.push(dec);
      } catch (_) {}
    }
  });

  // 3. فك جميع المشغلات إلى روابط .m3u8 و .mp4 خام
  const unwrapped = await Promise.all(
    candidateUrls.slice(0, 7).map(u => unwrapEmbedToDirectStreams(u, targetUrl))
  );

  const servers = [];
  for (const grp of unwrapped) {
    for (const s of grp) {
      servers.push({
        provider: 'witanime',
        code: `WE-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
