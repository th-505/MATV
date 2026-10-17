// server/scrapers/registry.mjs
// Central Capability Registry for all MATV scrapers & providers

import * as mycimaMod from './sites/mycima.mjs';
import * as akwamMod from './sites/akwam.mjs';
import * as cimanowMod from './sites/cimanow.mjs';
import * as shahid4uMod from './sites/shahid4u.mjs';
import * as moviztimeMod from './sites/moviztime.mjs';
import * as shii4uMod from './sites/shii4u.mjs';
import * as egydeadMod from './sites/egydead.mjs';
import * as ipauniverseMod from './sites/ipauniverse.mjs';
import * as threeCktvMod from './sites/3cktv.mjs';
import * as anime4upMod from './sites/anime4up.mjs';
import * as qfilmMod from './sites/qfilm.mjs';
import * as ristoanimeMod from './sites/ristoanime.mjs';
import * as arabseedMod from './sites/arabseed.mjs';
import * as mewsryMod from './sites/mewsry.mjs';
import * as anime4upRestMod from './sites/anime4up_rest.mjs';
import * as witanimeMod from './sites/witanime.mjs';
import * as egydeadLiveMod from './sites/egydead_live.mjs';
import * as yallashootMod from './sites/yallashoot.mjs';
import * as threeIskMod from './sites/3isk.mjs';
import * as alooyMod from './sites/alooy.mjs';
import * as larozaMod from './sites/laroza.mjs';

const PROVIDER_ENTRIES = [
  { meta: mycimaMod.PROVIDER_META, module: mycimaMod },
  { meta: akwamMod.PROVIDER_META, module: akwamMod },
  { meta: cimanowMod.PROVIDER_META, module: cimanowMod },
  { meta: shahid4uMod.PROVIDER_META, module: shahid4uMod },
  { meta: moviztimeMod.PROVIDER_META, module: moviztimeMod },
  { meta: shii4uMod.PROVIDER_META, module: shii4uMod },
  { meta: egydeadMod.PROVIDER_META, module: egydeadMod },
  { meta: ipauniverseMod.PROVIDER_META, module: ipauniverseMod },
  { meta: threeCktvMod.PROVIDER_META, module: threeCktvMod },
  { meta: anime4upMod.PROVIDER_META, module: anime4upMod },
  { meta: qfilmMod.PROVIDER_META, module: qfilmMod },
  { meta: ristoanimeMod.PROVIDER_META, module: ristoanimeMod },
  { meta: arabseedMod.PROVIDER_META, module: arabseedMod },
  { meta: mewsryMod.PROVIDER_META, module: mewsryMod },
  { meta: anime4upRestMod.PROVIDER_META, module: anime4upRestMod },
  { meta: witanimeMod.PROVIDER_META, module: witanimeMod },
  { meta: egydeadLiveMod.PROVIDER_META, module: egydeadLiveMod },
  { meta: yallashootMod.PROVIDER_META, module: yallashootMod },
  { meta: threeIskMod.PROVIDER_META, module: threeIskMod },
  { meta: alooyMod.PROVIDER_META, module: alooyMod },
  { meta: larozaMod.PROVIDER_META, module: larozaMod }
];

export const PROVIDERS_MAP = new Map();
// Codes identify provider families in legacy UI labels; they are not server numbers.
// Keep every registration for a code and select a stable non-mirror canonical entry.
export const PROVIDERS_BY_CODE = new Map();
export const PROVIDERS_BY_CODE_ALL = new Map();

export const PROVIDER_ALIASES = Object.freeze({
  akoam: 'akwam',
  moviz: 'moviztime',
  'moviz-time': 'moviztime',
  ipa: 'ipauniverse',
  risto: 'ristoanime',
  sports_live: 'yallashoot',
  '3ck': '3cktv',
  '3isk': '3isk',
  ap: 'anime4up',
  ed: 'egydead'
});
export const PROVIDER_CODE_ALIASES = Object.freeze({ YT: 'yallashoot', LA: 'laroza' });

for (const entry of PROVIDER_ENTRIES) {
  PROVIDERS_MAP.set(entry.meta.id, entry);
  if (entry.meta.code) {
    const entries = PROVIDERS_BY_CODE_ALL.get(entry.meta.code) || [];
    entries.push(entry);
    PROVIDERS_BY_CODE_ALL.set(entry.meta.code, entries);
  }
}

for (const [code, entries] of PROVIDERS_BY_CODE_ALL) {
  const canonical = entries.find((entry) => !entry.meta.mirrorOf) || entries[0];
  PROVIDERS_BY_CODE.set(code, canonical);
}

function normalizeProviderId(id) {
  const raw = String(id || '').trim().toLowerCase();
  return PROVIDER_ALIASES[raw] || raw;
}

export function getProvider(id) {
  return PROVIDERS_MAP.get(normalizeProviderId(id)) || null;
}

export function getProviderByCode(code) {
  const familyCode = String(code || '').toUpperCase().match(/^([A-Z0-9]+)(?:-\d+)?$/)?.[1];
  const aliasProvider = PROVIDER_CODE_ALIASES[familyCode];
  if (aliasProvider) return PROVIDERS_MAP.get(aliasProvider) || null;
  return PROVIDERS_BY_CODE.get(familyCode) || null;
}

export function getProvidersByCode(code) {
  const familyCode = String(code || '').toUpperCase().match(/^([A-Z0-9]+)(?:-\d+)?$/)?.[1];
  const aliasProvider = PROVIDER_CODE_ALIASES[familyCode];
  if (aliasProvider) return [PROVIDERS_MAP.get(aliasProvider)].filter(Boolean);
  return familyCode ? [...(PROVIDERS_BY_CODE_ALL.get(familyCode) || [])] : [];
}

export function resolveProviderReference(refOrUrl) {
  const ref = String(refOrUrl || '').trim();
  if (!ref) return null;
  const colon = ref.indexOf(':');
  if (colon > 0 && !/^https?$/i.test(ref.slice(0, colon))) {
    const prefix = normalizeProviderId(ref.slice(0, colon));
    const entry = PROVIDERS_MAP.get(prefix);
    if (entry) return entry;
  }
  let hostname;
  try { hostname = new URL(ref).hostname.toLowerCase(); } catch { return null; }
  const candidates = PROVIDER_ENTRIES.filter((entry) =>
    (entry.meta.domains || []).some((domain) => {
      try {
        const allowed = new URL(domain).hostname.toLowerCase();
        return hostname === allowed || hostname.endsWith(`.${allowed}`);
      } catch { return false; }
    })
  );
  const exactPrimary = candidates.find((entry) => {
    try { return new URL(entry.meta.domains?.[0]).hostname.toLowerCase() === hostname; }
    catch { return false; }
  });
  return exactPrimary || candidates.find((entry) => !entry.meta.mirrorOf) || candidates[0] || null;
}

export function listProviders() {
  return PROVIDER_ENTRIES.map((e) => e.meta);
}

export function listIndependentProviders() {
  return PROVIDER_ENTRIES.filter((e) => !e.meta.mirrorOf).map((e) => e.meta);
}

export function listMirrorProviders() {
  return PROVIDER_ENTRIES.filter((e) => Boolean(e.meta.mirrorOf)).map((e) => e.meta);
}

export default {
  PROVIDERS_MAP,
  PROVIDERS_BY_CODE,
  PROVIDERS_BY_CODE_ALL,
  PROVIDER_ALIASES,
  PROVIDER_CODE_ALIASES,
  getProvider,
  getProviderByCode,
  getProvidersByCode,
  resolveProviderReference,
  listProviders,
  listIndependentProviders,
  listMirrorProviders
};
