// server/scrapers/sites/mycima.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const MYCIMA_CONFIG = {
  key: 'mycima',
  code: 'MA',
  baseUrl: 'https://mycima.gripe',
  categories: {
    movies_all: '/movies/',
    movies_foreign: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    movies_arabic: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%b9%d8%b1%d8%a8%d9%8a/',
    movies_indian: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a/',
    movies_turkish: '/category/%d8%a3%d9%81%d9%84%d8%a7%d9%85/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%89/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    series_arabic: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%b9%d8%b1%d8%a8%d9%8a/',
    series_turkish: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    series_asian: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    anime_movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%83%d8%b1%d8%aa%d9%88%d9%86/',
    anime_series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%83%d8%b1%d8%aa%d9%88%d9%86/'
  }
};

function extractBgImage(styleAttr = '') {
  const m = String(styleAttr).match(/url\(['"]?([^'")]+)['"]?\)/i);
  return m ? m[1] : '';
}

export async function scrapeMyCimaCategory(catKey = 'movies_all', page = 1) {
  const subPath = MYCIMA_CONFIG.categories[catKey] || MYCIMA_CONFIG.categories.movies_all;
  const url = page > 1 ? `${MYCIMA_CONFIG.baseUrl}${subPath}page/${page}/` : `${MYCIMA_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('.Grid--WecimaPosts .GridItem').each((_, el) => {
    const anchor = $(el).find('.Thumb--GridItem a').first();
    const href = anchor.attr('href') || '';
    const rawTitle = $(el).find('strong.hasyear, .Title--GridItem').text().trim() || anchor.attr('title') || '';
    const yearMatch = rawTitle.match(/\((\d{4})\)/) || $(el).find('.year').text().match(/(\d{4})/);
    const bgStyle = $(el).find('span.BG--GridItem').attr('data-lazy-style') || $(el).find('span.BG--GridItem').attr('style') || '';
    const poster = extractBgImage(bgStyle) || $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    if (href && rawTitle) {
      results.push({
        id: `mycima:${Buffer.from(href).toString('base64url')}`,
        title: rawTitle.replace(/\(\d{4}\)/g, '').trim(),
        year: yearMatch ? yearMatch[1] : '2025',
        poster,
        url: href,
        source: 'mycima',
        serverPrefix: 'MA',
        type: /مسلسل|حلقة|موسم/i.test(rawTitle) || catKey.startsWith('series') ? 'series' : 'movie'
      });
    }
  });
  return results;
}

// البحث المباشر عبر واجهة AjaxCenter الخاصة بماي سيما
export async function searchMyCima(query) {
  const url = `${MYCIMA_CONFIG.baseUrl}/AjaxCenter/Searching/${encodeURIComponent(query)}/`;
  const raw = await fetchWithAntiBan(url);
  if (!raw) return [];
  let html = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.output) html = parsed.output;
  } catch (_) {}

  const $ = cheerio.load(html);
  const items = [];
  $('.GridItem').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('strong').text().trim() || a.attr('title') || '';
    const poster = extractBgImage($(el).find('.BG--GridItem').attr('style') || '');
    if (href && title) {
      items.push({
        id: `mycima:${Buffer.from(href).toString('base64url')}`,
        title: title.replace(/\(\d{4}\)/g, '').trim(),
        year: (title.match(/\((\d{4})\)/) || [])[1] || '2025',
        poster,
        url: href,
        source: 'mycima'
      });
    }
  });
  return items;
}

// استخراج الحلقات وروابط .m3u8 و .mp4 الصافية من صفحة العمل في ماي سيما
export async function extractMyCimaStreamsAndEpisodes(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const directServers = [];
  const embedCandidates = [];
  const episodes = [];

  // 1. استخراج روابط الـ .mp4 المباشرة من قائمة التحميل الخاصة بماي سيما (أسرع وأنقى بث بدون Iframe)
  $('ul.List--Download--Wecima--Single li a, .Download--Wecima--Single a').each((idx, el) => {
    const dlHref = ($(el).attr('href') || '').trim();
    const resText = $(el).find('resolution').text().trim() || $(el).text().trim();
    const qualityMatch = resText.match(/(1080p|720p|480p|360p|4K)/i);
    if (dlHref && (dlHref.includes('.mp4') || dlHref.includes('.m3u8') || dlHref.startsWith('http'))) {
      directServers.push({
        provider: 'mycima',
        code: `MA-${directServers.length + 1}`,
        url: dlHref,
        streamType: dlHref.includes('.m3u8') ? 'm3u8' : 'mp4',
        quality: qualityMatch ? qualityMatch[1] : 'HD',
        headers: generateAntiBanHeaders(targetUrl)
      });
    }
  });

  // 2. استخراج روابط المشغلات من WatchServersList وفكها إلى .m3u8 / .mp4
  $('ul.WatchServersList li, ul.WatchServersList li btn').each((_, el) => {
    const rawWatch = $(el).attr('data-watch') || $(el).attr('data-url') || '';
    if (rawWatch && rawWatch.startsWith('http')) {
      embedCandidates.push(rawWatch);
    }
  });

  const unwrappedList = await Promise.all(
    embedCandidates.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, targetUrl))
  );
  for (const group of unwrappedList) {
    for (const s of group) {
      directServers.push({
        provider: 'mycima',
        code: `MA-${directServers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  // 3. استخراج قائمة الحلقات والمواسم
  $('.Episodes--Seasons--Episodes a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epTitle = $(el).find('episodetitle').text().trim() || $(el).text().trim();
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

  return { episodes: episodes.reverse(), servers: directServers };
}
