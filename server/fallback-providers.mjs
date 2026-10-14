// Unverified web embeds are not a provider of direct, advert-free media.
// Compatibility API remains empty until an audited direct extractor exists.
export function fallbackProviderCount() { return 0; }
export function listFallbackProviders() { return []; }
export function buildFallbackProviderUrl() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
export class FallbackProviderPool {
  ranked() { return []; }
  recordPlaybackSuccess() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
  recordPlaybackFailure() { throw Error('EMBEDDED_FALLBACK_DISABLED'); }
}
