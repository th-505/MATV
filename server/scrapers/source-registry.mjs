import { listProviders, getProvider } from './registry.mjs';
import { createConcurrencyQueue } from './shared/concurrency.mjs';

// The existing registry remains the single source of provider capabilities.
const aliases = Object.freeze({ akoam: 'akwam', wecima: 'mycima' });
export const SOURCE_REGISTRY = Object.freeze(listProviders()
  .filter(meta => meta.capabilities?.search === true && typeof getProvider(meta.id)?.module.scrapeSearch === 'function')
  .map(meta => Object.freeze({
    id: meta.id,
    aliases: Object.freeze(Object.keys(aliases).filter(alias => aliases[alias] === meta.id)),
    search: true,
    live_verified: false,
  })));

export function getSource(provider) {
  const id = aliases[provider] || provider;
  return SOURCE_REGISTRY.find(source => source.id === id) || null;
}

function normalizeTitle(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function titleMatchesQuery(title, query) {
  const normalizedQuery = normalizeTitle(query);
  return Boolean(normalizedQuery) && normalizeTitle(title).includes(normalizedQuery);
}

// Loader injection lets routing tests run without network access or provider mocks.
export function createSourceSearch({ loadModule = source => getProvider(source.id)?.module } = {}) {
  return async function searchSource(query, provider) {
    const q = String(query || '').trim().replace(/\s+/g, ' ');
    if (q.length < 2 || q.length > 120) throw Error('INVALID_QUERY');
    const source = getSource(provider);
    if (!source?.search) throw Error('SOURCE_NOT_SUPPORTED');
    const scraper = await loadModule(source);
    if (typeof scraper.scrapeSearch !== 'function') throw Error('SOURCE_NOT_SUPPORTED');
    // Never consult another provider when this source fails or returns no results.
    const items = await scraper.scrapeSearch(q, 1, { strict: true });
    return (Array.isArray(items) ? items : [])
      .filter(item => item && titleMatchesQuery(item.title, q))
      .map(item => ({ ...item, selected_source: source.id }));
  };
}

export const searchSource = createSourceSearch();

export function listSourceCapabilities() {
  return SOURCE_REGISTRY.map(({ id, aliases, search }) => ({ id, aliases: [...aliases], search }));
}

export function createMultiSourceSearch({
  search = searchSource,
  queue = createConcurrencyQueue({ concurrency: 6, maxQueued: 200 }),
} = {}) {
  return async query => {
    const settled = await Promise.allSettled(SOURCE_REGISTRY.map(source =>
      queue.run(() => search(query, source.id))
    ));
    if (settled.every(result => result.status === 'rejected')) throw Error('SOURCES_UNAVAILABLE');
    const seen = new Set();
    return settled.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
      .filter(item => {
        if (!item || !titleMatchesQuery(item.title, query)) return false;
        // Different providers remain alternatives for the same work.
        const key = `${item.selected_source || item.source || ''}:${item.ref || item.url || item.id || item.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
}

export const searchAllSources = createMultiSourceSearch();
