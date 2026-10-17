# Provider review follow-up — 2026-10-17

Live probes were serialized and paced at 1.2–1.5 seconds between requests. These checks validate HTTP/parser/API behavior only; none validates playback in Flutter.

| Provider | Check time (UTC) | Domain checked | Operations exercised | Outcome | Last confirmed successful stage |
|---|---|---|---|---|---|
| QFilm | 15:04:38–15:05:15 | `a.qfilm.tv`; resolver also attempted social/player hosts including `facebook.com`, `fbsbx.com`, and `twitter.com` | API search (`Hope`) → details → not-applicable episode → resolve | Search returned one matching Hope result and details returned the expected title. Resolution did not complete: the resolver followed the embedded player into third-party page dependencies and was interrupted; no media URL/resource was verified. | Details (HTTP 200). Server resolution was attempted but is not a success. |
| Shahid4U | 15:05:34–15:05:41 | `shahidfu.cam` | API search (`Hope`) | Access/network obstacle: upstream request failed and local route returned HTTP 503 `NETWORK_TIMEOUT`. The parser change could not be revalidated live in this probe. | None (search failed). |
| YallaShoot | 15:05:49–15:06:19 | `yalla-shootz.cc` (redirected within configured host) | Today/yesterday/tomorrow catalogs → pagination → unsupported search/episodes → match details → servers → live matches → resolver contract | Catalogs, details, live listing and resolver contract passed. The selected match was upcoming; no active live server existed. Server extraction was `FIXTURE_ONLY`; no live match stream or media resource was verified. | Details/live listing (HTTP 200); live server extraction remains unverified. |

## Deterministic evidence

- QFilm active `.pm-video-thumb` catalog card: title, watch URL and `data-echo` poster parsed correctly.
- QFilm active player metadata (`twitter:player` plus iframe snippet stored in a textarea): one source-owned embed candidate parsed and explicitly marked `verified: false`.
- Shahid4U current `.br-card` card: title, URL and lazy poster parsed correctly from its captured fixture.
- Shii4U series identity survives search → details → episode details → server references in fixture tests.
- Search deadline test confirms the HTTP request returns 504 and aborts the signal even when an upstream promise ignores cancellation.
- YallaShoot catalog parser excludes cards whose only match URL is external and selects the configured source-owned match link when present.

## Remaining findings

- QFilm's HTTP resolver still follows an embed into remote page dependencies and did not produce a verified direct media resource. Keep this classified as unresolved extraction, not a successful stream.
- Shahid4U parser support is covered deterministically, but the current live host timed out during this follow-up.
- The previously observed ArabSeed host returned an account-suspended page; this is an upstream access/site-state obstacle, not a parser result to disguise as empty content.
- The observed `tv10.egydead.live/h3/` page was a VOD catalog, not a live-channel catalog. The provider's live-only capability does not match that page; it needs a separate, correctly named VOD integration before reporting it as fixed.
- CimaNow's prior `TypeError`, Laroza's missing live details/episodes, MovizTime's HTML response, and RistoAnime's unverified VidMoly resolution remain open. No change in this follow-up established those source paths.
