import { load } from 'cheerio';

export const ISK_ORIGIN = 'https://3iskk.xyz';
export const ISK_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const ISK_CATEGORIES = Object.freeze({
  '3isk-turkish': `${ISK_ORIGIN}/w-srs/`,
  '3isk-dubbed': `${ISK_ORIGIN}/genre/series-mudablij-121/`,
});

function assertSource(value) {
  const url = new URL(value, ISK_ORIGIN);
  if (url.protocol !== 'https:' || url.origin !== ISK_ORIGIN || url.username || url.password) throw new Error('3ISK_BAD_SOURCE');
  return url;
}

export function assert3iskStream(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$/i.test(url.hostname) || url.port || url.username || url.password || !url.pathname.startsWith('/hls/') || !url.pathname.endsWith('.m3u8')) throw new Error('3ISK_BAD_STREAM');
  return url;
}

export function encode3iskRef(value) {
  const url = assertSource(value);
  if (!/^\/watch\/(?:tvshows|episodes)\/[^/]+\/$/.test(url.pathname) || url.search || url.hash) throw new Error('3ISK_BAD_REFERENCE');
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

export function parse3iskCatalog(html) {
  const $ = load(html);
  const items = new Map();
  $('a.type_item').each((_, node) => {
    const anchor = $(node);
    try {
      const ref = encode3iskRef(anchor.attr('href'));
      if (!decode3iskRef(ref).pathname.startsWith('/watch/tvshows/')) return;
      const img = anchor.find('img').first();
      items.set(ref, {
        id: ref, ref, href: ref, title: anchor.find('.item_title').text().trim() || anchor.attr('title') || img.attr('alt') || 'بدون عنوان',
        poster: imageUrl(img.attr('data-image') || img.attr('data-src') || img.attr('src') || ''),
        type: 'series', is_series: true, source: '3isk',
      });
    } catch { /* Skip unrelated, movie, or malformed source links. */ }
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
    episodes: [...episodes.values()].sort((a, b) => a.season - b.season || a.num - b.num), download_available: false };
}

export function create3iskProvider({ fetchImpl = globalThis.fetch, now = Date.now,
  onPage = process.env.ISK_DIAGNOSTICS === '1' ? info => console.info(JSON.stringify({ event: '3isk_source_page', ...info })) : () => {} } = {}) {
  async function page(value, { referer = ISK_ORIGIN + '/', cookies = new Map(), redirects = 0, json = false } = {}) {
    const url = new URL(value);
    const source = url.origin === ISK_ORIGIN;
    const player = url.protocol === 'https:' && url.hostname === 'ukrcdn.club' && !url.port;
    if ((!source && !player) || url.username || url.password) throw new Error('3ISK_BAD_SOURCE');
    const response = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: {
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
      return page(new URL(response.headers.get('location'), url).href, { referer, cookies, redirects: redirects + 1, json });
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
      return { status: 'success', source: '3isk', data: parse3iskCatalog(html) };
    },
    async search(query) {
      const q = String(query || '').trim().slice(0, 120);
      if (!q) return { status: 'success', source: '3isk', data: [] };
      const url = new URL(ISK_ORIGIN + '/'); url.searchParams.set('s', q);
      return { status: 'success', source: '3isk', data: parse3iskCatalog(await page(url.href)) };
    },
    async details(ref) {
      const url = decode3iskRef(ref);
      if (!url.pathname.startsWith('/watch/tvshows/')) throw new Error('3ISK_EXPECTED_SERIES');
      return parse3iskDetails(await page(url.href));
    },
    async resolve(ref) {
      const episode = decode3iskRef(ref);
      if (!episode.pathname.startsWith('/watch/episodes/')) throw new Error('3ISK_EXPECTED_EPISODE');
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
        const post = episodeDocument('body').attr('class')?.match(/\bpostid-(\d+)\b/)?.[1];
        const watchLink = episodeDocument('a.single-watch-btn').attr('href');
        if (post && watchLink && assertSource(watchLink).href === `${episode.href}see/`) {
          embedValue = `${ISK_ORIGIN}/embed/1/${post}/2/`;
        }
      }
      if (!embedValue) throw new Error('3ISK_EMBED_NOT_FOUND');
      const embed = assertSource(embedValue);
      if (!/^\/embed\/\d+\/\d+\/\d+\/$/.test(embed.pathname)) throw new Error('3ISK_BAD_EMBED');
      const embedHtml = await page(embed.href, { cookies, referer: ISK_ORIGIN });
      const playerValue = embedHtml.match(/https:\/\/ukrcdn\.club\/e\/[a-zA-Z0-9-]+/)?.[0];
      if (!playerValue) throw new Error('3ISK_PLAYER_NOT_FOUND');
      const playerHtml = await page(playerValue, { referer: embed.href });
      const literal = playerHtml.match(/\bfetch\(\s*("(?:\\.|[^"\\])*")/);
      let stream;
      if (literal) {
        const api = new URL(JSON.parse(literal[1]), playerValue);
        if (api.origin !== new URL(playerValue).origin || !/^\/api\/videos\/[a-zA-Z0-9-]+\/playback$/.test(api.pathname)) throw new Error('3ISK_BAD_PLAYBACK_API');
        const payload = JSON.parse(await page(api.href, { referer: playerValue, json: true }));
        stream = payload.url;
      } else {
        const candidates = playerHtml.match(/https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/g) || [];
        stream = candidates.find(value => new URL(value).pathname.endsWith('/master.m3u8')) || candidates[0];
      }
      if (!stream) throw new Error('3ISK_STREAM_NOT_FOUND');
      const url = assert3iskStream(stream);
      const expires = Number(url.searchParams.get('expires')) * 1000;
      if (!url.searchParams.get('token') || !Number.isSafeInteger(expires) || expires <= now() + 60_000) throw new Error('3ISK_STREAM_EXPIRED');
      return { ...details, episodes: [], playback_mode: 'direct', media_url: url.href, media_path: url.href,
        media_type: 'm3u8', playback_headers: {}, expires_at: new Date(expires).toISOString(), download_available: false };
    },
  };
}
