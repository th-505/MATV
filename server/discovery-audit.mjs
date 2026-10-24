import { createMediaAuditor } from './media-audit.mjs';
import { classifyFallbackProbeResponse } from './fallback-probe.mjs';
import { fetchSafeResponse } from './scrapers/shared/http.mjs';
import { createConcurrencyQueue } from './scrapers/shared/concurrency.mjs';
import { directCandidate } from './scrapers/content-discovery.mjs';

// Probe only headers; never fetch video bodies or pass signed URLs to Gemini.
export async function probeDiscoveryMedia(candidate) {
  const response = await fetchSafeResponse(candidate.url, {
    method: 'HEAD', headers: candidate.headers || {}, allowHttp: false,
    timeoutMs: 4000, maxRetries: 0, maxRedirects: 3,
  });
  return { ...classifyFallbackProbeResponse({ status: response.status,
    contentType: response.headers?.get('content-type') }), statusCode: response.status };
}

export function createDiscoveryAudit({ auditor = createMediaAuditor(), probe = probeDiscoveryMedia,
  concurrency = 2 } = {}) {
  const queue = createConcurrencyQueue({ concurrency, maxQueued: 200 });
  async function review(candidates, expected) {
    const settled = await Promise.allSettled(candidates.filter(directCandidate).map(candidate => queue.run(async () => {
      let technical;
      try { technical = await probe(candidate); }
      catch { technical = { playable: false, statusCode: 0, container: null }; }
      // Providers must supply observed metadata; never manufacture it from the request.
      const audit = await auditor.audit({ provider: candidate.provider, expected,
        observed: candidate.observed_identity || {}, mediaUrl: candidate.url, technical });
      return { candidate, audit };
    })));
    const approved = [], quarantine = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const { candidate, audit } = result.value;
      if (audit.eligible) approved.push({ ...candidate, identity_verified: true, audit_id: audit.id });
      else quarantine.push({ provider: candidate.provider, audit_id: audit.id,
        decision: audit.decision, reasons: audit.reasons });
    }
    return { approved, quarantine };
  }
  return Object.freeze({ review, status: auditor.status });
}
