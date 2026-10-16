// server/scrapers/sites/akwam.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const AKWAM_CONFIG = {
  key: 'akwam',
  code: 'AK',
  baseUrl: 'https://akwam.ss',
  categories: {
    movies_all: '/movies',
    movies_foreign: '/movies?section=29',
    movies_arabic: '/movies?section=30',
    movies_indian: '/movies?section=31',
    movies_turkish: '/movies?section=32',
    movies_asian: '/movies?section=33',
    series_all: '/series',
    series_foreign: '/series?section=29',
    series_arabic: '/series?section=30',
    series_turkish: '/series?section=32',
    series_asian: '/series?section=33',
    anime_all: '/series?category=30'
  }
};

export async function scrapeAkwamCategory(catKey = 'movies_all', page = 1) {
  const subPath = AKWAM_CONFIG.categories[catKey] || AKWAM_CONFIG.categories.movies_all;
  const sep = subPath.includes('?') ? '&' : '?';
  const url = page > 1 ? `${AKWAM_CONFIG.baseUrl}${subPath}${sep}page=${page}` : `${AKWAM_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('.entry-box-1, .widget-body .entry-box').each((_, el) => {
    const a = $(el).find('h3.entry-title a, a.box').first();
    const href = a.attr('href') || '';
    const title = $(el).find('h3.entry-title a').text().trim();
    const poster = $(el).find('picture img, img.lazy').attr('data-src') || $(el).find('img').attr('src') || '';
    const rating = $(el).find('.label.rating').text().replace(/[^\d.]/g, '').trim() || '8.2';
    const year = $(el).find('.badge-secondary').first().text().trim() || '2025';

    if (href && title) {
      items.push({
        id: `akwam:${Buffer.from(href).toString('base64url')}`,
        title,
        year,
        rating,
        poster,
        url: href,
        source: 'akwam',
        serverPrefix: 'AK',
        type: href.includes('/series/') || href.includes('/episode/') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function searchAkwam(query) {
  const url = `${AKWAM_CONFIG.baseUrl}/search?q=${encodeURIComponent(query)}`;
  return scrapeAkwamFromHtml(await fetchWithAntiBan(url));
}

function scrapeAkwamFromHtml(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const items = [];
  $('.entry-box-1, .entry-box').each((_, el) => {
    const a = $(el).find('h3.entry-title a').first();
    const href = a.attr('href') || '';
    const title = a.text().trim();
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
    if (href && title) {
      items.push({
        id: `akwam:${Buffer.from(href).toString('base64url')}`,
        title,
        poster,
        url: href,
        source: 'akwam',
        type: href.includes('/series/') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

// فك جسر أكوام الثلاثي واستخراج روابط .mp4 المباشرة متعدّدة الجودات (1080p, 720p, 480p)
async function resolveAkwamBridgeToDirectMp4(bridgeLinkUrl, refererUrl) {
  const step1Html = await fetchWithAntiBan(bridgeLinkUrl);
  if (!step1Html) return [];
  const $1 = cheerio.load(step1Html);

  // استخراج الرابط نحو صفحة المشاهدة أو التحميل الفعلية
  const nextUrl = $1('a.download-link, a[href*="/watch/"], a[href*="/download/"], .btn-loader a').attr('href') || bridgeLinkUrl;
  const step2Html = nextUrl !== bridgeLinkUrl ? await fetchWithAntiBan(nextUrl) : step1Html;
  if (!step2Html) return [];

  const $2 = cheerio.load(step2Html);
  const streams = [];

  // 1. سحب وسوم <video><source src="...mp4" size="1080">
  $2('video source, source[src*=".mp4"], source[src*=".m3u8"]').each((_, el) => {
    const src = $2(el).attr('src') || '';
    const size = $2(el).attr('size') || '720';
    if (src && src.startsWith('http')) {
      streams.push({
        url: src,
        streamType: src.includes('.m3u8') ? 'm3u8' : 'mp4',
        quality: `${size}p`,
        headers: generateAntiBanHeaders(nextUrl)
      });
    }
  });

  // 2. سحب رابط التحميل المباشر .mp4 من زر .link-btn
  $2('a.link[href*=".mp4"], .btn-loader a[href*=".mp4"]').each((_, el) => {
    const href = $2(el).attr('href') || '';
    if (href && href.startsWith('http')) {
      streams.push({
        url: href,
        streamType: 'mp4',
        quality: 'Direct-MP4',
        headers: generateAntiBanHeaders(nextUrl)
      });
    }
  });

  if (streams.length === 0) {
    return unwrapEmbedToDirectStreams(nextUrl, refererUrl);
  }
  return streams;
}

export async function extractAkwamStreamsAndEpisodes(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const episodes = [];
  const bridgeLinks = [];

  // استخراج الحلقات إن كان مسلسلاً
  $('#series-episodes .bg-primary2 h2 a, .widget-body a[href*="/episode/"]').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epTitle = $(el).text().trim();
    const numMatch = epTitle.match(/(\d+)/);
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

  // استخراج روابط الجسر (تبويبات الجودات tab-content)
  $('a[href*="/link/"], a[href*="/watch/"]').each((_, el) => {
    const h = $(el).attr('href') || '';
    if (h.startsWith('http') && !bridgeLinks.includes(h)) {
      bridgeLinks.push(h);
    }
  });

  const resolvedGroups = await Promise.all(
    bridgeLinks.slice(0, 4).map(link => resolveAkwamBridgeToDirectMp4(link, targetUrl))
  );

  const servers = [];
  for (const group of resolvedGroups) {
    for (const s of group) {
      servers.push({
        provider: 'akwam',
        code: `AK-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
