// server/scrapers/sites/shii4u.mjs
// Standalone provider module for شي فور يو (Shii4U, code: SH)
// Shares parser code with Shahid4U, but requests its own declared host and identity.

import {
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
  domains: Object.freeze([PRIMARY_BASE_URL]),
  mirrorOf: null,
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
  mirrorOf: null
});

const coreOptions = (options = {}) => ({ ...options, baseUrl: PRIMARY_BASE_URL, providerId: PROVIDER_ID });
const toCoreRef = (value) => typeof value === 'string' && value.startsWith('shii4u:')
  ? `shahid4u:${value.slice('shii4u:'.length)}` : value;
const toShiiRef = (value) => {
  if (typeof value !== 'string' || !value) return value;
  if (value.startsWith('shii4u:')) return value;
  if (value.startsWith('shahid4u:')) return `shii4u:${value.slice('shahid4u:'.length)}`;
  if (/^https?:\/\//i.test(value)) return `shii4u:${Buffer.from(value).toString('base64url')}`;
  return value;
};
const mapEpisode = (episode = {}, index = 0) => {
  const target = episode.url || episode.ref || episode.id || episode.link || '';
  const ref = toShiiRef(target);
  return {
    ...episode,
    id: toShiiRef(episode.id) || ref || `shii4u:episode-${index + 1}`,
    ref: toShiiRef(episode.ref) || ref,
    url: ref,
    source: PROVIDER_ID,
    provider: PROVIDER_ID,
    providerId: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE
  };
};
const mapServer = (server = {}, index = 0) => ({
  ...server,
  source: PROVIDER_ID,
  provider: PROVIDER_ID,
  providerId: PROVIDER_ID,
  code: `${PROVIDER_CODE}-${index + 1}`,
  serverCode: `${PROVIDER_CODE}-${index + 1}`
});
function preserveMeta(mapped, original) {
  if (original?._meta) attachResultMeta(mapped, { ...original._meta, providerId: PROVIDER_ID });
  return mapped;
}

export async function scrapeCatalog(category = 'movies_foreign', page = 1, options = {}) {
  const items = await scrapeShahidCatalog(category, page, coreOptions(options));
  return preserveMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    providerId: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE,
    id: it.id?.replace('shahid4u:', 'shii4u:') || it.id,
    ref: it.ref?.replace('shahid4u:', 'shii4u:') || it.ref
  })), items);
}

export async function scrapeSearch(query, page = 1, options = {}) {
  const items = await scrapeShahidSearch(query, page, coreOptions(options));
  return preserveMeta(items.map((it) => ({
    ...it,
    source: PROVIDER_ID,
    providerId: PROVIDER_ID,
    serverPrefix: PROVIDER_CODE,
    id: it.id?.replace('shahid4u:', 'shii4u:') || it.id,
    ref: it.ref?.replace('shahid4u:', 'shii4u:') || it.ref
  })), items);
}

export async function scrapeDetails(urlOrRef, options = {}) {
  const details = await scrapeShahidDetails(toCoreRef(urlOrRef), coreOptions(options));
  if (!details) return null;
  return {
    ...details,
    source: PROVIDER_ID,
    providerId: PROVIDER_ID,
    id: details.id?.replace('shahid4u:', 'shii4u:') || details.id,
    ref: details.ref?.replace('shahid4u:', 'shii4u:') || details.ref,
    episodes: (details.episodes || []).map(mapEpisode),
    servers: (details.servers || []).map(mapServer)
  };
}

export async function scrapeEpisodes(urlOrRef, options = {}) {
  const episodes = await scrapeShahidEpisodes(toCoreRef(urlOrRef), coreOptions(options));
  return preserveMeta((episodes || []).map(mapEpisode), episodes);
}

export async function scrapeServers(urlOrRef, options = {}) {
  const servers = await scrapeShahidServers(toCoreRef(urlOrRef), coreOptions(options));
  return (servers || []).map(mapServer);
}

export async function resolveStream(urlOrRef, options = {}) {
  const res = await resolveShahidStream(toCoreRef(urlOrRef), coreOptions(options));
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
