// server/scrapers/supervisor2-shahid-moviz.mjs
// Supervisor 02: Coordination & Delegation for Shahid4U, Moviz Time, and Shii4U
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeShahidCat,
  scrapeDetails as scrapeShahidDet,
  scrapeSearch as searchShahidSite
} from './sites/shahid4u.mjs';

import {
  scrapeCatalog as scrapeMovizCat,
  scrapeDetails as scrapeMovizDet,
  scrapeSearch as searchMovizSite
} from './sites/moviztime.mjs';

import {
  scrapeCatalog as scrapeShiiCat,
  scrapeDetails as scrapeShiiDet,
  scrapeSearch as searchShiiSite
} from './sites/shii4u.mjs';

export async function scrapeShahid4uCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_foreign' : 'series_foreign';
  return scrapeShahidCat(catKey, page);
}

export async function scrapeMovizTimeCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_all' : 'series_all';
  return scrapeMovizCat(catKey, page);
}

export async function scrapeShii4uCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_foreign' : 'series_foreign';
  return scrapeShiiCat(catKey, page);
}

export default {
  scrapeShahid4uCatalog,
  scrapeMovizTimeCatalog,
  scrapeShii4uCatalog
};
