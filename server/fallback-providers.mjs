// Staging-safe fallback registry. Providers are not considered playable until
// a real direct media resolver has been independently verified.
const verified = new Map();
export function registerVerifiedFallbackProvider(provider) {
  if (!provider || typeof provider.id !== 'string' || typeof provider.resolve !== 'function' || provider.verified !== true)
    throw new Error('FALLBACK_PROVIDER_NOT_VERIFIED');
  verified.set(provider.id, provider);
}
export function fallbackProviderCount() { return verified.size; }
export function listFallbackProviders() { return [...verified.values()].map(p => ({ id:p.id, baseUrl:p.baseUrl || '' })); }
export function buildFallbackProviderUrl(id) {
  const p = verified.get(id);
  if (!p || typeof p.buildUrl !== 'function') throw Error('NO_VERIFIED_DIRECT_PROVIDER');
  return p.buildUrl();
}
export async function resolveFallbackStreams(id, input) {
  const p = verified.get(id);
  if (!p) return { status:'unavailable', source:id, data:{ playback_unavailable:true, media_sources:[] } };
  const result = await p.resolve(input);
  const sources = (Array.isArray(result?.media_sources) ? result.media_sources : [])
    .filter(s => s && s.verified === true && s.kind === 'direct' && /^https:\/\//i.test(s.url || ''));
  return { status:sources.length ? 'available':'unavailable', source:id, data:{ playback_unavailable:!sources.length, media_sources:sources } };
}
export class FallbackProviderPool {
  ranked() { return [...verified.values()]; }
  recordPlaybackSuccess() {}
  recordPlaybackFailure() {}
}
