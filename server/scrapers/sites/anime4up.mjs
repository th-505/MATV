// server/scrapers/sites/anime4up.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const ANIME4UP_CONFIG = {
  key: 'anime4up',
  code: 'AP',
  coreUrl: 'https://4f.7grcy6t.shop',
  bondUrl: 'https://www.anime4up.bond',
  restUrl: 'https://w1.anime4up.rest',
  categories: {
    anime_series: '/anime-type/tv/',
    anime_movies: '/anime-type/movie/',
    anime_ona: '/anime-type/ona/',
    anime_ova: '/anime-type/ova/',
    genre_action: '/anime-genre/%d8%a3%d9%83%d8%b4%d9%86/',
    genre_shonen: '/anime-genre/%d8%b4%d9%88%d9%86%d9%8a%d9%86/',
    genre_fantasy: '/anime-genre/%d8%ae%d9%8a%d8%a7%d9%84/',
    genre_magic: '/anime-genre/%d8%b3%d8%ad%d8%b1/',
    genre_romance: '/anime-genre/%d8%b1%d9%88%d9%85%d8%a7%d9%86%d8%b3%d9%8a/',
    genre_mystery: '/anime-genre/%d8%ba%d9%85%d9%88%d8%b6/'
  }
};

async function fetchAnime4UpHtml(subPath) {
  for (const host of [ANIME4UP_CONFIG.coreUrl, ANIME4UP_CONFIG.bondUrl, ANIME4UP_CONFIG.restUrl]) {
    const html = await fetchWithAntiBan(`${host}${subPath}`);
    if (html && html.length > 500) return { html, host };
  }
  return { html: '', host: ANIME4UP_CONFIG.coreUrl };
}

export async function scrapeAnime4UpCategory(catKey = 'anime_series', page = 1) {
  const baseSub = ANIME4UP_CONFIG.categories[catKey] || ANIME4UP_CONFIG.categories.anime_series;
  const subPath = page > 1 ? `${baseSub}page/${page}/` : baseSub;
  const { html } = await fetchAnime4UpHtml(subPath);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('.anime-card-container, .episodes-card-container').each((_, el) => {
    const a = $(el).find('.anime-card-title h3 a, .anime-card-poster a, .episodes-card-title h3 a').first();
    const href = a.attr('href') || '';
    const title = a.text().trim() || a.attr('title') || '';
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
    const typeText = $(el).find('.anime-card-type a').text().trim();

    if (href && title) {
      items.push({
        id: `anime4up:${Buffer.from(href).toString('base64url')}`,
        title,
        poster,
        url: href,
        source: 'anime4up',
        category: 'anime',
        serverPrefix: 'AP',
        type: /movie|فيلم/i.test(typeText) || catKey === 'anime_movies' ? 'movie' : 'series'
      });
    }
  });
  return items;
}

export async function extractAnime4UpStreamsAndEpisodes(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const episodes = [];
  const candidateUrls = [];

  // 1. فك حقل input[name="wl"] المشفر بـ Base64 في أنمي فور أب
  const wlBase64 = $('input[name="wl"]').attr('value') || '';
  if (wlBase64) {
    try {
      const decodedJson = JSON.parse(Buffer.from(wlBase64, 'base64').toString('utf8'));
      for (const val of Object.values(decodedJson)) {
        if (typeof val === 'string' && val.startsWith('http')) {
          candidateUrls.push(val);
        } else if (Array.isArray(val)) {
          val.forEach(v => { if (v?.link || v?.url) candidateUrls.push(v.link || v.url); });
        }
      }
    } catch (_) {}
  }

  // 2. سحب الروابط من #episode-servers li a[data-ep-url] وروابط التحميل المباشر
  $('#episode-servers li a, a[data-ep-url], #Synchronize-download a[href^="http"]').each((_, el) => {
    const u = $(el).attr('data-ep-url') || $(el).attr('href') || '';
    if (u && u.startsWith('http') && !candidateUrls.includes(u)) {
      candidateUrls.push(u);
    }
  });

  // 3. استخراج قائمة حلقات الأنمي
  $('#DivEpisodesList .episodes-card-container a, ul.episodes-links a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epText = $(el).text().trim();
    const numMatch = epText.match(/(\d+)/);
    const epNum = numMatch ? Number(numMatch[1]) : idx + 1;
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

  // 4. فك جميع مشغلات الأنمي إلى .m3u8 و .mp4 صافية
  const unwrapped = await Promise.all(
    candidateUrls.slice(0, 7).map(u => unwrapEmbedToDirectStreams(u, targetUrl))
  );

  const servers = [];
  for (const grp of unwrapped) {
    for (const s of grp) {
      servers.push({
        provider: 'anime4up',
        code: `AP-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
