// server/scrapers/supervisor6-witanime-live.mjs
// Supervisor 06: Coordination & Delegation for WitAnime, EgyDead Live, and YallaShoot
// ZERO inline Cheerio HTML scraping selectors. Pure delegation to dedicated modules.

import {
  scrapeCatalog as scrapeWitAnimeCat,
  scrapeDetails as scrapeWitAnimeDet,
  scrapeSearch as searchWitAnimeSite
} from './sites/witanime.mjs';

import {
  scrapeCatalog as scrapeEgyDeadLiveCat,
  scrapeDetails as scrapeEgyDeadLiveDet
} from './sites/egydead_live.mjs';

import {
  scrapeLive as scrapeYallaShootLive,
  scrapeCatalog as scrapeYallaShootCat,
  scrapeDetails as scrapeYallaShootDet
} from './sites/yallashoot.mjs';

export async function scrapeWitAnimeCatalog(type = 'series', page = 1) {
  const catKey = type === 'movie' ? 'anime_movies' : 'anime_series';
  return scrapeWitAnimeCat(catKey, page);
}

export async function scrapeWitAnimeDetails(targetUrl) {
  return scrapeWitAnimeDet(targetUrl);
}

export async function scrapeEgyDeadLiveChannels() {
  return scrapeEgyDeadLiveCat('live', 1);
}

export async function scrapeYallaShootMatches() {
  return scrapeYallaShootLive();
}

export default {
  scrapeWitAnimeCatalog,
  scrapeWitAnimeDetails,
  scrapeEgyDeadLiveChannels,
  scrapeYallaShootMatches
};
