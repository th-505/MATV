// server/scrapers/sites/specialized-portals.mjs
// يضم القواشط المخصصة لـ: RistoAnime (RE), QFilm (QM), IPAUniverse (IE), Mewsry (MY)
import * as cheerio from 'cheerio';
import { fetchWithAntiBan, generateAntiBanHeaders } from '../anti-ban.mjs';
import { unwrapEmbedToDirectStreams, extractRawStreamsFromText } from '../stream-unwrapper.mjs';

// 1. RistoAnime (https://ristoanime.me) — الرمز: RE
export async function extractRistoAnimeStreams(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };
  const $ = cheerio.load(html);
  const candidates = [];
  const episodes = [];

  $('ul.servers-list li, [data-embed], [data-src], iframe').each((_, el) => {
    const u = $(el).attr('data-embed') || $(el).attr('data-src') || $(el).attr('src') || '';
    if (u && u.startsWith('http')) candidates.push(u);
  });

  $('.episodes-list a, .EpsList a').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epNum = Number($(el).text().match(/(\d+)/)?.[1]) || idx + 1;
    if (epHref) episodes.push({ number: epNum, episodeNumber: epNum, title: `الحلقة ${epNum}`, label: `الحلقة ${epNum}`, url: epHref });
  });

  const unwrapped = await Promise.all(candidates.slice(0, 6).map(u => unwrapEmbedToDirectStreams(u, targetUrl)));
  const servers = unwrapped.flat().map((s, i) => ({ provider: 'ristoanime', code: `RE-${i + 1}`, ...s }));
  return { episodes, servers };
}

// 2. QFilm (https://a.qfilm.tv) — الرمز: QM
export async function extractQFilmStreams(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };
  const direct = extractRawStreamsFromText(html, targetUrl);
  const $ = cheerio.load(html);
  const candidates = [];

  $('video source, [data-stream], [data-url], iframe').each((_, el) => {
    const u = $(el).attr('src') || $(el).attr('data-stream') || $(el).attr('data-url') || '';
    if (u && u.startsWith('http')) candidates.push(u);
  });

  const unwrapped = await Promise.all(candidates.slice(0, 5).map(u => unwrapEmbedToDirectStreams(u, targetUrl)));
  const merged = [...direct, ...unwrapped.flat()];
  const servers = merged.map((s, i) => ({ provider: 'qfilm', code: `QM-${i + 1}`, ...s }));
  return { episodes: [], servers };
}

// 3. IPA Universe (https://watch.ipauniverse.com) — الرمز: IE
export async function extractIpaUniverseStreams(targetUrl) {
  const html = await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };
  const direct = extractRawStreamsFromText(html, targetUrl);
  const $ = cheerio.load(html);
  const candidates = [];

  $('source[src], [data-video], [data-src], a[href*=".mp4"], a[href*=".m3u8"]').each((_, el) => {
    const u = $(el).attr('src') || $(el).attr('data-video') || $(el).attr('data-src') || $(el).attr('href') || '';
    if (u && u.startsWith('http')) candidates.push(u);
  });

  const unwrapped = await Promise.all(candidates.slice(0, 5).map(u => unwrapEmbedToDirectStreams(u, targetUrl)));
  const servers = [...direct, ...unwrapped.flat()].map((s, i) => ({ provider: 'ipauniverse', code: `IE-${i + 1}`, ...s }));
  return { episodes: [], servers };
}

// 4. Mewsry Live (https://www.mewsry.live) — الرمز: MY (نظام PHP Melody: watch.php?vid=... -> play.php?vid=...)
export async function extractMewsryStreams(targetUrl) {
  const playUrl = targetUrl.replace('watch.php?vid=', 'play.php?vid=');
  const html = await fetchWithAntiBan(playUrl) || await fetchWithAntiBan(targetUrl);
  if (!html) return { episodes: [], servers: [] };

  const $ = cheerio.load(html);
  const candidates = [];
  const episodes = [];

  $('.watch-servers li, [data-embed], #Playerholder iframe, video source').each((_, el) => {
    const u = $(el).attr('data-embed') || $(el).attr('src') || '';
    if (u && u.startsWith('http')) candidates.push(u);
  });

  $('.pm-ul-browse-videos li a[href*="watch.php?vid="]').each((idx, el) => {
    const epHref = $(el).attr('href') || '';
    const epText = $(el).attr('title') || $(el).text().trim();
    const epNum = Number(epText.match(/(\d+)/)?.[1]) || idx + 1;
    if (epHref) episodes.push({ number: epNum, episodeNumber: epNum, title: `الحلقة ${epNum}`, label: `الحلقة ${epNum}`, url: epHref });
  });

  const unwrapped = await Promise.all(candidates.slice(0, 5).map(u => unwrapEmbedToDirectStreams(u, playUrl)));
  const servers = unwrapped.flat().map((s, i) => ({ provider: 'mewsry', code: `MY-${i + 1}`, ...s }));
  return { episodes, servers };
}
