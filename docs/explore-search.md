# Explore search integration

This change is stacked on PR #1 (`fix/provider-integration`), commit
`c7b65da` (synchronized from the repair branch during review). Merge PR #1 first, then retarget
this PR to main. No commits were pushed to the repair branch, and no scraper,
provider implementation, reference encoder, server code mapping, storage key or
license notice was changed.

The existing `/api/v1/search?q=...&provider=...` route actually calls
`searchProviderCatalog` for the original provider ID. Its HTTP contract includes
200/no_results, 422/unsupported and 503/error. The web client now preserves those
search envelopes instead of discarding them on non-2xx responses. Flutter maps
422 to an explicit unsupported message and accepts no_results as an empty list.
Search requests allow 90 seconds, covering PR #1's bounded backend search budget.

## Additive shared contract

`GET /api/v1/search/providers` exposes presentation metadata derived from the
existing scraper registry: `id`, `displayName`, `aliases`, `domains`, and
`supportsSearch`. The existing `/api/v1/providers` status endpoint is unchanged.
This is necessary because that status endpoint lists only four legacy runtime
providers and does not describe the full registry's search capabilities.

`server/source-display.mjs` transforms the original name at that boundary. It
trims whitespace, removes one Unicode code point, and prefixes Arabic names with
ذ or English names with th. Numerically prefixed names follow the script of the
first letter (numeric-only Arabic/ASCII names follow their first digit's script).
Compound registry names are parsed into a primary name and parenthesized
alternatives, each transformed separately (including slash-separated aliases).
The endpoint also provides these as `displayNames.primary` and
`displayNames.alternatives`, separate from internal identity.
All clients use the resulting displayName directly; they do not transform it
again. A newly registered source therefore appears without per-screen name maps.
Aliases, domains and IDs are read only for identity matching, never renamed.
Server labels are outside this presentation policy. The policy lives under
`server/` so production includes it without copying web assets. Packaging inspection
also found that PR #1 imports `edge/src/laroza.mjs`, while Docker copied only
`edge/src/provider.mjs`. This PR changes that COPY to include `edge/src/`, preserving
the existing files and satisfying the repair branch's runtime imports.

Both HTML entry points and Flutter retain general search and offer an explicit
source selector. A custom search never invokes general/TMDb search as fallback.
Results and details use the same display metadata. Requests from a previous
query/source cannot overwrite newer results. Search results do not trigger an
unrelated movie-category load when the main web UI switches tabs.

## Validation (2026-10-17)

- `npm run check`: passed, including provider, security, runtime HTTP, detail,
  episode and server-code contract checks inherited from PR #1.
- `npm run test:explore`: passed. Policy fixtures cover Arabic, English, surrounding
  whitespace, numeric prefixes, supplementary Unicode and empty names. Real local
  HTTP/client tests preserve queries, IDs, aliases and references across success,
  no_results, unsupported and error responses.
- Chromium tests run both actual HTML entry points at a 390px phone viewport with
  intercepted provider fixtures: new source options, general/custom searches,
  loading, no results, 422, 503, stale responses, source labels in results/details,
  and episode rendering. Service workers and external player scripts are disabled
  for deterministic fixtures. These are not live provider or video playback tests.
- `node scripts/ma_nexus_v8_test.mjs` and `git diff --check`: passed after final edits.
- Added `flutter_app/test/explore_search_test.dart`; Flutter/Dart SDKs are absent
  from this environment, so native tests, analysis and formatting could not run.
  Run `flutter analyze` and `flutter test` (including the API and widget tests) before
  shipping the native client.
- Production file-layout import check: passed after the Docker COPY fix. Before
  that fix the copied runtime failed with `ERR_MODULE_NOT_FOUND` for
  `edge/src/laroza.mjs`. This checks Node imports, not a full Docker image build.
- No live video playback, native playback, or deployed-backend migration was tested.
  Deploy the additive backend route together with/before these client changes.
