// server/scrapers/supervisor4-anime4up.mjs
// Supervisor 04: Coordination & Delegation for Anime4Up, QFilm, and RistoAnime
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeAnime4UpCat,
  scrapeDetails as scrapeAnime4UpDet,
  scrapeSearch as searchAnime4UpSite
} from './sites/anime4up.mjs';

import {
  scrapeCatalog as scrapeQfilmCat,
  scrapeDetails as scrapeQfilmDet,
  scrapeSearch as searchQfilmSite
} from './sites/qfilm.mjs';

import {
  scrapeCatalog as scrapeRistoCat,
  scrapeDetails as scrapeRistoDet,
  scrapeSearch as searchRistoSite
} from './sites/ristoanime.mjs';

export async function scrapeAnime4upCatalog(type = 'series', page = 1) {
  const catKey = type === 'movie' ? 'anime_movies' : 'anime_series';
  return scrapeAnime4UpCat(catKey, page);
}

export async function scrapeAnime4upDetails(targetUrl) {
  return scrapeAnime4UpDet(targetUrl);
}

export async function scrapeQfilmCatalog(type = 'movie', page = 1) {
  return scrapeQfilmCat(type, page);
}

export async function scrapeRistoCatalog(page = 1) {
  return scrapeRistoCat('series', page);
}

export default {
  scrapeAnime4upCatalog,
  scrapeAnime4upDetails,
  scrapeQfilmCatalog,
  scrapeRistoCatalog
};
