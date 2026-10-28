import { matchesIdentity } from './scrapers/content-discovery.mjs';
import { createMediaAuditor } from './media-audit.mjs';
import { createConcurrencyQueue } from './scrapers/shared/concurrency.mjs';
import { directCandidate } from './scrapers/content-discovery.mjs';
import {probeHarvestMedia} from './harvest/media-probe.mjs';

// Bounded container prefix only; media bytes and signed URLs never reach Gemini.
export async function probeDiscoveryMedia(candidate) {
  return probeHarvestMedia(candidate,{platform:'native'});
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
      return { candidate:{...candidate,technical_probe:technical}, audit };
    })));
    const approved = [], quarantine = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const { candidate, audit } = result.value;
      const observed=candidate.observed_identity || {};
      const identityComplete=Boolean(expected.year && observed.year) &&
        [expected.title,...(expected.aliasases || [])].some(title=>matchesIdentity(observed,title,{year:expected.year,aliases:expected.aliases||[]})) &&
        (!expected.season || Number(observed.season)===Number(expected.season)) &&
        (!expected.episode || Number(observed.episode)===Number(expected.episode));
      const auditUnavailable=!audit.aiReviewed && audit.reasons?.some(reason=>
        /^(AI_NOT_CONFIGURED|GEMINI_(?:TIMEOUT|REQUEST_FAILED|CREDENTIALS_OR_QUOTA_REJECTED)|DAILY_BUDGET_EXHAUSTED|AUDIT_BUSY)$/.test(reason));
      const metadataVerified=identityComplete && auditUnavailable && candidate.technical_probe?.playable===true;
      if (identityComplete && candidate.technical_probe?.playable===true && (audit.eligible || metadataVerified)) approved.push({ ...candidate, identity_verified: audit.eligible,
        audit_id: audit.id, audit_pending:metadataVerified, verification_basis:metadataVerified?'exact-source-metadata-and-probe':'gemini-assisted' });
      else quarantine.push({ provider: candidate.provider, audit_id: audit.id,
        decision: audit.decision, reasons: audit.reasons });
    }
    return { approved, quarantine };
  }
  return Object.freeze({ review, status: auditor.status });
}
