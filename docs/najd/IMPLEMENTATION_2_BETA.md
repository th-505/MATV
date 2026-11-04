# Najd TV 2.0.0 beta 1 — implementation evidence

Source work branch: `feat/najd-2-beta`. Product version 2.0.0, native build 200. This document is an implementation checkpoint, not a claim that a release or public deployment has completed.

## Implemented in production widgets and APIs

- Player has a black surface independent of the browsing theme, white controls, one back action and a centered episode title. Removed the tall footer gradient and duplicate app bar. Larger transport controls retain keyboard focus; the compact footer exposes episodes, audio/subtitles and More. More contains sources, provider catalogues, actual quality tracks, speed, fit/fill/stretch/original size, zoom and download actions.
- Temporary hold boost defaults to 2x and supports a user-selected rate through 4x. Touch release/cancel, lifecycle changes and source-panel entry restore the previous rate through a serialized native operation queue. Native failures do not leave a successful boost badge. Remote media-fast-forward repeat/up hooks are implemented; physical remote certification is pending.
- Intro closes at 10 seconds; Continue becomes available after 3 seconds. Original poetry and attribution are preserved.
- Smaller portrait detail poster; photographed cast/director cards; a dedicated filmography route renders poster cards and keeps director credits alongside acting credits.
- Global and per-view Arabic/English metadata choice. Auto uses English for originally English works and Arabic otherwise. Server metadata caches include language. Display translations never rewrite source-owned episode references or numbering.
- Parallel provider search remains bounded to six concurrent sources. Its poster groups retain every original candidate and keep explicit year conflicts and provider-specific dubbed editions separate. Provider candidates survive details/player navigation; results arriving after the details page opens update the retained group. Search service failures no longer falsely assert that the device has no internet.
- Beta 1 provider browser has its own setting, drawer route, selected provider, registered categories, search and paginated catalogue. It does not mutate normal browsing preferences. Invalid category paths cannot call a scraper. Upstream failure diagnostics are not converted into successful empty results.
- Removed redundant shell search shortcut and regional drawer shortcuts; the library is consistently named قائمتي. Compact appearance options, favorites rating sort, and history completion filters/title/progress sorting are implemented.
- Download selection refuses near-expiry links and distinguishes source preparation, non-downloadable HLS, expired/denied links and malformed files. Existing resumable MP4 downloads and file safeguards remain. Offline HLS downloading is not implemented and is not claimed.
- Account links now use the confirmed public target `https://th-505.github.io/MATV/`. Sender/receiver/approval instructions distinguish a three-minute ticket from seven-day/permanent grants. Polling does not overlap; retry and ownership failures have specific messages.
- Fosta is an independent module, using observed search/card/detail/season/player routes. Its 104 category routes and Arabic labels were observed on the homepage. Episode pages follow only an actual observed parent-series link. Movie pages never manufacture episodes. Embedded hosts never become direct media merely by being listed.

## Verification performed

- Flutter: full checkpoint 337 passed / 7 conditional skips; affected final navigation/player/settings checks then passed (21 tests), including a provider arriving after details opens. Hosted target checks run on the immutable build source.
- Node test suite: 130 passed / 0 failed at the recorded checkpoint. New Fosta/browser fixtures: 5 passed; shared provider fixture suite: 69 passed with zero network attempts. Required `npm run check`, continuation checks, TMDB language-cache tests and maintenance verification tests passed at their recorded checkpoints.
- Supabase live rollback QA: permanent and weekly create/claim/approve, shared favorite/history reads, bidirectional progress changes, unrelated-owner isolation and revocation all passed. Test users and library rows were rolled back. This verifies database RPC behavior, not a physical two-device SDK session. Reproducible test: `scripts/qa_najd_library_link.sql`.
- Chromium opened a locally built `/MATV/` Flutter bundle with no JavaScript page errors. The preview blocked production anonymous signup. Original private fonts were excluded from this public preview. Native user-font input is prepared separately, outside Git.
- Actual light/dark native widget captures are in `/workspace/artifacts/najd-beta2-proof`. They are verification artifacts, not a catalogue counted as newly integrated application screens.

## Publication and outstanding work

- Public Pages workflow builds the actual application for `/MATV/`, verifies its source manifest/private-font boundary, and deploys an Actions artifact. It has not yet been executed. Current Pages configuration still uses the legacy `main:/` source until publication is deliberately switched.
- Unified native build jobs can accept the pinned original font bundle without committing originals. Private font preparation now uses the active Python executable on Windows as well as macOS/Linux.
- Gemini's existing bounded schema, known-positive/negative verification and privacy checks were reviewed. The local environment has no configured Gemini key. A hosted API-probe-only run (41770821286) succeeded with models/gemini-3.5-flash-lite and both configured credentials, without repairs or GitHub issue updates.
- Initial live provider audits are recorded in SOURCE_AUDIT_2_BETA.md; applicable repairs and production comparison remain in progress. Availability failures, empty extraction, title filtering, indexing and actual container checks must be reported separately. No claim that every provider plays a film/series is made from fixtures or HEAD requests.
- Remaining release gates: finish live film/series/episode/media checks and applicable repairs, verify actual native UI state coverage, final full checks, deploy matching backend/web, build all requested binaries, verify hashes/source manifests, then publish direct release URLs. No 250–350 screen completion claim is made by multiplying catalogue entries.

Review draft: https://github.com/th-505/MATV/pull/9. Build-only six-target run: 41770848603, source 7ae0398c352762b022ce9df32158c377565f068e. Publication remains pending.


## Follow-up verification

- Supplemental actual-widget matrix: `qa/najd_beta_ui_matrix_test.dart`. All five profiles passed (320×568, 390×844, 1024×768, 1280×800, 1920×1080), each with 34 production-widget states in light and dark: 340 verified render-state checks, not 340 independent screens. Captures and ten 34-entry manifests are local verification artifacts under `/workspace/artifacts/najd-beta200-ui-matrix`. Network data and media engine are fixtures; this does not certify physical-device decoding.
- First hosted build completed Windows, macOS, unsigned iOS and Android mobile. TV verification found offscreen test taps; scrolling the actual option/episode into the visible viewport fixed the six affected checks, including the 20-minute source handoff. Web smoke was waiting for the former watch label; it now targets the actual exact `مشاهدة` action. Fresh hosted verification is required before release.
- Public Pages also builds on relevant pull requests; deployment remains restricted to manual workflow dispatch. Review builds cannot deploy the site.

- CimaNow follow-up: owned references decode before URL validation; resolve POST now uses guarded bounded HTTP with DNS/redirect checks and validates returned targets. Three regression tests pass. Arabic ordinal season names in hyphenated source URLs now preserve the observed season (season four no longer defaults to one). The existing real-shaped fixture expectation was corrected from one to its observed fourth season. Follow-up Node suite: 135 passed; provider fixtures: 69 passed without network. Live CimaNow still lacks verified playback: the tested movie candidate was access-blocked, and the new series sample returned a generic page without its episode index.


## Dynamic sources and NajdTV rename follow-up

- Confirmed repository identity 1415857544 is now `th-505/NajdTV`; GitHub Pages reports `/NajdTV/`. Updated active integrations, local remote, source archive links, account-link URL, Pages asset base, sitemap/robots and strictly scoped GitHub maintenance OIDC claims. Stable application IDs, storage keys and database identifiers remain intact. Render's confirmed workspace is MATV; its existing API address remains `https://matv.onrender.com` for installed-client compatibility.
- Removed the native client's functional provider-name allowlist. Unknown future source IDs use fixed harvest APIs and source-owned indexes; the server retains registry, host and SSRF enforcement. An end-to-end transport regression checks a provider named only by the server. Diagnostic provider fields still require a server-observed name or the source-work identity, so arbitrary private text is not reported.
- Added independent Brstej (`brstej`, BR) with 24 observed categories. Film and series live checks both verified HLS containers. Real sanitized fixture retains 352 source references through episode 351 in 3 seasons, without list-position episode numbering or artificial truncation. Registry now has 21 independent sources plus 2 mirrors.
- Added metadata-only `/api/v1/sources` protocol manifest; existing dynamic search/browser APIs remain compatible. See `DYNAMIC_SOURCES.md` for adding a scraper on the existing server and the one-time update requirement for old client binaries.
- Chromium revealed inherited HTML RTL direction incorrectly doubled accessibility-node horizontal offsets. The DOM host now uses physical LTR coordinates while Flutter localizations and Arabic UI remain RTL. Real pointer smoke tests now decode generated MP4 and HLS fixtures with no page exceptions, without forcing clicks or disabling visibility checks.

Final follow-up verification before pushing this checkpoint: Flutter 340 passed / 7 conditional skips; analyzer clean; Node 140 passed; shared provider fixtures 72 passed / 0 network attempts; required check and continuation suites passed. MP4 and HLS Chromium fixture decoding passed with real visible-button clicks and zero page exceptions. Deployment and new binaries remain separate release gates.


## Release adaptation follow-up

The app root now stores its latest viewport profile in local settings under `najd.viewport.profile.v1`, without a user-facing screen or cloud upload. It records logical/physical pixels, pixel ratio, safe insets, accessibility text scale, orientation, TV text multiplier and control minimum. Values are measured again on resize/rotation and writes are serialized; saved data never overrides new device metrics. Physical screen inches are deliberately not guessed.

Narrow desktop windows now use the same width-based navigation breakpoint as handheld layouts. A stable content tree preserves loaded page state across the breakpoint rather than issuing another catalogue request. Regression tests cover live desktop resizing, local profile replacement and TV text scaling. Release notes identify 2.0.0 as beta and link the public NajdTV Pages application.
