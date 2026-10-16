// server/scrapers/sites/cimanow.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const CIMANOW_CONFIG = {
  key: 'cimanow',
  code: 'CW',
  baseUrl: 'https://vip.cimanowinc.com',
  categories: {
    movies_foreign: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a%d8%a9/',
    movies_arabic: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%b9%d8%b1%d8%a8%d9%8a%d8%a9/',
    movies_turkish: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    movies_indian: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a%d8%a9/',
    series_arabic: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%b9%d8%b1%d8%a8%d9%8a%d8%a9/',
    series_foreign: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a%d8%a9/',
    series_turkish: '/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/',
    anime_movies: '/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d9%86%d9%85%d9%8a%d8%b4%d9%86/'
  }
};

export async function scrapeCimaNowCategory(catKey = 'movies_foreign', page = 1) {
  const subPath = CIMANOW_CONFIG.categories[catKey] || CIMANOW_CONFIG.categories.movies_foreign;
  const url = page > 1 ? `${CIMANOW_CONFIG.baseUrl}${subPath}page/${page}/` : `${CIMANOW_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('section article a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const title = $(el).find('li[aria-label="title"]').text().replace(/<em>.*<\/em>/gi, '').trim() || $(el).attr('title') || '';
    const year = $(el).find('li[aria-label="year"]').text().trim() || '2025';
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    if (href && title) {
      items.push({
        id: `cimanow:${Buffer.from(href).toString('base64url')}`,
        title,
        year,
        poster,
        url: href,
        source: 'cimanow',
        serverPrefix: 'CW',
        type: href.includes('/selary/') || /مسلسل|حلقة/i.test(title) ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function extractCimaNowStreamsAndEpisodes(targetUrl) {
  // الدخول لمسار /watching/ الإلزامي في سيما ناو
  const watchingUrl = targetUrl.endsWith('/watching/')
    ? targetUrl
    : `${targetUrl.replace(/\/+$/, '')}/watching/`;

  const html = await fetchWithAntiBan(watchingUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const servers = [];
  const episodes = [];

  // 1. سحب روابط الـ .mp4 المباشرة من سيرفرات تحميل سيما ناو الخاصة (<ul id="download">)
  $('ul#download li a, ul[ id="download" ] a').each((_, el) => {
    const dlUrl = ($(el).attr('href') || '').trim();
    const qualityText = $(el).text().trim();
    const qMatch = qualityText.match(/(1080p|720p|480p|360p)/i);
    if (dlUrl && dlUrl.startsWith('http')) {
      servers.push({
        provider: 'cimanow',
        code: `CW-${servers.length + 1}`,
        url: dlUrl,
        streamType: dlUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
        quality: qMatch ? qMatch[1] : 'Direct-MP4',
        headers: generateAntiBanHeaders(watchingUrl)
      });
    }
  });

  // 2. سحب السيرفرات عبر مسار AJAX الداخلي لسيما ناو (switch/server.php) وفكها إلى .m3u8 / .mp4
  const ajaxRequests = [];
  $('ul#watch li[data-id][data-index]').each((_, el) => {
    const dataId = $(el).attr('data-id');
    const dataIndex = $(el).attr('data-index');
    if (dataId && dataIndex !== undefined) {
      const switchUrl = `${CIMANOW_CONFIG.baseUrl}/wp-content/themes/CimaNow.New/Interface/server.php?id=${dataId}&i=${dataIndex}`;
      ajaxRequests.push(switchUrl);
    }
  });

  for (const reqUrl of ajaxRequests.slice(0, 5)) {
    try {
      const res = await fetch(reqUrl, {
        headers: {
          ...generateAntiBanHeaders(watchingUrl),
          'X-Requested-With': 'XMLHttpRequest',
          Referer: watchingUrl
        }
      });
      if (res.ok) {
        const iframeSnippet = await res.text();
        const srcMatch = iframeSnippet.match(/src=["']([^"']+)["']/i);
        if (srcMatch) {
          const rawEmbed = srcMatch[1].startsWith('//') ? `https:${srcMatch[1]}` : srcMatch[1];
          const unwrapped = await unwrapEmbedToDirectStreams(rawEmbed, watchingUrl);
          for (const s of unwrapped) {
            servers.push({
              provider: 'cimanow',
              code: `CW-${servers.length + 1}`,
              url: s.url,
              streamType: s.streamType,
              quality: s.quality,
              headers: s.headers
            });
          }
        }
      }
    } catch (_) {}
  }

  // 3. استخراج الحلقات من <ul id="eps">
  $('ul#eps li a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epNum = Number($(el).find('em').text().trim()) || (idx + 1);
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

  return { episodes, servers };
}
