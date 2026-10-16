// server/scrapers/stream-unwrapper.mjs
// مفكك المشغلات العميق — يمنع الـ Iframe نهائياً ويستخرج روابط .m3u8 و .mp4 الخام فقط
import { generateAntiBanHeaders } from './anti-ban.mjs';

const STREAM_REGEX_LIST = [
  /["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/gi,
  /["'](https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/gi,
  /file\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /sources\s*:\s*\[\s*\{[^}]*?(?:file|src)\s*:\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /<source[^>]+src=["'](https?:\/\/[^"'\s]+(?:\.mp4|\.m3u8)[^"'\s]*)["']/gi
];

// 1. فك ضغط كود JavaScript المعالج بـ Dean Edwards Packer: eval(function(p,a,c,k,e,d)...)
export function unpackDeanEdwards(packedHtml = '') {
  const unpackedBlocks = [];
  const regex = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let match;

  while ((match = regex.exec(packedHtml)) !== null) {
    try {
      let [_, p, aStr, cStr, kStr] = match;
      const a = parseInt(aStr, 10);
      let c = parseInt(cStr, 10);
      const k = kStr.split('|');

      const encodeBase = (num) => {
        return (num < a ? '' : encodeBase(Math.floor(num / a))) +
          ((num = num % a) > 35 ? String.fromCharCode(num + 29) : num.toString(36));
      };

      while (c--) {
        if (k[c]) {
          const token = encodeBase(c);
          p = p.replace(new RegExp(`\\b${token}\\b`, 'g'), k[c]);
        }
      }
      unpackedBlocks.push(p);
    } catch (_) {}
  }
  return unpackedBlocks.join('\n');
}

// 2. فك روابط الجسور المشفرة بـ Base64 (مثل play.php?url=aHR0c... أو ?Key=aHR0c...)
export function unwrapBase64BridgeUrl(rawUrl = '') {
  try {
    const parsed = new URL(rawUrl);
    for (const param of ['url', 'id', 'Key', 'key', 'link', 'v', 'embed']) {
      const val = parsed.searchParams.get(param);
      if (val && /^[A-Za-z0-9+/=_-]{16,}$/.test(val)) {
        const decoded = Buffer.from(val, 'base64').toString('utf8').trim();
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      }
    }
  } catch (_) {}
  return rawUrl;
}

// 3. التحقق من أن الرابط هو تدفق فيديو حقيقي (.m3u8 أو .mp4) وليس صورة أو إعلان
function isValidDirectMediaUrl(url = '') {
  if (!url || !url.startsWith('http')) return false;
  const lower = url.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.svg') || lower.endsWith('.js') || lower.endsWith('.css')) {
    return false;
  }
  if (/googleads|doubleclick|popads|adsterra|exoclick|juicyads/i.test(lower)) {
    return false;
  }
  return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('/hls/') || lower.includes('master.txt');
}

// 4. استخراج روابط .m3u8 و .mp4 من نص HTML أو كود مفكوك
export function extractRawStreamsFromText(text = '', refererUrl = '') {
  const found = new Map();
  const combinedText = `${text}\n${unpackDeanEdwards(text)}`;

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

// 5. معالجات خاصة لمشغلات شهيرة (Ok.ru, Dailymotion, DoodStream, Sibnet, Uqload)
async function extractSpecialHostStreams(embedUrl, parentReferer) {
  const lower = embedUrl.toLowerCase();

  // أ) مشغل Ok.ru (يستخرج رابط الـ m3u8 وروابط الـ mp4 من JSON data-options)
  if (lower.includes('ok.ru/videoembed')) {
    const res = await fetch(embedUrl, { headers: generateAntiBanHeaders(parentReferer) });
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
          if (v.url) results.push({ url: v.url, streamType: 'mp4', quality: (v.name || 'HD').toUpperCase(), headers: generateAntiBanHeaders(embedUrl) });
        }
      }
      return results;
    }
  }

  // ب) مشغل DoodStream / Dooood (يفك مسار /pass_md5/ ويولد رابط الـ mp4 المباشر)
  if (/dood|d000d|ds2play|doods/i.test(lower)) {
    const res = await fetch(embedUrl, { headers: generateAntiBanHeaders(parentReferer) });
    if (!res.ok) return [];
    const html = await res.text();
    const passMatch = html.match(/\$\.get\(['"](\/pass_md5\/[^'"]+)['"]/);
    if (passMatch) {
      const origin = new URL(embedUrl).origin;
      const passUrl = `${origin}${passMatch[1]}`;
      const passRes = await fetch(passUrl, { headers: { ...generateAntiBanHeaders(embedUrl), Referer: embedUrl } });
      if (passRes.ok) {
        const baseStream = await passRes.text();
        const randomToken = Math.random().toString(36).substring(2, 12);
        const directMp4 = `${baseStream}${randomToken}?token=${ passMatch[1].split('/').pop() }&expiry=${Date.now()}`;
        return [{ url: directMp4, streamType: 'mp4', quality: 'HD', headers: { ...generateAntiBanHeaders(embedUrl), Referer: `${origin}/` } }];
      }
    }
  }

  // ج) مشغل Sibnet (شائع في مواقع الأنمي)
  if (lower.includes('sibnet.ru')) {
    const res = await fetch(embedUrl, { headers: generateAntiBanHeaders(parentReferer) });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/player\.src\(\[\{src:\s*["']([^"']+)["']/);
    if (m) {
      const fullUrl = m[1].startsWith('http') ? m[1] : `https://video.sibnet.ru${m[1]}`;
      return [{ url: fullUrl, streamType: 'mp4', quality: 'HD', headers: { ...generateAntiBanHeaders(embedUrl), Referer: embedUrl } }];
    }
  }

  return [];
}

// 6. الدالة الرئيسية: تدخل لأي مشغل وتستخرج روابط .m3u8 و .mp4 فقط (بدون إرجاع أي Iframe)
export async function unwrapEmbedToDirectStreams(rawCandidateUrl, parentReferer = '') {
  if (!rawCandidateUrl || !rawCandidateUrl.startsWith('http')) return [];

  // إذا كان الرابط أصلاً .m3u8 أو .mp4 مباشر نرجعه فوراً
  const initialUrl = unwrapBase64BridgeUrl(rawCandidateUrl);
  if (isValidDirectMediaUrl(initialUrl)) {
    const streamType = initialUrl.toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4';
    return [{
      url: initialUrl,
      streamType,
      quality: streamType === 'm3u8' ? 'AUTO-HLS' : 'Direct-MP4',
      headers: generateAntiBanHeaders(parentReferer || initialUrl)
    }];
  }

  try {
    // فحص المشغلات الخاصة أولاً
    const special = await extractSpecialHostStreams(initialUrl, parentReferer);
    if (special.length > 0) return special;

    // جلب صفحة المشغل مع تمرير الـ Referer الصحيح للموقع الأب
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    const res = await fetch(initialUrl, {
      headers: {
        ...generateAntiBanHeaders(initialUrl),
        Referer: parentReferer || new URL(initialUrl).origin + '/'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();

    // 1. استخراج مباشر أو عبر فك ضغط Packer
    let streams = extractRawStreamsFromText(html, initialUrl);
    if (streams.length > 0) return streams;

    // 2. إن كانت الصفحة جسر تحويل (Bridge) يحتوي على iframe داخلي لمشغل الفيديو الفعلي، ندخل لعمق واحد إضافي لاستخراج الـ m3u8/mp4 منه
    const nestedIframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (nestedIframeMatch && nestedIframeMatch[1] !== initialUrl) {
      const nestedUrl = unwrapBase64BridgeUrl(nestedIframeMatch[1]);
      const nestedRes = await fetch(nestedUrl, {
        headers: { ...generateAntiBanHeaders(nestedUrl), Referer: initialUrl },
        redirect: 'follow'
      });
      if (nestedRes.ok) {
        const nestedHtml = await nestedRes.text();
        streams = extractRawStreamsFromText(nestedHtml, nestedUrl);
      }
    }
    return streams;
  } catch (_) {
    return [];
  }
}
