// server/scrapers/supervisor1-mycima.mjs
// Supervisor 01: Coordination & Delegation for MyCima, CimaNow, and Akoam
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeMyCimaCat,
  scrapeDetails as scrapeMyCimaDet,
  scrapeSearch as searchMyCimaSite
} from './sites/mycima.mjs';

import {
  scrapeCatalog as scrapeCimaNowCat,
  scrapeDetails as scrapeCimaNowDet,
  scrapeSearch as searchCimaNowSite
} from './sites/cimanow.mjs';

import {
  scrapeCatalog as scrapeAkoamCat,
  scrapeDetails as scrapeAkoamDet,
  scrapeSearch as searchAkoamSite
} from './sites/akwam.mjs';

export async function scrapeMyCimaCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_all' : 'series_foreign';
  return scrapeMyCimaCat(catKey, page);
}

export async function scrapeMyCimaDetails(targetUrl) {
  return scrapeMyCimaDet(targetUrl);
}

export async function scrapeCimaNowCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_foreign' : 'series_foreign';
  return scrapeCimaNowCat(catKey, page);
}

export async function scrapeAkoamCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_all' : 'series_all';
  return scrapeAkoamCat(catKey, page);
}

export default {
  scrapeMyCimaCatalog,
  scrapeMyCimaDetails,
  scrapeCimaNowCatalog,
  scrapeAkoamCatalog
};
