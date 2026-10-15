// =====================================================================
// MA TV SUPREME HYBRID SUBTITLES & OPENROUTER TRANSLATION ENGINE
// =====================================================================

export function getOpenRouterApiKey() {
  if (typeof localStorage !== 'undefined') {
    const key = localStorage.getItem('openrouter_key') || localStorage.getItem('openrouter_api_key');
    if (key && key.trim()) return key.trim();
  }
  if (typeof process !== 'undefined' && process?.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  return '';
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const STREMIO_OPENSUBTITLES_BASE = 'https://opensubtitles-v3.strem.io/subtitles';

/**
 * Fetch real Arabic subtitles from Stremio OpenSubtitles v3
 */
export async function fetchStremioSubtitles(imdbId, type = 'movie') {
  if (!imdbId || !imdbId.startsWith('tt')) return [];
  try {
    const url = `${STREMIO_OPENSUBTITLES_BASE}/${type}/${imdbId}.json`;
    const res = await fetch(url, {
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
    });
    if (!res.ok) return [];
    const json = await res.json();
    const all = json.subtitles || [];
    // Prioritize Arabic subtitles first, then English
    const arabic = all.filter(s => s.lang === 'ara' || s.lang === 'ar' || s.lang === 'arabic');
    if (arabic.length > 0) return arabic;
    return all.filter(s => s.lang === 'eng' || s.lang === 'en');
  } catch (err) {
    console.warn('OpenSubtitles fetch failed:', err);
    return [];
  }
}

/**
 * AI Subtitle Translation & Correction using OpenRouter
 * Accurately translates subtitle text while preserving exact SRT/VTT timing lines (00:00:00.000 --> 00:00:00.000)
 */
export async function translateSubtitlesAi(vttText, targetLang = 'Arabic') {
  const apiKey = getOpenRouterApiKey();
  if (!vttText || !apiKey) return vttText;

  const prompt = `You are a professional film translator. Translate the dialogue in the following subtitle file into natural, expressive Modern Standard ${targetLang} suitable for cinematic viewing.
CRITICAL RULES:
1. Preserve ALL timestamps, cue numbers, and timing blocks EXACTLY as they are (e.g. "00:01:23.456 --> 00:01:26.789" or "WEBVTT"). Do NOT alter any numbers or arrows.
2. Only translate the spoken dialogue lines.
3. Keep the output as pure valid WebVTT/SRT text without markdown code blocks, conversational comments, or explanations.`;

  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://th-505.github.io/MATV/',
        'X-Title': 'MA TV Cinema Subtitles'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: vttText.slice(0, 15000) } // Translate first batch safely
        ],
        temperature: 0.2
      }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined
    });

    if (!res.ok) return vttText;
    const json = await res.json();
    const translated = json.choices?.[0]?.message?.content?.trim();
    if (translated && (translated.includes('-->') || translated.includes('WEBVTT'))) {
      return translated;
    }
    return vttText;
  } catch (err) {
    console.warn('OpenRouter translation error:', err);
    return vttText;
  }
}

/**
 * Converts standard SRT format to WebVTT format for HTML5 video tracks
 */
export function srtToVtt(srtText) {
  if (!srtText) return '';
  let vtt = 'WEBVTT\n\n';
  // Replace comma decimal separators in timestamps with dots
  vtt += srtText
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return vtt;
}

/**
 * Creates an in-memory blob URL for a WebVTT track
 */
export function createVttBlobUrl(vttContent) {
  const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/**
 * Unified hybrid subtitle fetcher and translator
 */
export async function findAndLoadSubtitles({ imdbId, title, type = 'movie' } = {}) {
  try {
    if (!imdbId && !title) return null;
    const subs = await fetchStremioSubtitles(imdbId, type);
    if (!subs.length) return null;

    const arabicSub = subs.find(s => s.lang === 'ara' || s.lang === 'ar' || s.lang === 'arabic');
    if (arabicSub && arabicSub.url) {
      const res = await fetch(arabicSub.url);
      const text = await res.text();
      const vtt = srtToVtt(text);
      return { vtt, source: 'opensubtitles' };
    }

    // If only English or foreign subtitle exists, translate via OpenRouter AI
    const fallbackSub = subs[0];
    if (fallbackSub && fallbackSub.url) {
      const res = await fetch(fallbackSub.url);
      const text = await res.text();
      const vtt = srtToVtt(text);
      const translatedVtt = await translateSubtitlesAi(vtt, 'Arabic');
      return { vtt: translatedVtt, source: 'openrouter-ai' };
    }
    return null;
  } catch (e) {
    console.warn('findAndLoadSubtitles error:', e);
    return null;
  }
}
