// web/core/subtitles-hybrid.js — Hybrid Subtitles Engine (Stremio v3 + User AI Key + CP1256 Decoder)
const CP1256_MAP = [
  0x20AC,0x067E,0x201A,0x0192,0x201E,0x2026,0x2020,0x2021,0x02C6,0x2030,0x0679,0x2039,0x0152,0x0686,0x0698,0x0688,
  0x06AF,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x06A9,0x2122,0x0691,0x203A,0x0153,0x200C,0x200D,0x06BA,
  0x00A0,0x060C,0x00A2,0x00A3,0x00A4,0x00A5,0x00A6,0x00A7,0x00A8,0x00A9,0x06BE,0x00AB,0x00AC,0x00AD,0x00AE,0x00AF,
  0x00B0,0x00B1,0x00B2,0x00B3,0x00B4,0x00B5,0x00B6,0x00B7,0x00B8,0x00B9,0x061B,0x00BB,0x00BC,0x00BD,0x00BE,0x061F,
  0x06C1,0x0621,0x0622,0x0623,0x0624,0x0625,0x0626,0x0627,0x0628,0x0629,0x062A,0x062B,0x062C,0x062D,0x062E,0x062F,
  0x0630,0x0631,0x0632,0x0633,0x0634,0x0635,0x0636,0x0637,0x0638,0x0639,0x063A,0x005B,0x005C,0x005D,0x005E,0x005F,
  0x0060,0x0641,0x0642,0x0643,0x0644,0x0645,0x0646,0x0647,0x0648,0x0649,0x064A,0x064B,0x064C,0x064D,0x064E,0x064F,
  0x0650,0x0651,0x0652,0x0670,0x0671,0x0672,0x0673,0x00F7,0x0675,0x0676,0x0677,0x0678,0x0679,0x067A,0x067B,0x06FF
];

export function getUserTranslateKey() {
  try {
    return (localStorage.getItem('matv_user_translate_key') || localStorage.getItem('openrouter_key') || '').trim();
  } catch (_) {
    return '';
  }
}

export const getOpenRouterApiKey = getUserTranslateKey;

export function getUserSubtitlesKey() {
  try {
    return (localStorage.getItem('matv_user_subtitles_key') || '').trim();
  } catch (_) {
    return '';
  }
}

export function decodeArabicBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!utf8.includes('\uFFFD')) return utf8;
  } catch (_) {}
  try {
    return new TextDecoder('windows-1256').decode(bytes);
  } catch (_) {}
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += b < 0x80 ? String.fromCharCode(b) : String.fromCharCode(CP1256_MAP[b - 0x80] || 0x0020);
  }
  return out;
}

export function srtToVtt(srtText) {
  const normalized = String(srtText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${normalized}`;
}

export async function fetchStremioSubtitles(imdbId, mediaType = 'movie', season = 1, episode = 1) {
  if (!imdbId || !String(imdbId).startsWith('tt')) return [];
  const type = (mediaType === 'tv' || mediaType === 'series') ? 'series' : 'movie';
  const queryId = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;
  try {
    const res = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${type}/${encodeURIComponent(queryId)}.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const subs = Array.isArray(data?.subtitles) ? data.subtitles : [];
    return subs
      .filter(s => s && s.url && (s.lang === 'ara' || s.lang === 'ar' || s.lang === 'eng' || s.lang === 'en'))
      .sort((a, b) => (a.lang.startsWith('ar') ? -1 : 1) - (b.lang.startsWith('ar') ? -1 : 1))
      .slice(0, 10)
      .map((s, idx) => ({
        id: s.id || `sub-${idx}`,
        lang: s.lang.startsWith('ar') ? 'ar' : 'en',
        label: s.lang.startsWith('ar') ? `العربية (${idx + 1})` : `English (${idx + 1})`,
        url: s.url
      }));
  } catch (_) {
    return [];
  }
}

export async function translateSrtViaUserAI(srtContent) {
  const apiKey = getUserTranslateKey();
  if (!apiKey) return srtContent;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: [
          { role: 'system', content: 'Translate this SRT subtitle fragment to natural Arabic. Preserve all index numbers and timestamps strictly without modification.' },
          { role: 'user', content: srtContent.slice(0, 10000) }
        ]
      })
    });
    if (!res.ok) return srtContent;
    const json = await res.json();
    return json?.choices?.[0]?.message?.content || srtContent;
  } catch (_) {
    return srtContent;
  }
}

export const translateSubtitlesAi = translateSrtViaUserAI;

export async function findAndLoadSubtitles(videoEl, imdbId, type = 'movie', season = 1, episode = 1) {
  if (!videoEl || !imdbId) return null;
  const tracks = await fetchStremioSubtitles(imdbId, type, season, episode);
  if (!tracks.length) return null;
  const chosen = tracks[0];
  try {
    const res = await fetch(chosen.url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let text = decodeArabicBuffer(buf);
    if (chosen.lang === 'en' && getUserTranslateKey()) {
      text = await translateSrtViaUserAI(text);
    }
    const vtt = text.trim().startsWith('WEBVTT') ? text : srtToVtt(text);
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const trackUrl = URL.createObjectURL(blob);
    videoEl.querySelectorAll('track').forEach(t => t.remove());
    const trackEl = document.createElement('track');
    trackEl.kind = 'subtitles';
    trackEl.label = 'العربية (MA TV)';
    trackEl.srclang = 'ar';
    trackEl.src = trackUrl;
    trackEl.default = true;
    videoEl.appendChild(trackEl);
    if (videoEl.textTracks && videoEl.textTracks[0]) {
      videoEl.textTracks[0].mode = 'showing';
    }
    return trackEl;
  } catch (_) {
    return null;
  }
}
