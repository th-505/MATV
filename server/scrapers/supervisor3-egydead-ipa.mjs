// server/scrapers/supervisor3-egydead-ipa.mjs
// Supervisor 03: Coordination & Delegation for EgyDead, IPA Universe, and 3ckTV
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeEgyDeadCat,
  scrapeDetails as scrapeEgyDeadDet,
  scrapeSearch as searchEgyDeadSite
} from './sites/egydead.mjs';

import {
  scrapeCatalog as scrapeIpaCat,
  scrapeDetails as scrapeIpaDet,
  scrapeSearch as searchIpaSite
} from './sites/ipauniverse.mjs';

import {
  scrapeCatalog as scrape3ckCat,
  scrapeDetails as scrape3ckDet,
  scrapeSearch as search3ckSite
} from './sites/3cktv.mjs';

export async function scrapeEgyDeadCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_foreign' : 'series_foreign';
  return scrapeEgyDeadCat(catKey, page);
}

export async function scrapeEgyDeadDetails(targetUrl) {
  return scrapeEgyDeadDet(targetUrl);
}

export async function scrapeIpaUniverseCatalog(type = 'movie', page = 1) {
  return scrapeIpaCat(type, page);
}

export async function scrape3ckTvCatalog(type = 'series', page = 1) {
  const catKey = type === 'movie' ? 'turkish_movies' : 'turkish_latest';
  return scrape3ckCat(catKey, page);
}

export default {
  scrapeEgyDeadCatalog,
  scrapeEgyDeadDetails,
  scrapeIpaUniverseCatalog,
  scrape3ckTvCatalog
};
