import { getProvider, listIndependentProviders } from './registry.mjs';
import { createConcurrencyQueue } from './shared/concurrency.mjs';

// This route never mutates the canonical discovery or preferred-source state.
export function createProviderBrowser({ lookup = getProvider, providers = listIndependentProviders,
  queue = createConcurrencyQueue({ concurrency: 4, maxQueued: 40 }) } = {}) {
  function entry(id) {
    const provider = lookup(id);
    if (!provider || provider.meta.mirrorOf || provider.meta.enabled === false) throw Error('BROWSER_PROVIDER_UNAVAILABLE');
    return provider;
  }
  function categories(id) {
    const provider = entry(id);
    const config = Object.values(provider.module).find(value => value && typeof value === 'object'
      && value.categories && typeof value.categories === 'object');
    const labels = { latest: 'الأحدث', home: 'الرئيسية', all: 'الكل', movies: 'الأفلام', movie: 'الأفلام',
      movies_all: 'كل الأفلام', series: 'المسلسلات', tv: 'المسلسلات', anime: 'الأنمي', arabic: 'عربي',
      movies_arabic: 'أفلام عربية', movies_foreign: 'أفلام أجنبية', series_arabic: 'مسلسلات عربية',
      series_foreign: 'مسلسلات أجنبية', series_turkish: 'مسلسلات تركية', today: 'اليوم', live: 'بث مباشر' };
    return Object.keys(config?.categories || {}).map(key => ({ id: key,
      label: config?.categoryLabels?.[key] || labels[key] || key.replace(/[-_]/g, ' ') }));
  }
  return {
    sources: () => providers().filter(meta => meta.enabled !== false && meta.capabilities?.catalog
      && typeof lookup(meta.id)?.module.scrapeCatalog === 'function')
      .map(meta => ({ id: meta.id, name: meta.name, domain: new URL(meta.domains[0]).hostname,
        categories: categories(meta.id) })),
    async catalog(id, category, page = 1) {
      const provider = entry(id);
      if (typeof provider.module.scrapeCatalog !== 'function') throw Error('BROWSER_CATALOG_UNSUPPORTED');
      if (!Number.isInteger(page) || page < 1 || page > 500) throw Error('BROWSER_BAD_PAGE');
      const allowed = categories(id);
      const selected = category || allowed[0]?.id;
      if (selected && !allowed.some(item => item.id === selected)) throw Error('BROWSER_BAD_CATEGORY');
      const result = await queue.run(() => provider.module.scrapeCatalog(selected, page));
      if (result?._meta?.errorCode && result._meta.errorCode !== 'EMPTY_RESULT') throw Error('BROWSER_SOURCE_UNAVAILABLE');
      const items = Array.isArray(result) ? result : result?.items;
      if (!Array.isArray(items)) throw Error('BROWSER_INVALID_RESPONSE');
      const meta = result?._meta || {};
      const nextPage = Number(meta.next_page);
      const observedNext = Number.isInteger(nextPage) && nextPage > page;
      const explicitPagination = Object.hasOwn(meta, 'next_page') || Object.hasOwn(meta, 'has_more');
      return { status: 'success', provider: id, category: selected || null,
        items: items.filter(item => item?.ref && item?.title).map(item => ({ ...item,
          source: id, selected_source: id, source_refs: { [id]: item.ref } })),
        pagination: { page, next_page: observedNext ? nextPage : null,
          has_more: explicitPagination ? observedNext || meta.has_more === true : items.length > 0,
          basis: explicitPagination ? 'observed-source-pagination' : 'adapter-page-probe' } };
    },
  };
}
