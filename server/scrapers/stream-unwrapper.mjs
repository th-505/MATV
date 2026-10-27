// server/scrapers/stream-unwrapper.mjs
// مفكك المشغلات العميق والمتسلسل (Recursive Cascade Stream Resolver)
// يسأل المشغل تلو المشغل حتى يجد رابط الفيديو الفعلي (.m3u8 / .mp4) الخالي من الإعلانات ومنع أطر الـ iframe نهائياً
import * as cheerio from 'cheerio';
import { generateAntiBanHeaders } from './anti-ban.mjs';
import { fetchSafeResponse, assertSafeScraperUrl } from './shared/http.mjs';

export async function fetchEmbedResponse(url, options = {}) {
  const result = await fetchSafeResponse(url, {timeoutMs:6500, maxRetries:0, maxRedirects:3, ...options, allowHttp:false});
  return {...result, text:async()=>result.html};
}

const STREAM_REGEX_LIST = [
  /["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/gi,
  /["'](https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/gi,
  /file\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /sources\s*:\s*\[\s*\{[^}]*?(?:file|src)\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /<source[^>]+src=["'](https?:\/\/[^"'\s]+(?:\.mp4|\.m3u8)[^"'\s]*)["']/gi,
  /hlsUrl\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /videoUrl\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi
];

// 1. فك ضغط كود JavaScript المعالج بـ Dean Edwards Packer: eval(function(p,a,c,k,e,d)...)
export function unpackDeanEdwards(packedHtml = '') {
  if (typeof packedHtml !== 'string' || packedHtml.length > 1024 * 1024) return '';
  const unpackedBlocks = [];
  const deadlineMs = Date.now() + 100;
  const regex = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let match;

  while ((match = regex.exec(packedHtml)) !== null) {
    if (Date.now() > deadlineMs) break;
    try {
      let [_, p, aStr, cStr, kStr] = match;
      const a = parseInt(aStr, 10);
      let c = parseInt(cStr, 10);
      if (a < 2 || a > 62 || !Number.isSafeInteger(c) || c > 4096 || p.length > 100000 || kStr.length > 100000 || unpackedBlocks.length >= 20) continue;
      const k = kStr.split('|');

      const encodeBase = (num) => {
        return (num < a ? '' : encodeBase(Math.floor(num / a))) +
          ((num = num % a) > 35 ? String.fromCharCode(num + 29) : num.toString(36));
      };

      while (c--) {
        if (p.length > 1024 * 1024 || Date.now() > deadlineMs) break;
        if (k[c]) {
          const token = encodeBase(c);
          p = p.replace(new RegExp(`\\b${token}\\b`, 'g'), () => k[c]);
        }
      }
      unpackedBlocks.push(p);
    } catch (_) {}
  }
  return unpackedBlocks.join('\n');
}

// 2. فك روابط الجسور المشفرة بـ Base64 أو URL Encoded (مثل play.php?url=aHR0c... أو ?Key=aHR0c...)
export function unwrapBase64BridgeUrl(rawUrl = '') {
  try {
    if (!rawUrl || !rawUrl.startsWith('http')) return rawUrl;
    const parsed = new URL(rawUrl);
    for (const param of ['url', 'id', 'Key', 'key', 'link', 'v', 'embed', 'source', 'play', 'src', 'to', 'target']) {
      const val = parsed.searchParams.get(param);
      if (val) {
        if (/^[A-Za-z0-9+/=_-]{16,}$/.test(val)) {
          try {
            const normalizedB64 = val.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(normalizedB64, 'base64').toString('utf8').trim();
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
              return decoded;
            }
          } catch (_) {}
        }
        if (val.startsWith('http://') || val.startsWith('https://')) {
          return val;
        }
      }
    }
  } catch (_) {}
  return rawUrl;
}

// 3. التحقق من أن الرابط هو تدفق فيديو حقيقي (.m3u8 أو .mp4) وليس ملف أصول أو إعلانات
export function isValidDirectMediaUrl(url = '') {
  if (!url || typeof url !== 'string') return false;
  try { assertSafeScraperUrl(url,{allowHttp:false}); } catch { return false; }
  const lower = url.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.svg') || lower.endsWith('.js') || lower.endsWith('.css') || lower.endsWith('.vtt')) {
    return false;
  }
  if (/googleads|doubleclick|popads|adsterra|exoclick|juicyads|disqus|facebook|analytics/i.test(lower)) {
    return false;
  }
  return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('/hls/') || lower.includes('master.txt');
}

// 4. استخراج روابط .m3u8 و .mp4 من نص HTML أو كود مفكوك
export function extractRawStreamsFromText(text = '', refererUrl = '') {
  const found = new Map();
  const unpacked = unpackDeanEdwards(text);
  const combinedText = `${text}\n${unpacked}`;

  for (const rgx of STREAM_REGEX_LIST) {
    rgx.lastIndex = 0;
    let m;
    while ((m = rgx.exec(combinedText)) !== null) {
      const rawUrl = m[1].replace(/\\+/g, '');
      if (isValidDirectMediaUrl(rawUrl) && !found.has(rawUrl)) {
        const streamType = rawUrl.toLowerCase().includes('.m3u8') || rawUrl.toLowerCase().includes('/hls/') ? 'm3u8' : 'mp4';
        const qualityMatch = rawUrl.match(/(2160p|1440p|1080p|720p|480p|360p|4k)/i);
        found.set(rawUrl, {
          url: rawUrl,
          streamType,
          quality: qualityMatch ? qualityMatch[1].toUpperCase() : (streamType === 'm3u8' ? 'AUTO-HLS' : 'HD'),
          headers: generateAntiBanHeaders(refererUrl || rawUrl)
        });
      }
    }
  }
  return Array.from(found.values());
}

// 5. معالجات خاصة لمستضيفات الفيديو الأكثر شيوعاً
async function extractSpecialHostStreams(embedUrl, parentReferer) {
  const lower = embedUrl.toLowerCase();

  // أ) مشغل Ok.ru (استخراج HLS و MP4 من JSON data-options)
  if (lower.includes('ok.ru/videoembed')) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const optsMatch = html.match(/data-options="([^"]+)"/);
      if (optsMatch) {
        const unescaped = optsMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const opts = JSON.parse(unescaped);
        const metadata = JSON.parse(opts?.flashvars?.metadata || '{}');
        const results = [];
        if (metadata.hlsManifestUrl) {
          results.push({ url: metadata.hlsManifestUrl, streamType: 'm3u8', quality: 'AUTO-HLS', headers: generateAntiBanHeaders(embedUrl) });
        }
        if (Array.isArray(metadata.videos)) {
          for (const v of metadata.videos) {
            if (v.url) results.push({ url: v.url, streamType: 'mp4', quality: (v.name || '').toUpperCase(), headers: generateAntiBanHeaders(embedUrl) });
          }
        }
        return results;
      }
    } catch (_) {}
  }

  // ب) مشغل DoodStream / Dooood / Ds2play
  if (/dood|d000d|ds2play|doods/i.test(lower)) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const passMatch = html.match(/\$\.get\(['"](\/pass_md5\/[^'"]+)['"]/);
      if (passMatch) {
        const origin = new URL(embedUrl).origin;
        const passUrl = `${origin}${passMatch[1]}`;
        const passRes = await fetchEmbedResponse(passUrl, {
          headers: { ...generateAntiBanHeaders(embedUrl), Referer: embedUrl },
          signal: AbortSignal.timeout(6000)
        });
        if (passRes.ok) {
          const baseStream = await passRes.text();
          const randomToken = Math.random().toString(36).substring(2, 12);
          const directMp4 = `${baseStream}${randomToken}?token=${passMatch[1].split('/').pop()}&expiry=${Date.now()}`;
          return [{ url: directMp4, streamType: 'mp4', quality: null, headers: { ...generateAntiBanHeaders(embedUrl), Referer: `${origin}/` } }];
        }
      }
    } catch (_) {}
  }

  // ج) مشغل Sibnet (شائع في الأنمي)
  if (lower.includes('sibnet.ru')) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const m = html.match(/player\.src\(\[\{src:\s*["']([^"']+)["']/);
      if (m) {
        const fullUrl = m[1].startsWith('http') ? m[1] : `https://video.sibnet.ru${m[1]}`;
        return [{ url: fullUrl, streamType: 'mp4', quality: null, headers: { ...generateAntiBanHeaders(embedUrl), Referer: embedUrl } }];
      }
    } catch (_) {}
  }

  // د) مشغل Vidmoly
  if (lower.includes('vidmoly')) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const m = html.match(/file\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/i);
      if (m) {
        return [{ url: m[1], streamType: 'm3u8', quality: 'AUTO-HLS', headers: { ...generateAntiBanHeaders(embedUrl), Referer: 'https://vidmoly.to/' } }];
      }
    } catch (_) {}
  }

  // هـ) مشغل Uqload
  if (lower.includes('uqload')) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const m = html.match(/sources\s*:\s*\[\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
      if (m) {
        return [{ url: m[1], streamType: 'mp4', quality: null, headers: { ...generateAntiBanHeaders(embedUrl), Referer: 'https://uqload.com/' } }];
      }
    } catch (_) {}
  }

  // و) مشغل Streamwish / Awish / Flaswish
  if (/streamwish|awish|flaswish|embedwish|strwish/i.test(lower)) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const unpacked = unpackDeanEdwards(html);
      const m = `${html}\n${unpacked}`.match(/["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/i);
      if (m) {
        return [{ url: m[1], streamType: 'm3u8', quality: 'AUTO-HLS', headers: generateAntiBanHeaders(embedUrl) }];
      }
    } catch (_) {}
  }

  // ز) مشغل Filemoon / Moonplayer
  if (/filemoon|moonplayer/i.test(lower)) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const unpacked = unpackDeanEdwards(html);
      const m = `${html}\n${unpacked}`.match(/["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/i);
      if (m) {
        return [{ url: m[1], streamType: 'm3u8', quality: 'AUTO-HLS', headers: generateAntiBanHeaders(embedUrl) }];
      }
    } catch (_) {}
  }

  // ح) مشغل Mixdrop
  if (lower.includes('mixdrop')) {
    try {
      const res = await fetchEmbedResponse(embedUrl, { headers: generateAntiBanHeaders(parentReferer), signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const html = await res.text();
      const unpacked = unpackDeanEdwards(html);
      const m = `${html}\n${unpacked}`.match(/MDCore\.wurl\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/i);
      if (m) {
        const streamUrl = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
        return [{ url: streamUrl, streamType: 'mp4', quality: null, headers: generateAntiBanHeaders(embedUrl) }];
      }
    } catch (_) {}
  }

  return [];
}

// 6. استخراج مرشحي المشغلات الفرعية (Child Embed Players) من صفحة HTML للسؤال المتسلسل
function extractChildPlayerCandidates(html = '', currentUrl = '') {
  const candidates = [];
  const origin = currentUrl.startsWith('http') ? new URL(currentUrl).origin : '';

  try {
    const $ = cheerio.load(html);

    // أ) وسوم الـ iframe و data-attributes
    $('iframe[src], iframe[data-src], iframe[data-lazy-src], [data-embed], [data-url], [data-src], [data-link]').each((_, el) => {
      const raw = $(el).attr('data-embed') || $(el).attr('data-url') || $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-lazy-src') || '';
      if (raw) {
        let u = unwrapBase64BridgeUrl(raw.trim());
        if (u.startsWith('//')) u = 'https:' + u;
        else if (u.startsWith('/') && origin) u = origin + u;
        if (u.startsWith('http') && u !== currentUrl && !candidates.includes(u)) {
          candidates.push(u);
        }
      }
    });

    // ب) روابط التشغيل أو التحميل أو المشاهدة في الأزرار
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (/watch|embed|player|play|video|stream|download/i.test(href)) {
        let u = unwrapBase64BridgeUrl(href.trim());
        if (u.startsWith('//')) u = 'https:' + u;
        else if (u.startsWith('/') && origin) u = origin + u;
        if (u.startsWith('http') && u !== currentUrl && !candidates.includes(u)) {
          candidates.push(u);
        }
      }
    });

    // ج) متغيرات جافا سكريبت وروابط التحويل
    const scriptMatches = html.match(/['"](https?:\/\/[^"'\s<>]+\/(?:embed|player|e|watch|play|v)\/[^"'\s<>]+)['"]/gi) || [];
    for (const m of scriptMatches) {
      const clean = m.slice(1, -1);
      if (clean !== currentUrl && !candidates.includes(clean)) {
        candidates.push(clean);
      }
    }

    // د) سلاسل Base64 في السكربتات التي تشفر روابط مشغلات
    const b64Matches = html.match(/['"]([A-Za-z0-9+/=]{28,})['"]/g) || [];
    for (const b of b64Matches) {
      const tok = b.slice(1, -1);
      try {
        const dec = Buffer.from(tok, 'base64').toString('utf8').trim();
        if (dec.startsWith('http://') || dec.startsWith('https://')) {
          if (!candidates.includes(dec)) candidates.push(dec);
        }
      } catch (_) {}
    }
  } catch (_) {}

  return candidates.slice(0, 8); // فحص أول 8 مرشحين لسرعة الأداء
}

// 7. محرك الاستعلام المتسلسل العنقودي (Recursive Cascade Stream Resolver)
// يسأل المشغل الحالي، وإن كان جسراً يسأل المشغل الداخلي حتى يجد البث الفعلي
export async function cascadeResolveStream(rawUrl, parentReferer = '', depth = 0, visited = new Set(), deadlineMs = Date.now() + 20000) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('http')) return [];
  if (Date.now() > deadlineMs || visited.size >= 16 || rawUrl.length > 4096) return [];
  if (depth > 4) return []; // حد العمق الأقصى لمنع الحلقات اللانهائية
  if (visited.has(rawUrl)) return [];
  visited.add(rawUrl);

  const targetUrl = unwrapBase64BridgeUrl(rawUrl);
  try { assertSafeScraperUrl(targetUrl,{allowHttp:false}); } catch { return []; }

  // أ) إن كان الرابط هو نفسه تدفق مباشر
  if (isValidDirectMediaUrl(targetUrl)) {
    const streamType = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('/hls/') ? 'm3u8' : 'mp4';
    return [{
      url: targetUrl,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'HD',
      headers: generateAntiBanHeaders(parentReferer || targetUrl)
    }];
  }

  // ب) فحص المشغلات الخاصة المعروفة (Ok.ru, Sibnet, Dood, Vidmoly, إلخ)
  try {
    const special = await extractSpecialHostStreams(targetUrl, parentReferer);
    if (special.length > 0) return special.filter(s=>{try{assertSafeScraperUrl(s.url,{allowHttp:false});return true}catch{return false}});
  } catch (_) {}

  // ج) جلب صفحة المشغل لاستخراج البث أو العثور على المشغل الداخلي التالي
  try {
    const res = await fetchEmbedResponse(targetUrl, {
      headers: {
        ...generateAntiBanHeaders(targetUrl),
        Referer: parentReferer || new URL(targetUrl).origin + '/'
      },
      signal: AbortSignal.timeout(6500)
    });

    if (!res.ok) return [];
    const html = await res.text();

    // 1. فحص مباشر للتدفقات داخل النص وكود Packer المفكوك
    const directStreams = extractRawStreamsFromText(html, targetUrl);
    if (directStreams.length > 0) {
      return directStreams;
    }

    // 2. إذا لم يجد تدفقاً مباشراً: يسأل المشغلات الفرعية تلو الأخرى (Cascade)
    if (depth < 3) {
      const childCandidates = extractChildPlayerCandidates(html, targetUrl);
      for (const childUrl of childCandidates) {
        if (!visited.has(childUrl)) {
          const childStreams = await cascadeResolveStream(childUrl, targetUrl, depth + 1, visited, deadlineMs);
          if (childStreams.length > 0) {
            return childStreams; // عثر على البث العامل، نرجعه فوراً
          }
        }
      }
    }
  } catch (_) {}

  return [];
}

// 8. الدالة الرئيسية المصدرة لبقية القواشط في المنظومة
export async function unwrapEmbedToDirectStreams(rawCandidateUrl, parentReferer = '') {
  return cascadeResolveStream(rawCandidateUrl, parentReferer, 0, new Set());
}
