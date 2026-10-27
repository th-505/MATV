import { contentIdentity } from '../../shared/content-identity.js';
import { searchTraceEvent } from '../diagnostics/search-trace.mjs';
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
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670]/gu, '').replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
    const meta = items?._meta;
    searchTraceEvent('parser_result', { raw_count: Array.isArray(items) ? items.length : 0, reason: meta?.errorCode || null, url: meta?.url, titles: Array.isArray(items) ? items.map(x => x.title) : [] });
    if (meta?.errorCode && meta.errorCode !== 'EMPTY_RESULT') {
      const error = new Error(meta.errorCode); error.code = meta.errorCode; throw error;
    }
    if (!Array.isArray(items)) { const error = new Error('STRUCTURE_CHANGED'); error.code = 'STRUCTURE_CHANGED'; throw error; }
    const result = items
      .filter(item => item && titleMatchesQuery(item.title, q))
      .map(item => ({ ...item, ...contentIdentity(item), selected_source: source.id }));
    searchTraceEvent('title_filter', { raw_count: items.length, kept_count: result.length, reason: items.length && !result.length ? 'TITLE_FILTER_REJECTED_ALL' : null });
    return result;
  };
}

export const searchSource = createSourceSearch();

const SOURCE_NAMES = {mycima:'ماي سيما',akwam:'أكوام',cimanow:'سيما ناو',shahid4u:'شاهد فور يو',moviztime:'موفيز تايم',shii4u:'شي فور يو',egydead:'إيجي ديد',ipauniverse:'آي بي إيه يونيفرس','3cktv':'قصة عشق',anime4up:'أنمي فور أب',qfilm:'كيو فيلم',ristoanime:'ريستو أنمي',arabseed:'عرب سيد',mewsry:'مصري',anime4up_rest:'أنمي فور أب البديل',witanime:'ويت أنمي','3isk':'قصة عشق',alooy:'ألوي',laroza:'لاروزا'};
export function listSourceCapabilities() {
  return SOURCE_REGISTRY.map(({ id, aliases, search }) => {
    const meta = getProvider(id).meta;
    return { id, aliases: [...aliases], search, name_ar:SOURCE_NAMES[id] || meta.name,
      domain:new URL((getProvider(meta.mirrorOf)?.meta || meta).domains[0]).hostname };
  });
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
