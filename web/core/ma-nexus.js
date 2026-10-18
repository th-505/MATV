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
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return '';
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

// دمج الأعمال المتكررة من القواشط المختلفة في بطاقة عمل واحدة موحدة
export function deduplicateAndMergeCatalog(items = []) {
  const map = new Map();
  for (const raw of items) {
    if (!raw || !(raw.title || raw.name)) continue;
    const key = buildCompositeWorkKey(raw);
    const cleanKey = key.startsWith('::') ? `id::${raw.id || raw.href || Math.random()}` : key;

    const mediaType = (raw.mediaType === 'tv' || raw.type === 'series' || raw.type === 'tv' || raw.is_series) ? 'tv' : 'movie';
    const typeLabel = mediaType === 'tv' ? 'مسلسل' : 'فيلم';
    const year = String(raw.year || '').slice(0, 4);
    const rating = raw.rating && Number(raw.rating) > 0 ? Number(raw.rating).toFixed(1) : '';
    const durationText = raw.durationText || formatRuntimeArabic(raw.runtime, mediaType);
    const poster = raw.poster || raw.img || '';
    const itemId = raw.id || raw.href || raw.ref || `work:${cleanKey}`;

    if (!map.has(cleanKey)) {
      map.set(cleanKey, {
        ...raw,
        id: itemId,
        href: raw.href || raw.ref || itemId,
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
      const elapsed = Math.round(performance.now() - start);
      const alive = elapsed < 2350;
      const ms = alive ? elapsed : 9999;
      return { ...srv, ms, alive, ...classifyLatencyTier(ms, alive) };
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

// توليد السيرفرات السحابية الاحتياطية فائقة السرعة عند تعذر القواشط المباشرة
export function generateCloudFallbackServers(tmdbId, isTv, season = 1, episode = 1) {
  // Compatibility export: unverified third-party embedded playback is retired.
  return [];
}

export async function resolveUnifiedServersForItem(item, season = 1, episode = 1, apiBase = '') {
  const servers = [];
  const backendBase = apiBase || (typeof ProviderEndpoints !== 'undefined' ? ProviderEndpoints?.backend : '') || '';
  // إذا كان العمل يحتوي على روابط مباشرة في بياناته
  if (Array.isArray(item?.servers)) {
    for (const s of item.servers) {
      if (s?.url) servers.push({ provider: s.provider || s.name || 'akwam', code:s.code, headers:s.headers || {}, url: s.url, kind: s.kind, downloadUrl: s.downloadUrl || s.url });
    }
  }

  // 1. جلب السيرفرات المستخرجة من القواشط الـ 18 عبر Edge Worker أو السيرفر الخلفي
  const candidateRefs = [
    item?.episodeRef,
    item?.href,
    item?.ref,
    ...(Array.isArray(item?.mergedRefs) ? item.mergedRefs : []),
    item?.id
  ].filter(r => r && !String(r).startsWith('tmdb:') && !String(r).startsWith('work:'));

  if (candidateRefs.length > 0 && !servers.length) {
    try {
      const refVal = String(candidateRefs[0]).trim();
      const refParam = refVal.includes(':')
        ? `ref=${encodeURIComponent(refVal)}`
        : `episode_id=${encodeURIComponent(refVal)}`;
      const edgeRes = await fetch(`${EDGE_RESOLVER_BASE}/v1/resolve?${refParam}`);
      if (edgeRes.ok) {
        const edgeJson = await edgeRes.json();
        if (Array.isArray(edgeJson?.sources)) {
          for (const s of edgeJson.sources) {
            if (s?.url) {
              servers.push({
                provider: s.provider || s.provider_id || '3isk',
                code: s.code,
                headers: s.headers || {},
                url: s.url,
                kind: s.format === 'hls' || /\.(m3u8|mp4)(?:$|\?)/i.test(s.url) ? 'direct' : 'embed',
                downloadUrl: s.url
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  if (!servers.length) try {
    const q = new URLSearchParams({
      id: item?.id || '',
      ref: String(candidateRefs[0] || ''),
      title: item?.title || item?.name || item?.originalTitle || '',
      year: item?.year || '',
      season: String(season),
      episode: String(episode)
    });
    const candidateBases = [backendBase].filter(Boolean);
    for (const base of candidateBases) {
      try {
        const res = await fetch(`${base}/api/v1/resolve?${q.toString()}`, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.servers) && data.servers.length > 0) {
            for (const s of data.servers) {
              if (s?.url) servers.push({ provider: s.provider || s.source || 'akwam', code: s.code, kind: s.kind || 'direct', url: s.url, headers: s.headers || {}, downloadUrl: s.downloadUrl || s.url });
            }
            break;
          } else if (data?.url) {
            servers.push({ provider: data.provider || 'akwam', code: data.code, kind: data.kind || 'direct', url: data.url, headers: data.headers || {}, downloadUrl: data.downloadUrl || data.url });
            break;
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 2. تصفية صارمة للروابط المباشرة النقية (Direct Media Streams) من القواشط المحلية ومنع الـ Embed نهائياً
  const cleanDirect = servers.filter(s => {
    const u = String(s.url || '').toLowerCase();
    if (/vidsrc|multiembed|autoembed|2embed|111movies|embed\.su|vidlink|123embed/i.test(u)) return false;
    return s.kind === 'direct' || u.includes('.m3u8') || u.includes('.mp4') ||
      ['akwam', 'mycima', 'egydead', 'arabseed', 'cimanow', 'anime4up', 'witanime', '3isk', 'akoam', 'alooy', 'laroza'].includes(String(s.provider).toLowerCase());
  });

  return probeAndRankServers(cleanDirect);
}

// محرك البحث الموحد (Search-Fusion Engine) الذي يصفي ويدمج النتائج من القواشط + TMDb
export async function nexusUnifiedSearch(queryText, apiBase = '', { signal } = {}) {
  const q = String(queryText || '').trim();
  if (!q) return [];

  const [tmdbRes, scraperRes] = await Promise.allSettled([
    tmdbFetch('/search/multi', { query: q, page: '1' }),
    fetch(`${apiBase}/api/v1/search?q=${encodeURIComponent(q)}`, { signal }).then(r => r.json()).catch(() => ({ status: 'error', data: [] }))
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
    if (scraperRes.value?.status === 'error' && rawList.length === 0) throw new Error('SEARCH_UNAVAILABLE');
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

  if (cached?.data && Date.now()-cached.updatedAt<3600000 && Array.isArray(cached.data.shelves) && cached.data.shelves.some(shelf=>shelf.items?.length)) {
    // نرجع النسخة المخزنة فوراً (0ms) ونحدث في الخلفية بصمت
    refreshPromise.catch(() => {});
    return cached.data;
  }
  return await refreshPromise;
}
