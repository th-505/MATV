import { fallbackProviderCount, listFallbackProviders, resolveFallbackStreams } from './fallback-providers.mjs';
// Embedded third-party players are intentionally disabled. Only a provider
// resolver with a verified direct media URL may offer playback to clients.
function positiveInt(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw Error(`INVALID_${field.toUpperCase()}`);
  return number;
}

function normalizeIdentity({ tmdbId, type, season, episode } = {}) {
  const id = positiveInt(tmdbId, 'tmdb_id');
  if (type === 'movie') return { tmdbId:id, type:'movie' };
  if (type !== 'series' && type !== 'tv') throw Error('INVALID_MEDIA_TYPE');
  return { tmdbId:id, type:'series', season:positiveInt(season,'season'), episode:positiveInt(episode,'episode') };
}

export class FallbackPlaybackRuntime {
  status() {
    return { status:'ok', configured:fallbackProviderCount() > 0, providers:fallbackProviderCount(), media_proxy:false, reason:fallbackProviderCount() ? 'VERIFIED_DIRECT_ONLY' : 'NO_VERIFIED_DIRECT_PROVIDER' };
  }
  async resolve(input) {
    const identity = normalizeIdentity(input);
    const providers = listFallbackProviders();
    for (const provider of providers) {
      try {
        const result = await resolveFallbackStreams(provider.id, { ...input, ...identity });
        if (result.status === 'available' && result.data.media_sources.length) return result;
      } catch (_) { /* Try next independently verified provider. */ }
    }
    return { status:'unavailable', source:'fallback', data:{
      ...identity, playback_unavailable:true, playback_reason:'NO_VERIFIED_DIRECT_PROVIDER', media_sources:[],
    } };
  }
  inspect() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
  async probe() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
  async openDirectMedia() { throw Error('MEDIA_PROXY_RETIRED_USE_DIRECT_PLAYBACK'); }
  recordFailure() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
  recordSuccess() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
  next() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
}
export function createFallbackPlaybackRuntime() { return new FallbackPlaybackRuntime(); }
