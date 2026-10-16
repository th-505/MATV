// server/scrapers/sites/shahid4u.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams } from '../stream-unwrapper.mjs';

export const SHAHID4U_CONFIG = {
  key: 'shahid4u',
  code: 'SU',
  baseUrl: 'https://cdn.shahid4u.asia',
  mirrorUrl: 'https://shii4u.cam',
  categories: {
    movies_foreign: '/category/افلام-اجنبي',
    movies_arabic: '/category/افلام-عربي',
    movies_indian: '/category/افلام-هندي',
    movies_turkish: '/category/افلام-تركي',
    series_foreign: '/category/مسلسلات-اجنبي',
    series_arabic: '/category/مسلسلات-عربي',
    series_turkish: '/category/مسلسلات-تركي',
    series_asian: '/category/مسلسلات-اسيوي',
    anime_series: '/category/مسلسلات-انمي',
    anime_movies: '/category/افلام-انمي'
  }
};

export async function scrapeShahid4uCategory(catKey = 'movies_foreign', page = 1, useShii4u = false) {
  const host = useShii4u ? SHAHID4U_CONFIG.mirrorUrl : SHAHID4U_CONFIG.baseUrl;
  const code = useShii4u ? 'SH' : 'SU';
  const subPath = SHAHID4U_CONFIG.categories[catKey] || SHAHID4U_CONFIG.categories.movies_foreign;
  const url = page > 1 ? `${host}${encodeURI(subPath)}?page=${page}` : `${host}${encodeURI(subPath)}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('.content-box, .media-card, .show-card').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('.title, h3, h4').first().text().trim() || a.attr('title') || '';
    const bgStyle = $(el).find('.image, [style*="background"]').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const poster = (bgMatch ? bgMatch[1] : '') || $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    if (href && title) {
      items.push({
        id: `${useShii4u ? 'shii4u' : 'shahid4u'}:${Buffer.from(href).toString('base64url')}`,
        title: title.replace(/مشاهدة|فيلم|مسلسل|مترجم/g, '').trim(),
        poster: poster.startsWith('/') ? `${host}${poster}` : poster,
        url: href.startsWith('/') ? `${host}${href}` : href,
        source: useShii4u ? 'shii4u' : 'shahid4u',
        serverPrefix: code,
        type: /مسلسل|حلقة/i.test(title) || catKey.startsWith('series') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function extractShahid4uStreamsAndEpisodes(targetUrl, useShii4u = false) {
  const prefix = useShii4u ? 'SH' : 'SU';
  // تحويل الرابط لصفحة المشاهدة المباشرة /watch/
  const watchUrl = targetUrl.includes('/watch/')
    ? targetUrl
    : targetUrl.replace(/\/(film|episode|post|series)\//, '/watch/');

  const html = await fetchWithAntiBan(watchUrl) || await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const candidateUrls = [];
  const episodes = [];

  // 1. استخراج مصفوفة السيرفرات المخبأة داخل JSON.parse('...') في كود الجافا سكريبت
  const jsonServersMatch = html.match(/let\s+servers\s*=\s*JSON\.parse\(['"]([\s\S]*?)['"]\)/i)
    || html.match(/servers\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])/i);
  if (jsonServersMatch) {
    try {
      const rawJson = jsonServersMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const srv of parsed) {
          if (srv?.url && srv.url.startsWith('http')) candidateUrls.push(srv.url);
        }
      }
    } catch (_) {}
  }

  // 2. استخراج السيرفرات من أزرار المشاهدة data-embed / data-url
  $('[data-embed], [data-url], .servers-list li').each((_, el) => {
    const u = $(el).attr('data-embed') || $(el).attr('data-url') || '';
    if (u && u.startsWith('http')) candidateUrls.push(u);
  });

  // 3. استخراج الحلقات
  $('a[href*="/episode/"]').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epText = $(el).text().trim();
    const epNum = Number(epText.match(/(\d+)/)?.[1]) || idx + 1;
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

  // 4. فك الروابط إلى .m3u8 و .mp4 صافية
  const unwrapped = await Promise.all(
    candidateUrls.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, watchUrl))
  );

  const servers = [];
  for (const grp of unwrapped) {
    for (const s of grp) {
      servers.push({
        provider: useShii4u ? 'shii4u' : 'shahid4u',
        code: `${prefix}-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
