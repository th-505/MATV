import { pathToFileURL } from 'node:url';

// Node >=22 already provides fetch; no additional runtime dependency is needed.
export const TARGET_PAGE = 'https://3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/see/';
export const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// This is the proposed header, pending manifest/segment and device validation.
export const REQUIRED_REFERER = 'https://ukrcdn.club/';

async function fetchHtml(fetchImpl, url, referer, cookie = '', accept = 'text/html') {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept, ...(referer ? { Referer: referer } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} عند جلب ${url}`);
  return {
    html: await response.text(),
    // Only pass these cookies back to the source origin, never to ukrcdn.
    cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '),
  };
}

export async function runPoC({ fetchImpl = globalThis.fetch, log = console.log } = {}) {
  log('[1/4] جاري جلب صفحة المشاهدة...');
  const episodeUrl = TARGET_PAGE.replace(/see\/$/, '');
  const session = await fetchHtml(fetchImpl, episodeUrl);
  const page = await fetchHtml(fetchImpl, TARGET_PAGE, episodeUrl, session.cookie);
  const pageHtml = page.html;

  log('[2/4] جاري استخراج رابط التضمين (Embed URL)...');
  const embedMatch = pageHtml.match(/https?:\/\/[^\s"'<>]+\/embed\/\d+\/\d+\/\d+\/?/);
  if (!embedMatch) throw new Error('فشل العثور على رابط التضمين');
  const embedUrl = embedMatch[0];

  log('[3/4] الدخول لصفحة المشغل وجلب ukrcdn...');
  const sourceCookie = new URL(embedUrl).origin === new URL(TARGET_PAGE).origin ? (page.cookie || session.cookie) : '';
  const { html: embedHtml } = await fetchHtml(fetchImpl, embedUrl, 'https://3iskk.xyz', sourceCookie);
  const ukrcdnMatch = embedHtml.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*ukrcdn\.[a-z]+\/e\/[a-zA-Z0-9-]+/);
  if (!ukrcdnMatch) throw new Error('فشل العثور على سيرفر ukrcdn');
  const playerUrl = ukrcdnMatch[0];

  log('[4/4] استخراج رابط البث master.m3u8...');
  const { html: playerHtml } = await fetchHtml(fetchImpl, playerUrl, embedUrl);
  const m3u8Matches = playerHtml.match(/https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/g) || [];
  let masterUrl = m3u8Matches.find(url => new URL(url).pathname.endsWith('/master.m3u8')) || m3u8Matches[0];
  // The current ukrcdn player obtains HLS from its own playback JSON endpoint.
  // Parse the literal URL only; never evaluate scripts from the source page.
  if (!masterUrl) {
    const apiLiteral = playerHtml.match(/\bfetch\(\s*("(?:\\.|[^"\\])*")/);
    if (apiLiteral) {
      const apiUrl = new URL(JSON.parse(apiLiteral[1]), playerUrl);
      if (apiUrl.origin !== new URL(playerUrl).origin || !/^\/api\/videos\/[^/]+\/playback$/.test(apiUrl.pathname)) {
        throw new Error('رابط playback API غير متوقع');
      }
      const { html: apiBody } = await fetchHtml(fetchImpl, apiUrl.href, playerUrl, '', 'application/json');
      const playback = JSON.parse(apiBody);
      if (typeof playback.url === 'string') {
        const candidate = new URL(playback.url);
        if (/^https?:$/.test(candidate.protocol) && candidate.pathname.endsWith('.m3u8')) masterUrl = candidate.href;
      }
    }
  }
  if (!masterUrl) throw new Error('فشل استخراج رابط master.m3u8');

  log('\n--- نتيجة الـ PoC ---');
  log('Stream URL:', masterUrl);
  log('Required Referer (pending validation):', REQUIRED_REFERER);
  return { embedUrl, playerUrl, masterUrl, headers: { Referer: REQUIRED_REFERER, 'User-Agent': USER_AGENT } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPoC().catch(error => {
    console.error('خطأ أثناء الفحص:', error.message, error.cause?.code || '');
    process.exitCode = 1;
  });
}
