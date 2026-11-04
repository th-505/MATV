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

- Flutter: 333 passed / 7 conditional skips before the final poster-group additions; affected group/navigation tests then passed, including a provider arriving after details opens. A final full run is required after the last edits.
- Node test suite: 130 passed / 0 failed at the recorded checkpoint. New Fosta/browser fixtures: 5 passed; shared provider fixture suite: 69 passed with zero network attempts. Required `npm run check`, continuation checks, TMDB language-cache tests and maintenance verification tests passed at their recorded checkpoints.
- Supabase live rollback QA: permanent and weekly create/claim/approve, shared favorite/history reads, bidirectional progress changes, unrelated-owner isolation and revocation all passed. Test users and library rows were rolled back. This verifies database RPC behavior, not a physical two-device SDK session. Reproducible test: `scripts/qa_najd_library_link.sql`.
- Chromium opened a locally built `/MATV/` Flutter bundle with no JavaScript page errors. The preview blocked production anonymous signup. Original private fonts were excluded from this public preview. Native user-font input is prepared separately, outside Git.
- Actual light/dark native widget captures are in `/workspace/artifacts/najd-beta2-proof`. They are verification artifacts, not a catalogue counted as newly integrated application screens.

## Publication and outstanding work

- Public Pages workflow builds the actual application for `/MATV/`, verifies its source manifest/private-font boundary, and deploys an Actions artifact. It has not yet been executed. Current Pages configuration still uses the legacy `main:/` source until publication is deliberately switched.
- Unified native build jobs can accept the pinned original font bundle without committing originals. Private font preparation now uses the active Python executable on Windows as well as macOS/Linux.
- Gemini's existing bounded schema, known-positive/negative verification and privacy checks were reviewed. The local environment has no configured Gemini key. An API-probe-only workflow mode avoids repairs and GitHub issue updates; hosted availability still needs verification.
- Final live provider audit is in progress. Availability failures, empty extraction, title filtering, indexing and actual container checks must be reported separately. No claim that every provider plays a film/series is made from fixtures or HEAD requests.
- Remaining release gates: finish live film/series/episode/media checks and applicable repairs, verify actual native UI state coverage, final full checks, deploy matching backend/web, build all requested binaries, verify hashes/source manifests, then publish direct release URLs. No 250–350 screen completion claim is made by multiplying catalogue entries.
