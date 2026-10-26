import { attachResultMeta } from '../shared/errors.mjs';
// server/scrapers/sites/anime4up_rest.mjs
// Standalone provider module for أنمي فور اب ريست (Anime4Up Rest, code: AP)
// Explicit mirror / gateway module of Anime4Up (anime4up, code: AP)

import {
  PROVIDER_META as CORE_META,
  scrapeCatalog as scrapeCoreCatalog,
  scrapeSearch as scrapeCoreSearch,
  scrapeDetails as scrapeCoreDetails,
  scrapeEpisodes as scrapeCoreEpisodes,
  scrapeServers as scrapeCoreServers,
  resolveStream as resolveCoreStream
} from './anime4up.mjs';

export const PROVIDER_ID = 'anime4up_rest';
export const PROVIDER_NAME = 'أنمي فور اب ريست (Anime4Up Rest)';
export const PROVIDER_CODE = 'AP';
export const PRIMARY_BASE_URL = 'https://w1.anime4up.rest';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_BASE_URL, 'https://www.anime4up.bond', 'https://4f.7grcy6t.shop']),
  mirrorOf: CORE_META.id,
  capabilities: Object.freeze({
    catalog: true,
    search: true,
    details: true,
    episodes: true,
    servers: true,
    resolve: true,
    live: false
  }),
  searchSpec: Object.freeze({
    method: 'GET',
    pathTemplate: '/?search_param=animes&s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: false
  }),
  notImplemented: Object.freeze({})
});

export const ANIME4UP_REST_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  mirrorOf: CORE_META.id
});

export async function scrapeCatalog(category = 'anime_series', page = 1, options = {}) {
  const items = await scrapeCoreCatalog(category, page, {
    ...options,
    providerId: PROVIDER_ID
  });
  return attachResultMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    id: it.id?.replace('anime4up:', 'anime4up_rest:') || it.id,
    ref: it.ref?.replace('anime4up:', 'anime4up_rest:') || it.ref
  })), { ...items._meta, providerId: PROVIDER_ID });
}

export async function scrapeSearch(query, page = 1, options = {}) {
  const items = await scrapeCoreSearch(query, page, {
    ...options,
    providerId: PROVIDER_ID
  });
  return attachResultMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    id: it.id?.replace('anime4up:', 'anime4up_rest:') || it.id,
    ref: it.ref?.replace('anime4up:', 'anime4up_rest:') || it.ref
  })), { ...items._meta, providerId: PROVIDER_ID });
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const details = await scrapeCoreDetails(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  if (!details) return null;
  return {
    ...details,
    source: PROVIDER_ID,
    id: details.id?.replace('anime4up:', 'anime4up_rest:') || details.id,
    ref: details.ref?.replace('anime4up:', 'anime4up_rest:') || details.ref,
    servers: (details.servers || []).map((s) => ({
      ...s,
      provider: PROVIDER_ID
    }))
  };
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  return scrapeCoreEpisodes(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
}

export async function scrapeServers(urlOrRef, options = {}) {
  const servers = await scrapeCoreServers(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  return servers.map((s) => ({
    ...s,
    provider: PROVIDER_ID
  }));
}

export async function resolveStream(urlOrRef, options = {}) {
  const res = await resolveCoreStream(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  if (!res) return null;
  return {
    ...res,
    provider: PROVIDER_ID
  };
}

// Backward-compatible named exports
export const scrapeAnime4upRestCatalog = scrapeCatalog;
export const scrapeAnime4UpRestCategory = scrapeCatalog;
export const searchAnime4UpRest = scrapeSearch;
export const scrapeAnime4upRestDetails = scrapeDetails;
export const extractAnime4UpRestStreamsAndEpisodes = async (url) => {
  const [details, servers] = await Promise.all([
    scrapeDetails(url),
    scrapeServers(url)
  ]);
  return {
    episodes: details?.episodes || [],
    servers: servers || []
  };
};

export default {
  PROVIDER_META,
  scrapeCatalog,
  scrapeSearch,
  scrapeDetails,
  scrapeEpisodes,
  scrapeServers,
  resolveStream
};
