// server/scrapers/sites/egydead.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const EGYDEAD_CONFIG = {
  key: 'egydead',
  code: 'ED',
  baseUrl: 'https://w1.egydead.top',
  liveDomain: 'https://tv10.egydead.live',
  categories: {
    movies_foreign: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    movies_arabic: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%b9%d8%b1%d8%a8%d9%8a/',
    movies_turkish: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    movies_asian: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    movies_indian: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a%d8%a9/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    series_turkish: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    series_turkish_dubbed: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9-%d9%85%d8%af%d8%a8%d9%84%d8%ac%d8%a9/',
    series_asian: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/',
    anime_movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%83%d8%b1%d8%aa%d9%88%d9%86/',
    anime_series: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d9%86%d9%85%d9%8a/'
  }
};

export async function scrapeEgyDeadCategory(catKey = 'movies_foreign', page = 1, useLiveDomain = false) {
  const host = useLiveDomain ? EGYDEAD_CONFIG.liveDomain : EGYDEAD_CONFIG.baseUrl;
  const subPath = EGYDEAD_CONFIG.categories[catKey] || EGYDEAD_CONFIG.categories.movies_foreign;
  const url = page > 1 ? `${host}${subPath}?page=${page}` : `${host}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('li.movieItem').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('h1.BottomTitle').text().trim() || a.attr('title') || '';
    const poster = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
    const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);

    if (href && title) {
      items.push({
        id: `egydead:${Buffer.from(href).toString('base64url')}`,
        title: title.replace(/مشاهدة|فيلم|مسلسل|مترجم|مدبلج/g, '').trim(),
        year: yearMatch ? yearMatch[1] : '2025',
        poster,
        url: href,
        source: 'egydead',
        serverPrefix: 'ED',
        type: /مسلسل|حلقة|موسم/i.test(title) || catKey.startsWith('series') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function extractEgyDeadStreamsAndEpisodes(targetUrl) {
  // 1. إرسال طلب POST مع View=1 لفتح قفل صفحة السيرفرات في إيجي ديد
  let html = '';
  try {
    const postRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...generateAntiBanHeaders(targetUrl),
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: targetUrl
      },
      body: 'View=1'
    });
    if (postRes.ok) html = await postRes.text();
  } catch (_) {}

  if (!html) html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const episodes = [];
  const rawServerLinks = [];
  const directServers = [];

  // 2. استخراج الحلقات من القائمة .EpsList
  $('.EpsList li a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epText = $(el).text().trim() || $(el).attr('title') || '';
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

  // 3. استخراج روابط السيرفرات من ul.serversList li[data-link]
  $('ul.serversList li').each((_, el) => {
    const link = ($(el).attr('data-link') || '').trim();
    if (link && link.startsWith('http')) {
      rawServerLinks.push(link);
    }
  });

  // 4. استخراج روابط التحميل المباشر من .donwload-servers-list
  $('.donwload-servers-list li a.ser-link').each((_, el) => {
    const dlHref = ($(el).attr('href') || '').trim();
    if (dlHref && (dlHref.includes('.mp4') || dlHref.includes('.m3u8'))) {
      directServers.push({
        provider: 'egydead',
        code: `ED-${directServers.length + 1}`,
        url: dlHref,
        streamType: dlHref.includes('.m3u8') ? 'm3u8' : 'mp4',
        quality: 'Direct-HD',
        headers: generateAntiBanHeaders(targetUrl)
      });
    } else if (dlHref && dlHref.startsWith('http')) {
      rawServerLinks.push(dlHref);
    }
  });

  // 5. فك جميع روابط السيرفرات إلى .m3u8 / .mp4
  const unwrappedGroups = await Promise.all(
    rawServerLinks.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, targetUrl))
  );
  for (const grp of unwrappedGroups) {
    for (const s of grp) {
      directServers.push({
        provider: 'egydead',
        code: `ED-${directServers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes: episodes.reverse(), servers: directServers };
}
