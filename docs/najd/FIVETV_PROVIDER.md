# 5TV provider: Najd and beta

`server/scrapers/sites/fivetv.mjs` is registered once. Najd discovery/search uses
the capability registry; beta uses the same parser through its independent
AsyncLocalStorage configuration lane, catalog service and source-work index.
There are no copied client pages, third-party fonts, images or page scripts in
the application bundle. The 118 MB user capture remains outside Git.

## Observed contract

- Search: GET `/search/?q=...`; continuation metadata comes from actual next links.
- Public catalogs: home, latest series, movies, episodes and new rows.
- Card templates: home posters, home episodes, taxonomy cards, status rows and hero slides.
- Series and episode pages use different episode-card classes; both are parsed.
  Numbers come from the visible episode label, seasons from `data-season-panel`.
  Unknown numbers stay unavailable, never ordinal positions in the extracted list.
- The explicit episode-poster backlink identifies the original series in both
  canonical harvesting and beta. Public navigation links preserve next/previous references.
- Only public watch controls supply servers. Ads, downloads, disabled controls
  and VIP controls are excluded. Embeds and extracted streams remain unverified
  until the existing media pipeline probes them.
- The live redirect chain included `ho35284qa.5ivtv.in` and the public
  `ur5ive.vip` availability-check hop before returning to `new61.5tv.lol`.
  The latter is allowed only as a network hop, never a content domain.
  Every hop retains guarded HTTPS/DNS/redirect/size/time validation.
- Domain/search changes use the existing scoped provider configuration. Najd and
  beta settings do not overwrite one another. No schema migration is required.

## Evidence, 2026-11-06

Private capture audit: 645 records, including 287 HTML pages. Parsed 151 detail
pages and 132 catalog pages with zero parser failures. Four service pages
(`/vip/`, `/schedule/`, `/my-list/`, `/discover/`) are outside this catalog parser.
The audit observed 2,423 card occurrences, 1,817 episode-reference occurrences
and 273 watch-server occurrences; these are not unique work/episode counts.

Live guarded HTTP checks: series catalog returned 24 cards; one live series
detail returned 54 episodes; search for the known captured title returned four
results; a nonexistent query returned the explicit empty-search state.
One live movie exposed six public watch controls. Resolution attempts for the
first two returned `SERVER_EXTRACTION_FAILED` and `NETWORK_TIMEOUT` respectively.
No live direct-media/container or physical-device playback success is claimed.

The registry now has 25 modules, including two explicit mirrors, versus 24
previously. There are 23 search-capable entries and 23 independent catalog
entries available to beta. These are overlapping execution views, not 50
independent upstream sites or 50 copied scraper implementations.

## Reproduction

```sh
node --test tests/fivetv-provider.test.mjs
node --test tests/*.test.mjs
npm run test:continuation
python3 scripts/provider_inventory.py --check
node scripts/fivetv_capture_audit.mjs /private/site-capture.json
```

The committed fixture excerpts are sanitized public DOM structures: no cookies,
inline scripts, nonces, auth settings, video bytes, fonts or user export archive.
Tests cover both entry paths, separate scoped domains/search paths, observed
redirects, source parent traversal, actual large episode numbers, rejection of
unsafe references, VIP/ad exclusions and availability-vs-empty distinctions.
New source metadata is discovered through existing API endpoints; no Flutter
rebuild is needed solely to add this server-side provider. Deployment of the
server change and independent review/release gates remain separate steps.
