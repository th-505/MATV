// web/core/tmdb-service.js — Real TMDb v3/v4 Engine + BYOK Local Environment Support
const CACHE_PREFIX = 'matv_tmdb_v7_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour TTL
const CACHE_MAX_ENTRIES = 128;
const MAX_CACHE_ENTRY_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const pendingRequests = new Map();

export function getUserTmdbKey() {
  try {
    const custom = localStorage.getItem('matv_user_tmdb_key');
    if (custom && /^(?:[A-Za-z0-9_-]{20,128}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(custom.trim())) return custom.trim();
  } catch (_) {}
  return '';
}

function browserCatalogUrl(path, query) {
  // Project credentials stay on the backend. BYOK remains an explicit personal option.
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const configured = document.querySelector?.('meta[name="matv-api-base"]')?.content || '';
  const local = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3000' : '';
  try {
    const url = new URL('/api/v1/tmdb/catalog', configured || local || 'https://matv.onrender.com');
    if (url.protocol !== 'https:' && !(/^http:$/.test(url.protocol) && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    url.searchParams.set('path', path);
    query.forEach((value, key) => url.searchParams.set(key, value));
    return url;
  } catch { return null; }
}

function pruneCache(now = Date.now()) {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        if (!value || !Number.isFinite(value.ts) || now - value.ts >= CACHE_TTL_MS || !value.data) {
          localStorage.removeItem(key);
          continue;
        }
        keys.push({ key, ts: value.ts });
      } catch (_) {
        localStorage.removeItem(key);
      }
    }
    keys.sort((a, b) => a.ts - b.ts);
    while (keys.length >= CACHE_MAX_ENTRIES) localStorage.removeItem(keys.shift().key);
  } catch (_) {}
}

function validPath(path) {
  return typeof path === 'string' && /^\/(?:trending\/(?:all|movie|tv)\/(?:day|week)|movie\/(?:popular|top_rated|\d+(?:\/(?:recommendations|similar))?)|tv\/(?:popular|\d+(?:\/season\/\d+|\/(?:recommendations|similar))?)|discover\/(?:movie|tv)|search\/(?:movie|tv|multi))$/.test(path);
}

export async function tmdbFetch(path, params = {}) {
  if (!validPath(path)) return { results: [] };
  const allowedParams = new Set(['language', 'page', 'query', 'with_genres', 'with_original_language', 'sort_by', 'append_to_response', 'include_adult', 'year', 'primary_release_year', 'first_air_date_year']);
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).some(key => !allowedParams.has(key))) return { results: [] };
  const safeParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
  const query = new URLSearchParams({ language: 'ar-SA', ...safeParams });
  const cacheKey = `${CACHE_PREFIX}${path}?${query.toString()}`;
  const now = Date.now();

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed.ts) && now - parsed.ts < CACHE_TTL_MS && parsed.data) {
        return parsed.data;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch (_) {}

  const userKey = getUserTmdbKey();
  const backendUrl = userKey ? null : browserCatalogUrl(path, query);
  if (!userKey && !backendUrl) return { results: [] };
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = { Accept: 'application/json' };
      const url = backendUrl || new URL(`https://api.themoviedb.org/3${path}`);
      if (userKey) {
        query.forEach((value, key) => url.searchParams.set(key, value));
        if (userKey.startsWith('eyJ')) headers.Authorization = `Bearer ${userKey}`;
        else url.searchParams.set('api_key', userKey);
      }
      const response = await fetch(url.toString(), { headers, signal: controller.signal, redirect: 'error' });
      if (!response.ok) return { results: [] };
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { results: [] };
      const serialized = JSON.stringify({ ts: Date.now(), data });
      if (new TextEncoder().encode(serialized).byteLength <= MAX_CACHE_ENTRY_BYTES) {
        pruneCache();
        try { localStorage.setItem(cacheKey, serialized); } catch (_) {}
      }
      return data;
    } catch { return { results: [] }; }
    finally { clearTimeout(timer); pendingRequests.delete(cacheKey); }
  })();
  pendingRequests.set(cacheKey, request);
  return request;
}

export function normalizeTmdbItem(item, forcedType = null) {
  if (!item || !Number.isInteger(Number(item.id)) || Number(item.id) <= 0) return null;
  const isTv = forcedType === 'tv' || forcedType === 'series' || item.media_type === 'tv' || Boolean(item.first_air_date || item.name);
  const mediaType = isTv ? 'tv' : 'movie';
  const title = item.title || item.name || item.original_title || item.original_name || 'عمل سينمائي';
  const originalTitle = item.original_title || item.original_name || title;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average).toFixed(1) : '0.0';
  const poster = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : (item.poster || item.img || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80');
  const backdrop = item.backdrop_path
    ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
    : poster;

  return {
    id: `tmdb:${mediaType}:${item.id}`,
    href: `tmdb:${mediaType}:${item.id}`,
    tmdbId: String(item.id),
    mediaType,
    type: isTv ? 'series' : 'movie',
    typeLabel: isTv ? 'مسلسل' : 'فيلم',
    title,
    originalTitle,
    year,
    rating,
    poster,
    img: poster,
    backdrop,
    overview: item.overview || 'عمل درامي وسينمائي متوفر بجودة عالية ومصادر متعددة على منصة MA TV.',
    genreIds: item.genre_ids || [],
    originalLang: item.original_language || 'en',
    source: 'tmdb'
  };
}

// جلب أقسام الصفحة الرئيسية الغزيرة بأسلوب Netflix & Shahid
export async function fetchNetflixHomeShelves() {
  const [
    trendingAll,
    topRatedMovies,
    actionMovies,
    horrorMovies,
    scifiMovies,
    arabicMovies,
    popularSeries,
    turkishSeries,
    arabicSeries,
    koreanSeries,
    animeSeries,
    animeMovies
  ] = await Promise.all([
    tmdbFetch('/trending/all/day', { page: '1' }),
    tmdbFetch('/movie/top_rated', { page: '1' }),
    tmdbFetch('/discover/movie', { with_genres: '28,53', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/movie', { with_genres: '27,9648', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/movie', { with_genres: '878,14', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/movie', { with_original_language: 'ar', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/tv/popular', { page: '1' }),
    tmdbFetch('/discover/tv', { with_original_language: 'tr', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/tv', { with_original_language: 'ar', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/tv', { with_original_language: 'ko', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/tv', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page: '1' }),
    tmdbFetch('/discover/movie', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page: '1' })
  ]);

  return {
    heroItems: (trendingAll.results || []).slice(0, 8).map(x => normalizeTmdbItem(x)),
    shelves: [
      { id: 'shelfTop10', title: 'أفضل 10 أعمال رائجة اليوم', sub: 'الأكثر متابعة وتصنيفاً اليوم عبر TMDb', items: (trendingAll.results || []).slice(0, 15).map(x => normalizeTmdbItem(x)) },
      { id: 'shelfTurkish', title: 'الدراما التركية الحصرية', sub: 'أقوى المسلسلات التركية المترجمة والمدبلجة', items: (turkishSeries.results || []).map(x => ({ ...normalizeTmdbItem(x, 'tv'), category: 'turkish' })) },
      { id: 'shelfArabicSeries', title: 'المسلسلات العربية والخليجية', sub: 'أحدث الإنتاجات الدرامية العربية', items: (arabicSeries.results || []).map(x => normalizeTmdbItem(x, 'tv')) },
      { id: 'shelfActionMovies', title: 'أفلام الأكشن والإثارة', sub: 'جرعة عالية من الحماس والمغامرة', items: (actionMovies.results || []).map(x => normalizeTmdbItem(x, 'movie')) },
      { id: 'shelfPopularSeries', title: 'مسلسلات عالمية تتصدر المشهد', sub: 'أشهر المسلسلات الأجنبية والعالمية', items: (popularSeries.results || []).map(x => normalizeTmdbItem(x, 'tv')) },
      { id: 'shelfAnimeSeries', title: 'عالم الأنمي الياباني — مسلسلات', sub: 'أشهر أنميات الشونين والأكشن والخيال', items: (animeSeries.results || []).map(x => ({ ...normalizeTmdbItem(x, 'tv'), category: 'anime' })) },
      { id: 'shelfAnimeMovies', title: 'أفلام الأنمي السينمائية', sub: 'روائع أفلام الأنمي اليابانية المترجمة', items: (animeMovies.results || []).map(x => ({ ...normalizeTmdbItem(x, 'movie'), category: 'anime' })) },
      { id: 'shelfKorean', title: 'الدراما الكورية والآسيوية (K-Drama)', sub: 'أعمال كورية وآسيوية متميزة', items: (koreanSeries.results || []).map(x => normalizeTmdbItem(x, 'tv')) },
      { id: 'shelfHorror', title: 'أفلام الرعب والغموض', sub: 'تشويق وإثارة تحبس الأنفاس', items: (horrorMovies.results || []).map(x => normalizeTmdbItem(x, 'movie')) },
      { id: 'shelfSciFi', title: 'الخيال العلمي والفانتازيا', sub: 'عوالم مستقبلية وملاحم أسطورية', items: (scifiMovies.results || []).map(x => normalizeTmdbItem(x, 'movie')) },
      { id: 'shelfArabicMovies', title: 'السينما العربية', sub: 'أفلام عربية وخليجية ومصرية مختارة', items: (arabicMovies.results || []).map(x => normalizeTmdbItem(x, 'movie')) },
      { id: 'shelfTopRated', title: 'روائع السينما الأعلى تقييماً', sub: 'أفلام خالدة حائزة على أعلى التقييمات العالمية', items: (topRatedMovies.results || []).map(x => normalizeTmdbItem(x, 'movie')) }
    ]
  };
}

// جلب التفاصيل الكاملة + الحلقات الفعلية للمواسم + الممثلين + الأعمال المشابهة
export async function fetchFullTmdbDetails(mediaType, tmdbId, seasonNumber = 1) {
  if (!/^\d{1,12}$/.test(String(tmdbId)) || Number(tmdbId) <= 0) return null;
  const type = (mediaType === 'series' || mediaType === 'tv') ? 'tv' : 'movie';
  let details = await tmdbFetch(`/${type}/${tmdbId}`, { append_to_response: 'credits,similar,recommendations,external_ids' });
  if (!details || !details.id) {
    details = await tmdbFetch(`/${type}/${tmdbId}`, { language: 'en-US', append_to_response: 'credits,similar,recommendations,external_ids' });
  }
  if (!details || !details.id) return null;

  // إن كان الوصف العربي فارغاً نجلب الوصف الإنجليزي
  if (!details.overview || !details.overview.trim()) {
    const enDetails = await tmdbFetch(`/${type}/${tmdbId}`, { language: 'en-US' });
    if (enDetails?.overview) details.overview = enDetails.overview;
  }

  let episodes = [];
  if (type === 'tv') {
    const seasonValue = Number(seasonNumber);
    if (!Number.isInteger(seasonValue) || seasonValue < 0 || seasonValue > 100) return null;
    const seasonData = await tmdbFetch(`/tv/${tmdbId}/season/${seasonValue}`);
    if (Array.isArray(seasonData?.episodes) && seasonData.episodes.length > 0) {
      episodes = seasonData.episodes.filter(ep=>Number.isInteger(ep.episode_number)&&ep.episode_number>0).map((ep) => {
        const epNum = ep.episode_number;
        return {
          number: epNum,
          episodeNumber: epNum,
          season: seasonValue,
          title: ep.name && !ep.name.startsWith('Episode') ? `الحلقة ${epNum}: ${ep.name}` : `الحلقة ${epNum}`,
          overview: ep.overview || '',
          still: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : '',
          runtime: ep.runtime || 45
        };
      });
    }
  }

  const similarRaw = [
    ...(details.recommendations?.results || []),
    ...(details.similar?.results || [])
  ].slice(0, 14);

  return {
    ...normalizeTmdbItem(details, type),
    imdbId: details.external_ids?.imdb_id || details.imdb_id || '',
    genres: (details.genres || []).map(g => g.name),
    runtime: details.runtime || (details.episode_run_time && details.episode_run_time[0]) || 110,
    numberOfSeasons: details.number_of_seasons || 1,
    seasons: (details.seasons || []).filter(s => s.season_number > 0),
    cast: (details.credits?.cast || []).slice(0, 8).map(c => ({
      name: c.name,
      character: c.character,
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : ''
    })),
    episodes,
    similar: similarRaw.map(x => normalizeTmdbItem(x, type)).filter(Boolean)
  };
}

// Backward-compatible helpers
export async function getTrendingMovies() {
  const res = await tmdbFetch('/trending/movie/week');
  return (res?.results || []).map(m => normalizeTmdbItem(m, 'movie'));
}

export async function getTrendingSeries() {
  const res = await tmdbFetch('/trending/tv/week');
  return (res?.results || []).map(s => normalizeTmdbItem(s, 'tv'));
}

export async function searchTmdb(query, type = 'multi') {
  if (!query || query.trim().length < 2) return [];
  const res = await tmdbFetch(`/search/${type}`, { query: query.trim() });
  return (res?.results || []).filter(x => x.media_type !== 'person').map(x => normalizeTmdbItem(x, type === 'multi' ? null : type));
}

export async function getSimilarTitles(tmdbId, type = 'movie') {
  if (!tmdbId) return [];
  const mediaType = type === 'series' || type === 'tv' ? 'tv' : 'movie';
  const res = await tmdbFetch(`/${mediaType}/${tmdbId}/recommendations`);
  return (res?.results || []).slice(0, 12).map(x => normalizeTmdbItem(x, mediaType));
}
