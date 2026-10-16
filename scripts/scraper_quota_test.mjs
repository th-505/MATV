import assert from 'node:assert/strict';

let requests = 0;
globalThis.fetch = async () => {
  requests += 1;
  return new Response('<html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
};
const { scrapeRealCategory } = await import('../server/scrapers/index.mjs');
await scrapeRealCategory('series-turkish', 1);
const firstPageRequests = requests;
assert.ok(firstPageRequests > 0, 'fixture should exercise a catalog request');
await scrapeRealCategory('series-turkish', 1);
assert.equal(requests, firstPageRequests, 'category page should use its short cache');
await scrapeRealCategory('series-turkish', 999);
const cappedPageRequests = requests;
await scrapeRealCategory('series-turkish', 1000);
assert.equal(requests, cappedPageRequests, 'page numbers above the cap should share the bounded cache key');
console.log('scraper category cache, request coalescing and page cap passed');
