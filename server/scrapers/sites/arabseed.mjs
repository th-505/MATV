// server/scrapers/sites/arabseed.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams, unwrapBase64BridgeUrl } from '../stream-unwrapper.mjs';

export const ARABSEED_CONFIG = {
  key: 'arabseed',
  code: 'AD',
  baseUrl: 'https://www.arabseed.wine',
  categories: {
    movies_foreign: '/category/foreign-movies/',
    movies_arabic: '/category/arabic-movies-5/',
    movies_turkish: '/category/turkish-movies/',
    movies_indian: '/category/indian-movies/',
    movies_asian: '/category/asian-movies/',
    series_foreign: '/category/foreign-series/',
    series_arabic: '/category/arabic-series/',
    series_turkish: '/category/turkish-series-1/',
    series_ramadan: '/category/ramadan-series-2025/',
    anime_movies: '/category/cartoon-movies/',
    anime_series: '/category/cartoon-series/'
  }
};

export async function scrapeArabSeedCategory(catKey = 'movies_foreign', page = 1) {
  const subPath = ARABSEED_CONFIG.categories[catKey] || ARABSEED_CONFIG.categories.movies_foreign;
  const url = page > 1 ? `${ARABSEED_CONFIG.baseUrl}${subPath}page/${page}/` : `${ARABSEED_CONFIG.baseUrl}${subPath}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('.MovieBlock, ul.Blocks-UL li').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('h4, .BlockName').text().trim() || a.attr('title') || '';
    const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('data-image') || $(el).find('img').attr('src') || '';

    if (href && title) {
      items.push({
        id: `arabseed:${Buffer.from(href).toString('base64url')}`,
        title: title.replace(/مشاهدة|فيلم|مسلسل|مترجم|اون لاين/g, '').trim(),
        year: (title.match(/\b(19\d\d|20\d\d)\b/) || [])[1] || '2025',
        poster,
        url: href,
        source: 'arabseed',
        serverPrefix: 'AD',
        type: /مسلسل|حلقة/i.test(title) || catKey.startsWith('series') ? 'series' : 'movie'
      });
    }
  });
  return items;
}

export async function extractArabSeedStreamsAndEpisodes(targetUrl) {
  const mainHtml = await fetchWithAntiBan(targetUrl);
  if (!mainHtml) return { episodes: [], servers: [] };

  const $main = cheerio.load(mainHtml);
  const episodes = [];

  // 1. استخراج قائمة الحلقات من ContainerEpisodesList
  $main('.ContainerEpisodesList a').each((idx, el) => {
    const epHref = $main(el).attr('href') || '';
    const epText = $main(el).text().trim();
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

  // 2. الانتقال إلى رابط صفحة المشاهدة الفعلي (a.watch__btn)
  const watchPageUrl = $main('a.watch__btn, a[href*="/watch/"]').attr('href') || targetUrl;
  const watchHtml = watchPageUrl !== targetUrl ? await fetchWithAntiBan(watchPageUrl) : mainHtml;
  const $watch = cheerio.load(watchHtml || mainHtml);

  const candidateUrls = [];
  const postId = $watch('.WatchServersUl li[data-post]').first().attr('data-post') || '';

  // أ) سحب الروابط من data-link وفك تشفير play.php?url= Base64
  $watch('.WatchServersUl li, [data-link], .containerServers iframe').each((_, el) => {
    const rawLink = $watch(el).attr('data-link') || $watch(el).attr('src') || '';
    if (rawLink && rawLink.startsWith('http')) {
      candidateUrls.push(unwrapBase64BridgeUrl(rawLink));
    }
  });

  // ب) إذا كان يعتمد على AJAX (admin-ajax.php) لجلب السيرفرات
  if (postId && candidateUrls.length < 2) {
    for (const srvIdx of ['0', '1', '2', '3']) {
      try {
        const ajaxRes = await fetch(`${ARABSEED_CONFIG.baseUrl}/wp-admin/admin-ajax.php`, {
          method: 'POST',
          headers: {
            ...generateAntiBanHeaders(watchPageUrl),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: watchPageUrl
          },
          body: new URLSearchParams({ action: 'get_watch_server', post_id: postId, server: srvIdx, qu: '1080' }).toString()
        });
        if (ajaxRes.ok) {
          const snippet = await ajaxRes.text();
          const m = snippet.match(/src=["'](https?:\/\/[^"']+)["']/i);
          if (m) candidateUrls.push(unwrapBase64BridgeUrl(m[1]));
        }
      } catch (_) {}
    }
  }

  // 3. فك جميع الروابط المستخرجة إلى .m3u8 و .mp4 صافية
  const unwrappedGroups = await Promise.all(
    candidateUrls.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, watchPageUrl))
  );

  const servers = [];
  for (const grp of unwrappedGroups) {
    for (const s of grp) {
      servers.push({
        provider: 'arabseed',
        code: `AD-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes: episodes.reverse(), servers };
}
