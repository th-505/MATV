// server/scrapers/sites/3cktv.mjs
import * as cheerio from 'cheerio';
import { fetchWithAntiBan } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams, unwrapBase64BridgeUrl } from '../stream-unwrapper.mjs';

export const THREE_CKTV_CONFIG = {
  key: '3cktv',
  code: '3V',
  baseUrl: 'https://e.3cktv.com',
  categories: {
    turkish_latest: '/episodes/',
    turkish_subbed: '/category/مسلسلات-تركية-مترجمة/',
    turkish_dubbed: '/category/مسلسلات-تركية-مدبلجة/',
    turkish_movies: '/category/أفلام-تركية/'
  }
};

export async function scrape3cktvCategory(catKey = 'turkish_latest', page = 1) {
  const subPath = THREE_CKTV_CONFIG.categories[catKey] || THREE_CKTV_CONFIG.categories.turkish_latest;
  const url = page > 1 ? `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(subPath)}page/${page}/` : `${THREE_CKTV_CONFIG.baseUrl}${encodeURI(subPath)}`;
  const html = await fetchWithAntiBan(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items = [];

  $('article.post, .block-post').each((_, el) => {
    const a = $(el).find('a').first();
    const href = a.attr('href') || '';
    const title = $(el).find('.title, h2, h3').text().trim() || a.attr('title') || '';
    const bgStyle = $(el).find('.imgBg, .poster').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const poster = (bgMatch ? bgMatch[1] : '') || $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';

    if (href && title) {
      items.push({
        id: `3cktv:${Buffer.from(href).toString('base64url')}`,
        title: title.replace(/قصة عشق|قصص عشق/g, '').trim(),
        poster,
        url: href,
        source: '3cktv',
        category: 'turkish',
        serverPrefix: '3V',
        type: /فيلم/i.test(title) ? 'movie' : 'series'
      });
    }
  });
  return items;
}

export async function extract3cktvStreamsAndEpisodes(targetUrl) {
  const watchUrl = targetUrl.includes('?do=views') ? targetUrl : `${targetUrl.replace(/\/+$/, '')}/?do=views`;
  const html = await fetchWithAntiBan(watchUrl) || await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const candidateUrls = [];
  const episodes = [];

  // استخراج السيرفرات من قوائم data-url / data-watch / myframe
  $('ul.serversList li, .watchServers li, [data-url], [data-watch], iframe').each((_, el) => {
    const raw = $(el).attr('data-url') || $(el).attr('data-watch') || $(el).attr('src') || '';
    if (raw && raw.startsWith('http')) {
      candidateUrls.push(unwrapBase64BridgeUrl(raw));
    }
  });

  // استخراج الحلقات
  $('.episodesList a, ul.listEpisodes a').each((idx, el) => {
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

  const unwrapped = await Promise.all(
    candidateUrls.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, watchUrl))
  );

  const servers = [];
  for (const grp of unwrapped) {
    for (const s of grp) {
      servers.push({
        provider: '3cktv',
        code: `3V-${servers.length + 1}`,
        url: s.url,
        streamType: s.streamType,
        quality: s.quality,
        headers: s.headers
      });
    }
  }

  return { episodes, servers };
}
