import {wrapConfiguredProvider} from '../scrapers/configurable-provider.mjs';
import {runInBrowserLane} from './traffic.mjs';
const wrap = entry => wrapConfiguredProvider(entry, {scope: 'beta', run: runInBrowserLane});
// server/browser/registry.mjs
// Independent beta registry: never dispatches to Najd provider implementations.

import * as ahwakMod from './providers/sites/ahwak.mjs';
import * as brstejMod from './providers/sites/brstej.mjs';
import * as fostaMod from './providers/sites/fosta.mjs';
import * as mycimaMod from './providers/sites/mycima.mjs';
import * as akwamMod from './providers/sites/akwam.mjs';
import * as cimanowMod from './providers/sites/cimanow.mjs';
import * as shahid4uMod from './providers/sites/shahid4u.mjs';
import * as moviztimeMod from './providers/sites/moviztime.mjs';
import * as shii4uMod from './providers/sites/shii4u.mjs';
import * as egydeadMod from './providers/sites/egydead.mjs';
import * as ipauniverseMod from './providers/sites/ipauniverse.mjs';
import * as threeCktvMod from './providers/sites/3cktv.mjs';
import * as anime4upMod from './providers/sites/anime4up.mjs';
import * as qfilmMod from './providers/sites/qfilm.mjs';
import * as ristoanimeMod from './providers/sites/ristoanime.mjs';
import * as arabseedMod from './providers/sites/arabseed.mjs';
import * as mewsryMod from './providers/sites/mewsry.mjs';
import * as anime4upRestMod from './providers/sites/anime4up_rest.mjs';
import * as witanimeMod from './providers/sites/witanime.mjs';
import * as egydeadLiveMod from './providers/sites/egydead_live.mjs';
import * as yallashootMod from './providers/sites/yallashoot.mjs';
import * as threeIskMod from './providers/sites/3isk.mjs';
import * as alooyMod from './providers/sites/alooy.mjs';
import * as larozaMod from './providers/sites/laroza.mjs';
import * as fivetvMod from './providers/sites/fivetv.mjs';

const PROVIDER_ENTRIES = [
  { meta: ahwakMod.PROVIDER_META, module: ahwakMod },
  { meta: brstejMod.PROVIDER_META, module: brstejMod },
  { meta: fostaMod.PROVIDER_META, module: fostaMod },
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
  { meta: larozaMod.PROVIDER_META, module: larozaMod },
  { meta: fivetvMod.PROVIDER_META, module: fivetvMod }
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
  return wrap(PROVIDERS_MAP.get(id)) || null;
}

export function getProviderByCode(code) {
  return wrap(PROVIDERS_BY_CODE.get(code)) || null;
}

export function listProviders() {
  return PROVIDER_ENTRIES.map((e) => wrap(e).meta);
}

export function listIndependentProviders() {
  return PROVIDER_ENTRIES.filter((e) => !e.meta.mirrorOf).map((e) => wrap(e).meta);
}

export function listMirrorProviders() {
  return PROVIDER_ENTRIES.filter((e) => Boolean(e.meta.mirrorOf)).map((e) => wrap(e).meta);
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
