import {wrapConfiguredProvider} from './configurable-provider.mjs';
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
export const PROVIDERS_BY_CODE = new Map();

for (const entry of PROVIDER_ENTRIES) {
  PROVIDERS_MAP.set(entry.meta.id, entry);
  if (entry.meta.code) {
    PROVIDERS_BY_CODE.set(entry.meta.code, entry);
  }
}

export function getProvider(id) {
  return wrapConfiguredProvider(PROVIDERS_MAP.get(id)) || null;
}

export function getProviderByCode(code) {
  return wrapConfiguredProvider(PROVIDERS_BY_CODE.get(code)) || null;
}

export function listProviders() {
  return PROVIDER_ENTRIES.map((e) => wrapConfiguredProvider(e).meta);
}

export function listIndependentProviders() {
  return PROVIDER_ENTRIES.filter((e) => !e.meta.mirrorOf).map((e) => wrapConfiguredProvider(e).meta);
}

export function listMirrorProviders() {
  return PROVIDER_ENTRIES.filter((e) => Boolean(e.meta.mirrorOf)).map((e) => wrapConfiguredProvider(e).meta);
}

export default {
  PROVIDERS_MAP,
  PROVIDERS_BY_CODE,
  getProvider,
  getProviderByCode,
  listProviders,
  listIndependentProviders,
  listMirrorProviders
};
