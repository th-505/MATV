import { load } from 'cheerio';
import { sourcePublishedAt } from '../source-publication.mjs';

import { ISK_ORIGIN, ISK_UA } from './3isk-playback/contract.mjs';
import { selectPlayerIframe, resolvePlayer } from './3isk-playback/router.mjs';
export { ISK_ORIGIN, ISK_UA, assert3iskStream } from './3isk-playback/contract.mjs';
export { unpack3iskPlayer } from './3isk-playback/miravd.mjs';

export const ISK_CATEGORIES = Object.freeze({
  '3isk-latest': `${ISK_ORIGIN}/`,
  '3isk-movies': `${ISK_ORIGIN}/w-mvs/`,
  '3isk-turkish': `${ISK_ORIGIN}/w-srs/`,
  '3isk-dubbed': `${ISK_ORIGIN}/genre/series-mudablij-121/`,
});

function assertSource(value) {
  const url = new URL(value, ISK_ORIGIN);
  if (url.protocol !== 'https:' || url.origin !== ISK_ORIGIN || url.username || url.password) throw new Error('3ISK_BAD_SOURCE');
  return url;
}

export function encode3iskRef(value) {
  const url = assertSource(value);
  if (!/^\/watch\/(?:tvshows|episodes|movies)\/[^/]+\/$/.test(url.pathname) || url.search || url.hash) throw new Error('3ISK_BAD_REFERENCE');
  return `3isk:${Buffer.from(url.pathname).toString('base64url')}`;
}

export function decode3iskRef(ref) {
  if (!/^3isk:[A-Za-z0-9_-]{1,1024}$/.test(String(ref))) throw new Error('3ISK_BAD_REFERENCE');
  const path = Buffer.from(ref.slice(5), 'base64url').toString('utf8');
  const url = assertSource(path);
  if (encode3iskRef(url.href) !== ref) throw new Error('3ISK_BAD_REFERENCE');
  return url;
}

function imageUrl(value) {
  if (!value) return '';
  try { const url = new URL(value, ISK_ORIGIN); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

export function parse3iskCatalog(html, kind = null) {
  const $ = load(html);
  const items = new Map();
  $('a.type_item').each((_, node) => {
    const anchor = $(node);
    try {
      const ref = encode3iskRef(anchor.attr('href'));
      const path = decode3iskRef(ref).pathname;
      const type = path.startsWith('/watch/movies/') ? 'movie' : path.startsWith('/watch/episodes/') ? 'episode' : 'series';
      if (kind && type !== kind) return;
      const img = anchor.find('img').first();
      items.set(ref, {
        id: ref, ref, href: ref, title: anchor.find('.item_title').text().trim() || anchor.attr('title') || img.attr('alt') || 'بدون عنوان',
        poster: imageUrl(img.attr('data-image') || img.attr('data-src') || img.attr('src') || ''),
        type, is_series: type !== 'movie', source: '3isk',
      });
    } catch { /* Skip unrelated or malformed source links. */ }
  });
  return [...items.values()];
}

export function parse3iskDetails(html) {
  const $ = load(html);
  const episodes = new Map();
  $('a.ep-num').each((_, node) => {
    const anchor = $(node);
    try {
      const ref = encode3iskRef(anchor.attr('href'));
      const url = decode3iskRef(ref);
      if (!url.pathname.startsWith('/watch/episodes/')) return;
      const number = Number(anchor.attr('data-ep-num') || anchor.find('b').text());
      if (!Number.isInteger(number) || number < 1) return;
      const season = Number(url.pathname.match(/-season-(\d+)-/)?.[1] || 1);
      episodes.set(ref, { episode_id: ref, ref, link: ref, episode_number: number, num: number, season,
        title: anchor.attr('title') || `الحلقة ${number}`, watch_available: true });
    } catch { /* Never promote source post IDs to visible episode numbers. */ }
  });
  return { status: 'success', source: '3isk', movie_title: $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'التفاصيل',
    poster: imageUrl($('meta[property="og:image"]').attr('content') || ''),
    episodes: [...episodes.values()].sort((a, b) => a.season - b.season || a.num - b.num),
    ...(sourcePublishedAt(html) ? {published_at:sourcePublishedAt(html)} : {}), download_available: false };
}

export function create3iskProvider({ fetchImpl = globalThis.fetch, now = Date.now,
  onPage = process.env.ISK_DIAGNOSTICS === '1' ? info => console.info(JSON.stringify({ event: '3isk_source_page', ...info })) : () => {} } = {}) {
  async function page(value, { referer = ISK_ORIGIN + '/', cookies = new Map(), redirects = 0, json = false, signal = null } = {}) {
    const url = new URL(value);
    const source = url.origin === ISK_ORIGIN;
    const player = url.protocol === 'https:' && ['ukrcdn.club', 'ukrcdn.com', 'miravd.com'].includes(url.hostname) && !url.port;
    if ((!source && !player) || url.username || url.password) throw new Error('3ISK_BAD_SOURCE');
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    const response = await fetchImpl(url.href, { redirect: 'manual', signal: requestSignal, headers: {
      'User-Agent': ISK_UA, Referer: referer, Accept: json ? 'application/json' : 'text/html',
      ...(source && cookies.size ? { Cookie: [...cookies].map(([key, val]) => `${key}=${val}`).join('; ') } : {}),
    } });
    if (source) for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const split = pair.indexOf('=');
      if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      onPage({ host: url.hostname, path: url.pathname, status: response.status, redirect_path: new URL(response.headers.get('location'), url).pathname, cookie_names: [...cookies.keys()] });
      await response.body?.cancel();
      if (redirects >= 3) throw new Error('3ISK_REDIRECT_LIMIT');
      return page(new URL(response.headers.get('location'), url).href, { referer, cookies, redirects: redirects + 1, json, signal });
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`3ISK_HTTP_${response.status}`); }
    let body = ''; let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error('3ISK_PAGE_TOO_LARGE');
      body += decoder.decode(chunk, { stream: true });
    }
    body += decoder.decode();
    if (source) {
      const parsed = load(body);
      onPage({ host: url.hostname, path: url.pathname, status: response.status, cookie_names: [...cookies.keys()],
        title: parsed('title').text().slice(0, 100), iframe_count: parsed('iframe').length, bytes: size });
    }
    return body;
  }

  return {
    async category(id, number = 1) {
      const base = ISK_CATEGORIES[id];
      if (!base) throw new Error('3ISK_BAD_CATEGORY');
      const p = Number(number);
      if (!Number.isInteger(p) || p < 1 || p > 500) throw new Error('3ISK_BAD_PAGE');
      const html = await page(p === 1 ? base : `${base}page/${p}/`);
      return { status: 'success', source: '3isk', data: parse3iskCatalog(html, id === '3isk-latest' ? 'episode' : id === '3isk-movies' ? 'movie' : 'series') };
    },
    async search(query, { signal = null } = {}) {
      const q = String(query || '').trim().slice(0, 120);
      if (!q) return { status: 'success', source: '3isk', data: [] };
      const url = new URL(ISK_ORIGIN + '/'); url.searchParams.set('s', q);
      return { status: 'success', source: '3isk', data: parse3iskCatalog(await page(url.href, { signal })) };
    },
    async metadata(ref) {
      return parse3iskDetails(await page(decode3iskRef(ref).href));
    },
    async details(ref) {
      const url = decode3iskRef(ref);
      if (!url.pathname.startsWith('/watch/tvshows/')) throw new Error('3ISK_EXPECTED_SERIES');
      return parse3iskDetails(await page(url.href));
    },
    async resolve(ref, { allowClientResolution = true } = {}) {
      const episode = decode3iskRef(ref);
      if (!/^\/watch\/(episodes|movies)\//.test(episode.pathname)) throw new Error('3ISK_EXPECTED_PLAYABLE');
      const cookies = new Map();
      const episodeHtml = await page(episode.href, { cookies });
      const details = parse3iskDetails(episodeHtml);
      const html = await page(`${episode.href}see/`, { cookies, referer: episode.href });
      const $ = load(html);
      let embedValue = $('iframe#iframe_player').attr('src') || html.match(/https?:\/\/[^\s"'<>]+\/embed\/\d+\/\d+\/\d+\/?/)?.[0];
      if (!embedValue) {
        // The source's own front.theme JS constructs embed/<server>/<post>/2/
        // for TV episodes. Some hosting networks receive the episode redirect
        // instead of the see page. Derive the same public player route from
        // the episode's WordPress post metadata, not from a hardcoded post ID.
        const episodeDocument = load(episodeHtml);
        const bodyClass = episodeDocument('body').attr('class') || '';
        const post = bodyClass.match(/\bpostid-(\d+)\b/)?.[1];
        if (post && /\bsingle-(episodes|movies)\b/.test(bodyClass)) {
          embedValue = `${ISK_ORIGIN}/embed/1/${post}/${bodyClass.includes("single-movies") ? 1 : 2}/`;
        }
      }
      if (!embedValue) throw new Error('3ISK_EMBED_NOT_FOUND');
      const embed = assertSource(embedValue);
      if (!/^\/embed\/\d+\/\d+\/\d+\/$/.test(embed.pathname)) throw new Error('3ISK_BAD_EMBED');
      const embedHtml = await page(embed.href, { cookies, referer: ISK_ORIGIN });
      const route = selectPlayerIframe(embedHtml, embed.href);
      if (allowClientResolution && route.extractor === 'miravd') {
        return { ...details, episodes: [], extractor: 'miravd', player_type: 'miravd',
          playback_mode: 'client_resolve', iframe_url: route.playerUrl.href,
          wrapper_url: route.wrapperUrl.href, resolver_url: route.playerUrl.href,
          resolver_headers: { Referer: route.wrapperUrl.href, 'User-Agent': ISK_UA },
          download_available: false };
      }
      const playback = await resolvePlayer(route, { page, now });
      return { ...details, episodes: [], ...playback };
    },
  };
}
