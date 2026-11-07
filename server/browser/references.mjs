// Preserve installed reference identities while consulting only beta's registry.
import {getProvider} from './registry.mjs';
import {workReference as work, providerForReference as provider, scraperReference as scraper} from '../harvest/work-reference.mjs';
export {sourceWorkRef, canonicalWorkRef} from '../harvest/work-reference.mjs';
export const workReference = ref => work(ref, getProvider);
export const providerForReference = ref => provider(ref, getProvider);
export const scraperReference = ref => scraper(ref, getProvider);
