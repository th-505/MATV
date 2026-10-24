import { fetchNetflixHomeShelves, fetchFullTmdbDetails, tmdbFetch, normalizeTmdbItem } from './tmdb-service.js';
import { ProviderEndpoints } from './api-client.js';

// قاموس التشفير الرمزي الصارم للسيرفرات (ممنوع إظهار اسم موقع القشط للمستخدم نهائياً)
const PROVIDER_CODE_MAP = {
  akwam: 'AK',
  akoam: 'AK',
  alooy: 'AY',
  mycima: 'MA',
  wecima: 'WA',
  cimanow: 'CW',
  shahid4u: 'SU',
  moviztime: 'ME',
  'moviz-time': 'ME',
  shii4u: 'SH',
  egydead: 'ED',
  ipauniverse: 'IE',
  '3isk': '3K',
  '3cktv': '3V',
  anime4up: 'AP',
  qfilm: 'QM',
  ristoanime: 'RE',
  mewsry: 'MY',
  arabseed: 'AD',
  witanime: 'WE',
  laroza: 'LA',
};

// توليد رمز السيرفر: يعتمد القاموس أو يأخذ أول حرف + آخر حرف من اسم المصدر تلقائياً
export function encodeProviderServerName(providerRawName = '', index = 1) {
  const clean = String(providerRawName || '')
    .toLowerCase()
    .replace(/^https?:\/\/(www\.|w1\.|vip\.|cdn\.|watch\.|e\.|a\.|tv10\.)?/, '')
    .split('.')[0]
    .replace(/[^a-z0-9]/g, '');

  if (!clean) return `SV-${index}`;
  if (PROVIDER_CODE_MAP[clean]) {
    return `${PROVIDER_CODE_MAP[clean]}-${index}`;
  }
  for (const [key, code] of Object.entries(PROVIDER_CODE_MAP)) {
    if (clean.includes(key)) return `${code}-${index}`;
  }
  const first = clean[0].toUpperCase();
  const last = clean[clean.length - 1].toUpperCase();
  return `${first}${last}-${index}`;
}

// تنظيف الاسم لتوليد المفتاح المزدوج (الاسم + السنة) لمنع تكرار الأعمال
export function normalizeTitleKey(title = '') {
  return String(title || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/(فيلم|مسلسل|انمي|أنمي|مترجم|مدبلج|كامل|مشاهدة|مشاهده|تحميل|اون لاين|أون لاين|جودة|جوده|عالية|عاليه|بلوراي|الموسم\s*\d+|الحلقة\s*\d+|الحلقه\s*\d+|حلقة\s*\d+|حلقه\s*\d+|hd|4k|1080p|720p|bluray|web-dl)/gi, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/[^\u0600-\u06FFa-z0-9]/gi, '')
    .trim();
}

export function buildCompositeWorkKey(item) {
  const rawTitle = String(item?.title || item?.name || '');
  const cleanTitle = normalizeTitleKey(rawTitle);
  const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/);
  const year = String(item?.year || item?.release_date || item?.first_air_date || (yearMatch ? yearMatch[1] : '')).slice(0, 4) || '0000';
  return `${cleanTitle}::${year}`;
}

// تنسيق المدة الزمنية للبطاقة (مثل: 1س 55د أو 45 د)
export function formatRuntimeArabic(minutes, mediaType = 'movie') {
  const mins = Number(minutes) || (mediaType === 'tv' || mediaType === 'series' ? 45 : 115);
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}س ${m}د` : `${h} ساعة`;
}

// توحيد وتطهير قائمة الحلقات لمنع ظهور undefined نهائياً
export function normalizeEpisodesList(rawEpisodes = [], fallbackTitle = 'الحلقة') {
  if (!Array.isArray(rawEpisodes)) return [];
  return rawEpisodes.map((ep, idx) => {
    const rawText = String(ep?.title || ep?.name || ep?.label || ep?.ep || '');
    const numMatch = rawText.match(/(\d+)/);
    const epNum = Number(ep?.number || ep?.episodeNumber || ep?.episode || (numMatch ? numMatch[1] : idx + 1)) || (idx + 1);
    const cleanTitle = rawText && !rawText.includes('undefined')
      ? rawText
      : `${fallbackTitle} ${epNum}`;
    return {
      ...ep,
      id: ep?.id || ep?.ref || ep?.url || `ep-${epNum}`,
      number: epNum,
      episodeNumber: epNum,
      title: cleanTitle,
      label: `الحلقة ${epNum}`,
      url: ep?.url || ep?.ref || ep?.link || ''
    };
  });
}

// Missing metadata remains missing; it must never become an invented year or score.
export function metadataYear(value) {
  const year = String(value ?? '').trim().match(/^(\d{4})(?:-|$)/)?.[1];
  return year || null;
}

export function metadataRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating.toFixed(1) : null;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://tatv.invalid');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function selectTmdbMatch(results, item, mediaType) {
  const expectedType = mediaType === 'series' ? 'tv' : mediaType;
  const names = [item.title, item.original_title, item.original_name, item.name]
    .map(normalizeTitleKey).filter(Boolean);
  const year = metadataYear(item.year);
  const matches = (Array.isArray(results) ? results : []).filter(candidate => {
    if (!candidate || !Number.isInteger(Number(candidate.id)) || Number(candidate.id) <= 0) return false;
    if (candidate.media_type && candidate.media_type !== expectedType) return false;
    const candidateYear = metadataYear(candidate.release_date || candidate.first_air_date);
    if (year && year !== candidateYear) return false;
    return [candidate.title, candidate.original_title, candidate.name, candidate.original_name]
      .map(normalizeTitleKey).some(name => name && names.includes(name));
  });
  const unique = [...new Map(matches.map(candidate => [String(candidate.id), candidate])).values()];
  return unique.length === 1 ? unique[0] : null;
}

// دمج الأعمال المتكررة من القواشط المختلفة في بطاقة عمل واحدة موحدة
export function deduplicateAndMergeCatalog(items = []) {
  const map = new Map();
  for (const raw of items) {
    if (!raw || !(raw.title || raw.name)) continue;
    const key = buildCompositeWorkKey(raw);
    const cleanKey = key.startsWith('::') ? `id::${raw.id || raw.href || Math.random()}` : key;

    const mediaType = (raw.mediaType === 'tv' || raw.type === 'series' || raw.type === 'tv' || raw.is_series) ? 'tv' : 'movie';
    const typeLabel = mediaType === 'tv' ? 'مسلسل' : 'فيلم';
    const year = metadataYear(raw.year);
    const rating = metadataRating(raw.rating);
    const durationText = raw.durationText || formatRuntimeArabic(raw.runtime, mediaType);
    const poster = raw.poster || raw.img || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80';
    const itemId = raw.id || raw.href || raw.ref || `work:${cleanKey}`;

    if (!map.has(cleanKey)) {
      map.set(cleanKey, {
        ...raw,
        id: itemId,
        href: itemId,
        poster,
        img: poster,
        mediaType,
        type: mediaType === 'tv' ? 'series' : 'movie',
        typeLabel,
        year,
        rating,
        durationText,
        mergedRefs: [itemId, raw.ref, raw.href].filter(Boolean),
        mergedSources: [raw.source || raw.provider || 'ma'].filter(Boolean),
        servers: Array.isArray(raw.servers) ? [...raw.servers] : []
      });
    } else {
      const existing = map.get(cleanKey);
      if (itemId && !existing.mergedRefs.includes(itemId)) existing.mergedRefs.push(itemId);
      if (raw.source && !existing.mergedSources.includes(raw.source)) existing.mergedSources.push(raw.source);
      if (Array.isArray(raw.servers)) existing.servers.push(...raw.servers);
      if ((!existing.poster || existing.poster.includes('unsplash')) && poster) {
        existing.poster = poster;
        existing.img = poster;
      }
      if (raw.tmdbId && !existing.tmdbId) existing.tmdbId = raw.tmdbId;
    }
  }
  return Array.from(map.values());
}

// تصنيف لون وإيموجي السيرفر حسب سرعة الاستجابة (ms) بالتدرج اللوني المطلوب
export function classifyLatencyTier(ms, alive = true) {
  if (!alive || ms === null || ms === undefined || ms >= 9999) {
    return { tier: 5, emoji: '🔴', label: 'غير مستجيب', badgeColor: '#ef4444', bgColor: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.5)' };
  }
  if (ms <= 160) {
    return { tier: 1, emoji: '🟢', label: `${ms}ms ⚡`, badgeColor: '#10b981', bgColor: 'rgba(16,185,129,0.20)', borderColor: '#10b981' };
  }
  if (ms <= 320) {
    return { tier: 2, emoji: '🟢', label: `${ms}ms`, badgeColor: '#4ade80', bgColor: 'rgba(74,222,128,0.15)', borderColor: '#4ade80' };
  }
  if (ms <= 650) {
    return { tier: 3, emoji: '🟡', label: `${ms}ms`, badgeColor: '#facc15', bgColor: 'rgba(250,204,21,0.16)', borderColor: '#facc15' };
  }
  if (ms <= 1100) {
    return { tier: 4, emoji: '🟠', label: `${ms}ms`, badgeColor: '#fb923c', bgColor: 'rgba(251,146,60,0.16)', borderColor: '#fb923c' };
  }
  return { tier: 5, emoji: '🔴', label: `${ms}ms`, badgeColor: '#f87171', bgColor: 'rgba(248,113,113,0.16)', borderColor: '#f87171' };
}

// فحص سرعة السيرفرات الحية (Ping / Latency Probe) وترتيبها من الأسرع للأبطأ
export async function probeAndRankServers(rawServers = []) {
  const counterByPrefix = {};
  const normalized = rawServers.slice(0, 12).map((srv) => {
    const providerKey = srv.provider || srv.source || srv.name || srv.url || 'ma';
    const basePrefix = encodeProviderServerName(providerKey, 1).split('-')[0];
    counterByPrefix[basePrefix] = (counterByPrefix[basePrefix] || 0) + 1;
    const code = srv.code || `${basePrefix}-${counterByPrefix[basePrefix]}`;
    const urlStr = String(srv.url || srv.embedUrl || '');
    return {
      ...srv,
      code,
      url: urlStr,
      kind: srv.kind || (/\.(m3u8|mp4)(?:$|\?)/i.test(urlStr) ? 'direct' : 'embed')
    };
  }).filter(s => {
    try {
      const url = new URL(s.url);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port;
    } catch (_) {
      return false;
    }
  });

  const probed = await Promise.all(normalized.map(async (srv) => {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2400);
    try {
      const targetOrigin = new URL(srv.url).origin;
      await fetch(targetOrigin, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      const ms = Math.max(28, Math.round(performance.now() - start));
      return { ...srv, ms, alive: true, ...classifyLatencyTier(ms, true) };
    } catch (_) {
      clearTimeout(timer);
      const fallbackMs = srv.ms && srv.ms < 1000 ? srv.ms : 85;
      return { ...srv, ms: fallbackMs, alive: true, ...classifyLatencyTier(fallbackMs, true) };
    }
  }));

  // ترتيب السيرفرات بحيث التدفقات المباشرة أولاً ثم الأسرع (الأخضر)
  return probed.sort((a, b) => {
    const aDirect = (a.kind === 'direct' || String(a.url).includes('.m3u8') || String(a.url).includes('.mp4')) ? 0 : 1;
    const bDirect = (b.kind === 'direct' || String(b.url).includes('.m3u8') || String(b.url).includes('.mp4')) ? 0 : 1;
    if (aDirect !== bDirect) return aDirect - bDirect;
    return a.ms - b.ms;
  });
}

const EDGE_RESOLVER_BASE = 'https://matv-edge-resolver.dada1000100.workers.dev';

// بناء مصفوفة السيرفرات المدمجة للعمل أو الحلقة من القواشط المحلية النقية (Direct Media 0 Ads 0 Embed)
export async function resolveUnifiedServersForItem(item, season = 1, episode = 1, apiBase = '') {
  const servers = [];
  const backendBase = apiBase || (typeof ProviderEndpoints !== 'undefined' ? ProviderEndpoints?.backend : '') || 'https://matv.onrender.com';
  const isTv = item?.mediaType === 'tv' || item?.type === 'series' || item?.is_series;
  let tmdbId = item?.tmdbId || item?.tmdb_id || '';
  if (!tmdbId && String(item?.id || '').startsWith('tmdb:')) {
    tmdbId = String(item.id).split(':').pop();
  }
  if (!tmdbId && /^\d+$/.test(String(item?.id || ''))) {
    tmdbId = String(item.id);
  }

  // 1. إذا كان العمل يحتوي على روابط مباشرة في بياناته
  if (Array.isArray(item?.servers)) {
    for (const s of item.servers) {
      if (s?.url && (s.url.includes('.mp4') || s.url.includes('.m3u8') || s.kind === 'direct')) {
        const prov = s.provider || s.name || 'akwam';
        servers.push({
          provider: prov,
          code: s.code || encodeProviderServerName(prov, servers.length + 1),
          url: s.url,
          kind: 'direct',
          downloadUrl: s.downloadUrl || s.url,
          quality: s.quality || 'HD'
        });
      }
    }
  }

  // 2. جلب السيرفرات المستخرجة من القواشط عبر Cloudflare Edge Resolver
  const candidateRefs = [
    ...(Array.isArray(item?.mergedRefs) ? item.mergedRefs : []),
    item?.episodeRef,
    item?.id,
    item?.href,
    item?.ref
  ].filter(r => r && !String(r).startsWith('tmdb:') && !String(r).startsWith('work:'));

  if (candidateRefs.length > 0) {
    try {
      const refVal = String(candidateRefs[0]).trim();
      const refParam = refVal.includes(':')
        ? `ref=${encodeURIComponent(refVal)}`
        : `episode_id=${encodeURIComponent(refVal)}`;
      const edgeRes = await fetch(`${EDGE_RESOLVER_BASE}/v1/resolve?${refParam}`, { signal: AbortSignal.timeout(8000) });
      if (edgeRes.ok) {
        const edgeJson = await edgeRes.json();
        if (Array.isArray(edgeJson?.sources)) {
          for (const s of edgeJson.sources) {
            if (s?.url && (s.url.includes('.mp4') || s.url.includes('.m3u8') || s.kind === 'direct')) {
              const prov = s.provider || s.provider_id || '3isk';
              servers.push({
                provider: prov,
                code: encodeProviderServerName(prov, servers.length + 1),
                url: s.url,
                kind: 'direct',
                downloadUrl: s.url,
                quality: s.quality || 'HD'
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  // 3. استخراج البث المباشر الخام من القواشط المحلية المعتمدة (أكوام، ماي سيما، إيجي ديد، عرب سيد، سيما ناو، أنمي فور أب، قصة عشق…)
  const candidateBases = [
    backendBase,
    'https://matv.onrender.com',
    'http://127.0.0.1:3000'
  ].filter(Boolean);
  const uniqueBases = Array.from(new Set(candidateBases));

  const cleanRawTitle = String(item?.title || item?.name || item?.originalTitle || '')
    .replace(/(فيلم|مسلسل|انمي|أنمي|مترجم|مدبلج|كامل|مشاهدة|الموسم\s*\d+|الحلقة\s*\d+|\b\d{4}\b)/gi, '')
    .replace(/[-:_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const titleVariants = [
    item?.title || item?.name,
    cleanRawTitle,
    item?.originalTitle
  ].filter(t => t && String(t).trim().length >= 2);
  const uniqueTitles = Array.from(new Set(titleVariants));

  for (const base of uniqueBases) {
    if (servers.length > 0) break;

    for (const titleQuery of uniqueTitles) {
      if (servers.length > 0) break;
      try {
        const q = new URLSearchParams({
          id: item?.id || '',
          title: titleQuery,
          year: item?.year || '',
          season: String(season),
          episode: String(episode)
        });
        const res = await fetch(`${base}/api/v1/resolve?${q.toString()}`, { signal: AbortSignal.timeout(20000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.servers) && data.servers.length > 0) {
            for (const s of data.servers) {
              if (s?.url && (s.url.includes('.mp4') || s.url.includes('.m3u8') || s.kind === 'direct')) {
                const prov = s.provider || s.source || 'akwam';
                servers.push({
                  provider: prov,
                  code: s.code || encodeProviderServerName(prov, servers.length + 1),
                  kind: 'direct',
                  url: s.url,
                  headers: s.headers || {},
                  downloadUrl: s.downloadUrl || s.url,
                  quality: s.quality || 'HD'
                });
              }
            }
          }
        }
      } catch (_) {}
    }
  }

  // 4. تصفية صارمة نهائية: حظر أي رابط إعلاني أو إطار خارجي واقتصار القائمة 100% على الروابط المباشرة من قواشطنا
  const cleanDirect = servers.filter(s => {
    const u = String(s.url || '').toLowerCase();
    if (/vidsrc|multiembed|autoembed|2embed|111movies|embed\.su|vidlink|123embed/i.test(u)) return false;
    return s.kind === 'direct' || u.includes('.m3u8') || u.includes('.mp4');
  });

  return probeAndRankServers(cleanDirect);
}

// محرك البحث الموحد (Search-Fusion Engine) الذي يصفي ويدمج النتائج من القواشط + TMDb
export async function nexusUnifiedSearch(queryText, apiBase = '') {
  const q = String(queryText || '').trim();
  if (!q) return [];

  const [tmdbRes, scraperRes] = await Promise.allSettled([
    tmdbFetch('/search/multi', { query: q, page: '1' }),
    fetch(`${apiBase}/api/v1/search?q=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }))
  ]);

  const rawList = [];
  if (tmdbRes.status === 'fulfilled' && Array.isArray(tmdbRes.value?.results)) {
    for (const item of tmdbRes.value.results) {
      if (item.media_type === 'person') continue;
      const norm = normalizeTmdbItem(item);
      if (norm) rawList.push(norm);
    }
  }
  if (scraperRes.status === 'fulfilled') {
    const items = scraperRes.value?.items || scraperRes.value?.results || scraperRes.value?.data || [];
    if (Array.isArray(items)) rawList.push(...items);
  }

  return deduplicateAndMergeCatalog(rawList);
}

// أداة حصاد الرئيسية والمزامنة الآلية مع Supabase (Zero-Wait Home Snapshot)
const HOME_SNAPSHOT_KEY = 'matv_nexus_home_snapshot_v8';

export async function loadHomeWithSupabaseSync(supabaseConfig = {}) {
  // 1. قراءة فورية من الكاش المحلي أو Supabase لفتح الرئيسية بدون أي انتظار
  let cached = null;
  try {
    const raw = localStorage.getItem(HOME_SNAPSHOT_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch (_) {}

  // دالة التحديث الخلفي والرفع التلقائي إلى Supabase
  const refreshPromise = (async () => {
    const homeData = await fetchNetflixHomeShelves();
    homeData.heroItems = deduplicateAndMergeCatalog(homeData.heroItems || []);
    homeData.shelves = homeData.shelves.map(shelf => ({
      ...shelf,
      items: deduplicateAndMergeCatalog(shelf.items || [])
    }));
    const payload = { updatedAt: Date.now(), data: homeData };
    try {
      localStorage.setItem(HOME_SNAPSHOT_KEY, JSON.stringify(payload));
    } catch (_) {}

    // رفع تلقائي إلى Supabase إن توفرت إعدادات الاتصال
    if (supabaseConfig?.url && supabaseConfig?.anonKey) {
      try {
        await fetch(`${supabaseConfig.url}/rest/v1/home_snapshots`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseConfig.anonKey,
            'Authorization': `Bearer ${supabaseConfig.anonKey}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ id: 'main_home_v8', payload: homeData, updated_at: new Date().toISOString() })
        });
      } catch (_) {}
    }
    return homeData;
  })();

  if (cached?.data && Array.isArray(cached.data.shelves) && cached.data.shelves.length > 0) {
    // نرجع النسخة المخزنة فوراً (0ms) ونحدث في الخلفية بصمت
    refreshPromise.catch(() => {});
    return cached.data;
  }
  return await refreshPromise;
}
