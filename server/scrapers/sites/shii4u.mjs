// server/scrapers/sites/shii4u.mjs
// Standalone provider module for شي فور يو (Shii4U, code: SH)
// Explicit mirror / sister variant of Shahid4U (shahid4u, code: SU)

import {
  PROVIDER_ID as SHAHID_ID,
  PRIMARY_BASE_URL as SHAHID_BASE_URL,
  extractShahid4uCardsFromHtml,
  scrapeCatalog as scrapeShahidCatalog,
  scrapeSearch as scrapeShahidSearch,
  scrapeDetails as scrapeShahidDetails,
  scrapeEpisodes as scrapeShahidEpisodes,
  scrapeServers as scrapeShahidServers,
  resolveStream as resolveShahidStream
} from './shahid4u.mjs';
import { attachResultMeta } from '../shared/errors.mjs';

export const PROVIDER_ID = 'shii4u';
export const PROVIDER_NAME = 'شي فور يو (Shii4U)';
export const PROVIDER_CODE = 'SH';
export const PRIMARY_BASE_URL = 'https://shii4u.cam';

export const PROVIDER_META = Object.freeze({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  domains: Object.freeze([PRIMARY_BASE_URL, SHAHID_BASE_URL]),
  mirrorOf: SHAHID_ID,
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
    pathTemplate: '/search?s={query}',
    queryParam: 's',
    encoding: 'utf-8',
    pagination: false
  }),
  notImplemented: Object.freeze({})
});

export const SHII4U_CONFIG = Object.freeze({
  key: PROVIDER_ID,
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  code: PROVIDER_CODE,
  baseUrl: PRIMARY_BASE_URL,
  mirrorOf: SHAHID_ID
});

export async function scrapeCatalog(category = 'movies_foreign', page = 1, options = {}) {
  const items = await scrapeShahidCatalog(category, page, {
    ...options,
    providerId: PROVIDER_ID
  });
  return attachResultMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE,
    id: it.id?.replace('shahid4u:', 'shii4u:') || it.id,
    ref: it.ref?.replace('shahid4u:', 'shii4u:') || it.ref
  })), { ...items._meta, providerId: PROVIDER_ID });
}

export async function scrapeSearch(query, page = 1, options = {}) {
  const items = await scrapeShahidSearch(query, page, {
    ...options,
    providerId: PROVIDER_ID
  });
  return attachResultMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE,
    id: it.id?.replace('shahid4u:', 'shii4u:') || it.id,
    ref: it.ref?.replace('shahid4u:', 'shii4u:') || it.ref
  })), { ...items._meta, providerId: PROVIDER_ID });
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const details = await scrapeShahidDetails(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  if (!details) return null;
  return {
    ...details,
    source: PROVIDER_ID,
    id: details.id?.replace('shahid4u:', 'shii4u:') || details.id,
    ref: details.ref?.replace('shahid4u:', 'shii4u:') || details.ref,
    servers: (details.servers || []).map((s, idx) => ({
      ...s,
      provider: PROVIDER_ID,
      code: `${PROVIDER_CODE}-${idx + 1}`,
      serverCode: `${PROVIDER_CODE}-${idx + 1}`
    }))
  };
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  return scrapeShahidEpisodes(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
}

export async function scrapeServers(urlOrRef, options = {}) {
  const servers = await scrapeShahidServers(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  return servers.map((s, idx) => ({
    ...s,
    provider: PROVIDER_ID,
    code: `${PROVIDER_CODE}-${idx + 1}`,
    serverCode: `${PROVIDER_CODE}-${idx + 1}`
  }));
}

export async function resolveStream(urlOrRef, options = {}) {
  const res = await resolveShahidStream(urlOrRef, {
    ...options,
    providerId: PROVIDER_ID
  });
  if (!res) return null;
  return {
    ...res,
    provider: PROVIDER_ID,
    code: `${PROVIDER_CODE}-1`
  };
}

// Backward-compatible named exports
export const scrapeShii4uCatalog = scrapeCatalog;
export const scrapeShii4uCategory = scrapeCatalog;
export const searchShii4u = scrapeSearch;
export const scrapeShii4uDetails = scrapeDetails;
export const extractShii4uStreamsAndEpisodes = async (url) => {
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
