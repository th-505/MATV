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

## Targeted repairs after the 15:04–15:06 probe (2026-10-17 15:33 UTC)

These results supersede the earlier “remaining findings” for the repaired providers. Live checks were limited to changed sources; Shahid4U and inactive YallaShoot were not rechecked.

| Provider | Domain / sample | Operations now evidenced | Result | Last successful stage |
|---|---|---|---|---|
| CimaNow | `cimanow.me`; live movie “Masterplan 2026” | Catalog → search → details → episodes → servers → resolve | Reproduced and removed the TypeError path. All content stages returned data; resolver now returns an explicitly unverified embed instead of passing the entire HTML page into recursive unwrapping. No in-app playback claim. | Resolve returned `EMBED_UNVERIFIED`; no direct media was verified. |
| MovizTime | `moviz-time.quest`; live movie “Norm: The Tale of Norm MacDonald 2026” | Catalog → search → details → servers → resolve; media candidate probe | Candidate player endpoint returned HTML and is no longer returned as direct media. The resolver falls back to the source player as an unverified embed. | Resolver returned `EMBED_UNVERIFIED`; direct media unavailable in this check. |
| RistoAnime | `ristoanime.me`; VidMoly candidate `vidmoly.net` | Catalog → search → details → episodes → servers → resolve; HLS manifest probe attempted | VidMoly JSON/escaped URL parsing and redirect traversal were improved. Resolver extracted a tokenized `.m3u8` candidate. Fetching its manifest failed from this environment, so manifest and segment remain unverified. | Direct HLS URL candidate only; manifest fetch failed (`fetch failed`). |
| Laroza | Real catalog result `Tulsa King مترجم` (Edge-backed detail) | Series catalog → details → episodes → servers → resolve | Real title and 2 episodes extracted; 4 player candidates returned. Resolver returns an unverified player embed. Direct origin domains remain inaccessible from this environment; no direct media was verified. | Four server candidates; playback candidate remains embed. |
| ArabSeed | `www.arabseed.wine` | Live catalog probe; suspended-page detection also covered in fixtures | Returned `SOURCE_UNAVAILABLE` / `ACCOUNT_SUSPENDED`, not an empty catalog. | Account state diagnosed; source is unavailable upstream. |
| EgyDead Live | Fixture containing VOD-only HTML | Live capability contract | Empty channel parse now reports `UNSUPPORTED_CAPABILITY` / `LIVE_CHANNEL_SOURCE_UNAVAILABLE`; no VOD identity substitution. | No verified live channel source. |
| QFilm | Deterministic fixtures; no new live probe | Social/share filtering; bounded resolver request budget | Facebook/X/Instagram (including subdomains) are excluded. QFilm API path preserves its own unverified embed; opt-in unwrap is bounded to 1 candidate, 6 total HTTP hops including redirects, and 9 seconds. A redirect budget regression test verifies that an over-budget hop is not fetched. | Fixture/API behavior verified; current live player resolution remains unverified. |

### Validation after the repairs

- Targeted fixture suites for CimaNow, MovizTime, RistoAnime, Laroza, ArabSeed, QFilm, and EgyDead passed.
- `node scripts/stream_unwrapper_budget_test.mjs` passed; redirect hops count toward the total request budget.
- `npm run check` passed after all code changes, including provider, security, and HTTP integration suites.
- No Flutter, Safari, Android, or desktop playback session was run. HTTP candidates and parser results are not represented as in-app playback.
