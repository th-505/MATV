import {getProviderConfig} from './shared/provider-config.mjs';
import {runInBrowserLane} from '../browser/traffic.mjs';
import {classifyNetworkError} from './shared/errors.mjs';
import { getProvider, listIndependentProviders } from '../browser/registry.mjs';
import { createConcurrencyQueue } from './shared/concurrency.mjs';

// This route never mutates the canonical discovery or preferred-source state.
export function createProviderBrowser({ lookup = getProvider, providers = listIndependentProviders,
  queue = createConcurrencyQueue({ concurrency: 4, maxQueued: 40 }), now=Date.now, catalogTtlMs=120000 } = {}) {
  const successful=new Map(), pending=new Map();let cachedBytes=0;
  function drop(key){const old=successful.get(key);if(old)cachedBytes-=old.bytes;successful.delete(key);}

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
    sources: () => runInBrowserLane(()=>providers().filter(meta => meta.enabled !== false && meta.capabilities?.catalog
      && typeof lookup(meta.id)?.module.scrapeCatalog === 'function')
      .map(meta => ({ id: meta.id, name: meta.name, domain: new URL(meta.domains[0]).hostname,
        content_type:meta.capabilities?.live===true?'live':'vod',categories: categories(meta.id) }))),
    async catalog(id, category, page = 1) { return runInBrowserLane(async()=>{
      const provider = entry(id);
      if (typeof provider.module.scrapeCatalog !== 'function') throw Error('BROWSER_CATALOG_UNSUPPORTED');
      if (!Number.isInteger(page) || page < 1 || page > 500) throw Error('BROWSER_BAD_PAGE');
      const allowed = categories(id);
      const selected = category || allowed[0]?.id;
      if (selected && !allowed.some(item => item.id === selected)) throw Error('BROWSER_BAD_CATEGORY');
      const config=getProviderConfig(id);
      const key=JSON.stringify([id,selected,page,config?.revision||0,config?.primary_domain||provider.meta.domains[0]]);
      const cached=successful.get(key);
      if(cached&&cached.expires>now())return structuredClone(cached.data);
      if(cached)drop(key);
      if(pending.has(key))return structuredClone(await pending.get(key));
      async function fetchPage(){
      let result;
      try{result=await queue.run(()=>runInBrowserLane(()=>provider.module.scrapeCatalog(selected,page,{strict:true,allowHttp:false,timeoutMs:8000,maxRetries:0})));}
      catch(error){const failure=new Error('BROWSER_SOURCE_UNAVAILABLE');failure.code=error.code||classifyNetworkError(error).code;throw failure;}
      if(result?._meta?.errorCode&&result._meta.errorCode!=='EMPTY_RESULT'){
        const failure=new Error('BROWSER_SOURCE_UNAVAILABLE');failure.code=result._meta.errorCode;throw failure;
      }
      const items = Array.isArray(result) ? result : result?.items;
      if (!Array.isArray(items)) throw Error('BROWSER_INVALID_RESPONSE');
      const meta = result?._meta || {};
      const nextPage = Number(meta.next_page);
      const observedNext = Number.isInteger(nextPage) && nextPage > page;
      const explicitPagination = Object.hasOwn(meta, 'next_page') || Object.hasOwn(meta, 'has_more');
      return { status: 'success', provider: id, category: selected || null,
        items: items.filter(item => item?.ref && item?.title).map(item => ({
          id:item.id||item.ref,ref:item.ref,title:item.title,poster:item.poster||item.image||'',
          type:item.type||'series',year:item.year||null,
          rating:Number.isFinite(Number(item.rating))?Math.max(0,Math.min(10,Number(item.rating))):0,
          genres:Array.isArray(item.genres)?item.genres:[],edition:item.edition||'',
          audio_language:item.audio_language||'',imdb_id:item.imdb_id||'',
          identity_verified:item.identity_verified===true,work_identity_verified:item.work_identity_verified===true,
          source: id, selected_source: id, source_refs: { [id]: item.ref } })),
        pagination: { page, next_page: observedNext ? nextPage : null,
          has_more: explicitPagination ? observedNext || meta.has_more === true : items.length > 0,
          basis: explicitPagination ? 'observed-source-pagination' : 'adapter-page-probe' } };
      }
      const work=fetchPage().then(data=>{
        if(data.items.length){
          const bytes=Buffer.byteLength(JSON.stringify(data));
          if(bytes<=256*1024){
            drop(key);
            while(successful.size>=80||cachedBytes+bytes>8*1024*1024){drop(successful.keys().next().value);}
            successful.set(key,{data:structuredClone(data),bytes,expires:now()+Math.max(0,Math.min(120000,catalogTtlMs))});cachedBytes+=bytes;
          }
        }
        return data;
      }).finally(()=>pending.delete(key));
      pending.set(key,work);
      return structuredClone(await work);
    });},
  };
}
