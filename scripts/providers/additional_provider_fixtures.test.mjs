import assert from 'node:assert/strict';
import * as anime4upRest from '../../server/scrapers/sites/anime4up_rest.mjs';
import * as animeFixture from '../fixtures/providers/anime4up_rest.fixture.mjs';
import * as egydeadLive from '../../server/scrapers/sites/egydead_live.mjs';
import * as liveFixture from '../fixtures/providers/egydead_live.fixture.mjs';
import * as shii4u from '../../server/scrapers/sites/shii4u.mjs';
import * as shiiFixture from '../fixtures/providers/shii4u.fixture.mjs';
import { SCRAPER_ERROR_CODES } from '../../server/scrapers/shared/errors.mjs';

for (const [module, fixture, id] of [
  [anime4upRest, animeFixture, 'anime4up_rest'],
  [egydeadLive, liveFixture, 'egydead_live'],
  [shii4u, shiiFixture, 'shii4u']
]) assert.equal(fixture.FIXTURE_META.providerId, id);

const animeSearch = await anime4upRest.scrapeSearch('one piece', 1, { fixtureHtml: animeFixture.SEARCH_HTML });
assert.ok(animeSearch.length > 0, 'Anime4Up Rest fixture search must return a real matching sample');
assert.ok(animeSearch.every((item) => item.source === 'anime4up_rest' && item.providerId === 'anime4up_rest'));
assert.ok(animeSearch.every((item) => String(item.ref || item.id).startsWith('anime4up_rest:')));
const animeDetails = await anime4upRest.scrapeDetails(animeSearch[0].ref, { fixtureHtml: animeFixture.DETAILS_HTML });
assert.ok(animeDetails?.title, 'Anime4Up Rest details fixture should produce a title');
assert.equal(animeDetails.source, 'anime4up_rest');
assert.ok((animeDetails.episodes || []).every((episode) => episode.source === 'anime4up_rest'));

const liveCatalog = await egydeadLive.scrapeCatalog('live', 1, { fixtureHtml: liveFixture.CATALOG_HTML });
assert.ok(liveCatalog.length > 0, 'EgyDead Live fixture must contain channels');
assert.ok(liveCatalog.every((channel) => channel.source === 'egydead_live'));
const liveSearch = await egydeadLive.scrapeSearch('sports', 1, { fixtureHtml: liveFixture.CATALOG_HTML });
assert.equal(liveSearch.length, 0);
assert.equal(liveSearch._meta?.errorCode, SCRAPER_ERROR_CODES.UNSUPPORTED_CAPABILITY);

const shiiSearch = await shii4u.scrapeSearch('batman', 1, { fixtureHtml: shiiFixture.SEARCH_HTML });
assert.equal(shiiSearch.length, 1, 'Shii4U fixture search should match its one captured card');
assert.equal(shiiSearch[0].source, 'shii4u');
assert.equal(shiiSearch[0].providerId, 'shii4u');
assert.ok(shiiSearch[0].ref.startsWith('shii4u:'));
assert.equal(new URL(shiiSearch._meta.url).hostname, 'shii4u.cam', 'Shii4U requests must use its own declared host');
const shiiDetails = await shii4u.scrapeDetails(shiiSearch[0].ref, { fixtureHtml: shiiFixture.MOVIE_DETAILS_HTML });
assert.equal(shiiDetails?.source, 'shii4u');
assert.ok(String(shiiDetails?.sourceUrl || '').includes('shii4u.cam'));
assert.ok((shiiDetails?.servers || []).every((server) => server.provider === 'shii4u'));
const shiiSeriesDetails = await shii4u.scrapeDetails(shiiSearch[0].ref, { fixtureHtml: shiiFixture.SERIES_DETAILS_HTML });
assert.equal(shiiSeriesDetails?.source, 'shii4u');
assert.equal(shiiSeriesDetails?.episodes?.length, 2);
assert.ok(shiiSeriesDetails.episodes.every((episode) => episode.source === 'shii4u' &&
  episode.providerId === 'shii4u' && episode.ref.startsWith('shii4u:') && episode.url.startsWith('shii4u:')));
const shiiEpisodeDetails = await shii4u.scrapeDetails(shiiSeriesDetails.episodes[0].ref, {
  fixtureHtml: shiiFixture.EPISODE_DETAILS_HTML
});
assert.equal(shiiEpisodeDetails?.source, 'shii4u', 'opening a Shii4U episode must remain under Shii4U identity');
assert.ok(shiiEpisodeDetails?.servers?.every((server) => server.provider === 'shii4u'));
const shiiEpisodes = await shii4u.scrapeEpisodes(shiiSearch[0].ref, { fixtureHtml: shiiFixture.SERIES_DETAILS_HTML });
assert.ok(shiiEpisodes.every((episode) => episode.provider === 'shii4u' && episode.ref.startsWith('shii4u:')));

console.log('additional provider fixture assertions passed (Anime4Up Rest, EgyDead Live, Shii4U)');
