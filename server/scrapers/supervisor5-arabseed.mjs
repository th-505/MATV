// server/scrapers/supervisor5-arabseed.mjs
// Supervisor 05: Coordination & Delegation for ArabSeed, Mewsry, and Anime4Up Rest
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeArabSeedCat,
  scrapeDetails as scrapeArabSeedDet,
  scrapeSearch as searchArabSeedSite
} from './sites/arabseed.mjs';

import {
  scrapeCatalog as scrapeMewsryCat,
  scrapeDetails as scrapeMewsryDet,
  scrapeSearch as searchMewsrySite
} from './sites/mewsry.mjs';

import {
  scrapeCatalog as scrapeAnime4UpRestCat,
  scrapeDetails as scrapeAnime4UpRestDet,
  scrapeSearch as searchAnime4UpRestSite
} from './sites/anime4up_rest.mjs';

export async function scrapeArabSeedCatalog(type = 'movie', page = 1) {
  const catKey = type === 'movie' ? 'movies_foreign' : 'series_foreign';
  return scrapeArabSeedCat(catKey, page);
}

export async function scrapeArabSeedDetails(targetUrl) {
  return scrapeArabSeedDet(targetUrl);
}

export async function scrapeMewsryCatalog(type = 'movie', page = 1) {
  return scrapeMewsryCat(type, page);
}

export async function scrapeAnime4upRestCatalog(type = 'series', page = 1) {
  const catKey = type === 'movie' ? 'anime_movies' : 'anime_series';
  return scrapeAnime4UpRestCat(catKey, page);
}

export default {
  scrapeArabSeedCatalog,
  scrapeArabSeedDetails,
  scrapeMewsryCatalog,
  scrapeAnime4upRestCatalog
};
