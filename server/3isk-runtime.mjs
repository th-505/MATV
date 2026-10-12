import { create3iskProvider, decode3iskRef, assert3iskStream } from './providers/3isk.mjs';
import { createSupabaseProviderStore } from './provider-store.mjs';
import { TtlCache } from './content-runtime.mjs';

export function create3iskRuntime({ provider = create3iskProvider(), store = createSupabaseProviderStore(), now = Date.now,
  cache = new TtlCache({ maxEntries: 128 }) } = {}) {
  const pending = new Map();
  let storageError = null; let lastPrune = 0;
  async function persisted(action, clearError = false) {
    if (!store) return null;
    try { const result = await action(); if (clearError) storageError = null; return result; }
    catch { storageError = 'SUPABASE_CACHE_UNAVAILABLE'; return null; }
  }
  function valid(payload, key, expiry) {
    if (!payload || !Number.isFinite(expiry) || expiry <= now()) return false;
    if (!key.startsWith('playback:')) return true;
    try {
      const url = assert3iskStream(payload.media_url);
      const miravd = /^s\d+\.grzcdn\.com$/.test(url.hostname);
      if (payload.playback_headers?.Referer !== (miravd ? 'https://miravd.com/' : 'https://3iskk.xyz/') || !payload.playback_headers?.['User-Agent']) return false;
      const tokenExpiry = miravd ? Date.parse(payload.expires_at) : Number(url.searchParams.get('expires')) * 1000;
      return payload.playback_mode === 'direct' && (miravd || url.searchParams.get('token')) && tokenExpiry > now() + 60_000 &&
        Date.parse(payload.expires_at) === tokenExpiry && expiry <= tokenExpiry - 60_000;
    } catch { return false; }
  }
  async function execute(key, fetcher, ttl, { refresh = false } = {}) {
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      if (!refresh) {
        const local = cache.peek(key, now());
        if (local && !local.expired && valid(local.value, key, local.expiresAt)) return { ...local.value, cached: true };
        const row = await persisted(() => store.get(key, now()), true);
        const expiry = Date.parse(row?.expires_at);
        if (row && valid(row.payload, key, expiry)) {
          cache.set(key, row.payload, expiry - now(), now());
          return { ...row.payload, cached: true };
        }
      }
      cache.delete(key);
      if (refresh) await persisted(() => store.remove(key));
      const started = now();
      try {
        const payload = await fetcher();
        if (payload.playback_mode === 'client_resolve') {
          await persisted(() => store.event(`${key}:client-metadata`, 'resolved', now() - started, now()));
          return { ...payload, cached: false };
        }
        const expiry = key.startsWith('playback:') ? Math.min(now() + ttl, Date.parse(payload.expires_at) - 60_000) : now() + ttl;
        if (!valid(payload, key, expiry)) throw new Error('3ISK_INVALID_CACHE_PAYLOAD');
        cache.set(key, payload, expiry - now(), now());
        await persisted(() => store.put(key, payload, expiry, now()), true);
        await persisted(() => store.event(key, 'resolved', now() - started, now()));
        if (store && now() - lastPrune > 3600_000) {
          lastPrune = now(); await persisted(() => store.prune(now()));
        }
        return { ...payload, cached: false };
      } catch (error) {
        await persisted(() => store.event(key, 'failed', now() - started, now()));
        throw error;
      }
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  return {
    category: (id, page = 1) => execute(`category:${id}:${page}`, () => provider.category(id, page), 5 * 60_000),
    search: query => { const q = String(query).trim().slice(0, 120); return execute(`search:${q}`, () => provider.search(q), 60_000); },
    details(ref, options = {}) {
      const url = decode3iskRef(ref);
      return !url.pathname.startsWith('/watch/tvshows/')
        ? execute(`playback:v2:${ref}`, () => provider.resolve(ref), 5 * 3600_000, options)
        : execute(`details:${ref}`, () => provider.details(ref), 10 * 60_000);
    },
    status: () => ({ provider: '3isk', playback_mode: 'direct', storage: store ? 'supabase' : 'memory', storage_error: storageError, cache_entries: cache.size }),
  };
}
