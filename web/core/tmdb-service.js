// =====================================================================
// MA TV SUPREME TMDb v3/v4 Engine & Auto-Cache Service (1-Hour TTL)
// =====================================================================

const TMDB_V3_KEYS = [
  'f562845c2beca65e1028ff2e31ccaff1',
  '9aa9620e381a715982a765f9e9f57d42'
];

const TMDB_V4_TOKEN = (typeof localStorage !== 'undefined' ? (localStorage.getItem('tmdb_v4_token') || '') : '');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1-Hour TTL Auto-Refresh Cycle
const CACHE_PREFIX = 'matv_tmdb_cache_';

let keyIndex = 0;
function getActiveApiKey() {
  const key = TMDB_V3_KEYS[keyIndex % TMDB_V3_KEYS.length];
  keyIndex++;
  return key;
}

function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch (_) {
    return null;
  }
}

function setCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch (_) {}
}

async function fetchFromTmdb(endpoint, params = {}) {
  const cacheKey = endpoint + '_' + JSON.stringify(params);
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = new URL(TMDB_BASE_URL + endpoint);
  url.searchParams.set('language', 'ar-SA');
  url.searchParams.set('api_key', getActiveApiKey());
  
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  try {
    const headers = { 'Accept': 'application/json' };
    if (TMDB_V4_TOKEN) {
      headers['Authorization'] = `Bearer ${TMDB_V4_TOKEN}`;
    }
    let res = await fetch(url.toString(), {
      headers,
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });

    if (!res.ok) {
      // Fallback with just v3 API key
      const fallbackUrl = new URL(url.toString());
      fallbackUrl.searchParams.set('api_key', TMDB_V3_KEYS[1]);
      res = await fetch(fallbackUrl.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
      });
    }

    if (!res.ok) return null;
    const json = await res.json();
    setCache(cacheKey, json);
    return json;
  } catch (err) {
    console.warn('TMDb request error:', endpoint, err);
    return null;
  }
}

export function formatTmdbPoster(path, size = 'w500') {
  if (!path) return '';
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function formatTmdbBackdrop(path, size = 'original') {
  if (!path) return '';
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function getTrendingMovies() {
  const data = await fetchFromTmdb('/trending/movie/week');
  return (data?.results || []).map(m => ({
    id: m.id,
    title: m.title || m.original_title,
    originalTitle: m.original_title,
    img: formatTmdbPoster(m.poster_path),
    backdrop: formatTmdbBackdrop(m.backdrop_path),
    overview: m.overview || 'فيلم سينمائي عالمي بدقة 4K UHD وخالٍ تماماً من الإعلانات على MA TV.',
    year: m.release_date ? m.release_date.substring(0, 4) : '2026',
    rating: m.vote_average ? m.vote_average.toFixed(1) : '8.5',
    is_series: false,
    href: `tmdb:movie:${m.id}`,
    source: 'tmdb'
  }));
}

export async function getTrendingSeries() {
  const data = await fetchFromTmdb('/trending/tv/week');
  return (data?.results || []).map(s => ({
    id: s.id,
    title: s.name || s.original_name,
    originalTitle: s.original_name,
    img: formatTmdbPoster(s.poster_path),
    backdrop: formatTmdbBackdrop(s.backdrop_path),
    overview: s.overview || 'مسلسل درامي فاخر مترجم بجودة فائقة 4K UHD بدون إعلانات على MA TV.',
    year: s.first_air_date ? s.first_air_date.substring(0, 4) : '2026',
    rating: s.vote_average ? s.vote_average.toFixed(1) : '8.7',
    is_series: true,
    href: `tmdb:tv:${s.id}`,
    source: 'tmdb'
  }));
}

export async function searchTmdb(query, mediaType = 'movie') {
  if (!query) return [];
  const type = mediaType === 'series' || mediaType === 'tv' ? 'tv' : 'movie';
  const data = await fetchFromTmdb(`/search/${type}`, { query });
  return (data?.results || []).map(item => ({
    id: item.id,
    title: item.title || item.name || '',
    originalTitle: item.original_title || item.original_name,
    img: formatTmdbPoster(item.poster_path),
    backdrop: formatTmdbBackdrop(item.backdrop_path),
    year: (item.release_date || item.first_air_date || '').substring(0, 4) || null,
    rating: item.vote_average ? item.vote_average.toFixed(1) : '8.0',
    overview: item.overview,
    is_series: type === 'tv',
    href: `tmdb:${type}:${item.id}`,
    source: 'tmdb'
  }));
}

export async function getSimilarTitles(titleOrId, mediaType = 'movie') {
  if (!titleOrId) return [];
  const type = mediaType === 'series' || mediaType === 'tv' ? 'tv' : 'movie';
  
  let targetId = null;
  if (/^\d+$/.test(String(titleOrId).trim())) {
    targetId = String(titleOrId).trim();
  } else {
    // Clean title (remove season/episode/quality badges if any)
    const cleanTitle = String(titleOrId)
      .replace(/الموسم\s*\d+|الحلقة\s*\d+|مدبلج|مترجم|\b\d{4}\b/gi, '')
      .trim();
    const searchRes = await searchTmdb(cleanTitle || titleOrId, type);
    if (searchRes.length > 0) {
      targetId = searchRes[0].id;
    }
  }

  if (!targetId) return [];
  const data = await fetchFromTmdb(`/${type}/${targetId}/similar`);
  return (data?.results || []).slice(0, 10).map(item => ({
    id: item.id,
    title: item.title || item.name || '',
    img: formatTmdbPoster(item.poster_path),
    year: (item.release_date || item.first_air_date || '').substring(0, 4) || null,
    rating: item.vote_average ? item.vote_average.toFixed(1) : '8.0',
    is_series: type === 'tv',
    href: `tmdb:${type}:${item.id}`,
    source: 'tmdb'
  }));
}

export async function getTmdbMovieInfo(title, mediaType = 'movie') {
  const results = await searchTmdb(title, mediaType);
  if (!results.length) return null;
  return getTmdbDetails(mediaType, results[0].id);
}

export async function getTmdbDetails(mediaType, id) {
  const type = mediaType === 'series' || mediaType === 'tv' ? 'tv' : 'movie';
  const cleanId = String(id).replace(/^[^\d]+/, '');
  const data = await fetchFromTmdb(`/${type}/${cleanId}`, { append_to_response: 'credits,similar,videos' });
  if (!data) return null;
  return {
    id: data.id,
    title: data.title || data.name,
    overview: data.overview,
    poster: formatTmdbPoster(data.poster_path),
    backdrop: formatTmdbBackdrop(data.backdrop_path),
    year: (data.release_date || data.first_air_date || '').substring(0, 4),
    rating: data.vote_average ? data.vote_average.toFixed(1) : '8.0',
    genres: (data.genres || []).map(g => g.name),
    imdbId: data.imdb_id || null,
    seasons: data.seasons || [],
    episodesCount: data.number_of_episodes || null,
    similar: (data.similar?.results || []).slice(0, 8).map(s => ({
      id: s.id,
      title: s.title || s.name,
      img: formatTmdbPoster(s.poster_path),
      year: (s.release_date || s.first_air_date || '').substring(0, 4),
      rating: s.vote_average ? s.vote_average.toFixed(1) : '8.0',
      is_series: type === 'tv',
      href: `tmdb:${type}:${s.id}`
    }))
  };
}
