# PR #2 review fixes

The branch was synchronized with `fix/provider-integration` at `c7b65da` using a
merge commit, preserving both histories. There are no scraper changes in this
feature branch's diff against the synchronized repair branch. Neither PR is merged.

| Review finding | Fix | Evidence |
| --- | --- | --- |
| Editing/clearing leaves the web spinner running | Shared ExploreRequest aborts transport and advances generation; input renders a prompt immediately | Chromium: slow request then edit without submit, clear, and source change on both entry points; actual abort observed; cancellation also deliberately ignored to prove generation guards |
| Search completes after navigation | Home, tab/category and detail transitions invalidate search ownership and pending requests | Chromium waits for old fixture response after each destination, then compares active view ID and content and asserts absence of old search cards |
| Compound names leave English aliases unchanged | Parse original presentation name into primary/parenthesized slash-separated names and transform each once; expose structured displayNames alongside displayName | Policy/HTTP tests cover actual أكوام (Akwam) and ماي سيما (MyCima / WeCima), numbers, Arabic digits, supplementary Unicode, empty names and repeated sourceLabel rendering; registry identity remains original |
| Flutter details depend on visiting explore first | Shared per-API metadata cache with in-flight coalescing, failure retry and change notifications; details load metadata on entry, rebuild on completion, expose retry | Added explore_widget_test.dart: favorite→details without SearchPage, delayed metadata, concurrent consumer, 503→retry→success, original refs; **not executed: SDK unavailable** |
| Web source list has no retry | Shared picker renders loading/error/retry state; duplicate attempts coalesce, success replaces options and clears failure; general search stays available | Chromium: first metadata request 503, general search succeeds before retry, double-click retry produces only one second request, options contain unique IDs |
| Tests bind fixed port / miss regressions | HTTP test binds port 0 and configures client backend via test metadata; browser setup included in try/finally, server/browser close on failure | test:explore passes; HTTP test also passes while another server owns port 3000; original assertions retained |
| Native search lifecycle lacks widget evidence | Added source selection, late old-source results, text edits, clear, navigation/disposal and metadata retry widget cases | Authored Flutter widget tests; verification remains incomplete until SDK tests run |

## Commands on the synchronized branch

- `npm run check`: passed, exit 0 (includes provider fixture, security and runtime integration checks).
- `npm run test:explore`: passed (both policy/HTTP and expanded Chromium tests).
- `npm run test:integration`: passed.
- `node scripts/ma_nexus_v8_test.mjs`: passed.
- `git diff --check`: passed.
- `flutter analyze`: could not start, exit 127 (`flutter: command not found`).
- `flutter test`: could not start, exit 127 (`flutter: command not found`).

Flutter/Dart SDK binaries were not found in the environment. Fetching the Flutter
Linux SDK release manifest from the official storage endpoint returned HTTP 404
(`NoSuchKey`), so native validation remains **incomplete**, not successful. The
project requires Dart >=3.11.0; run both full Flutter commands with a compatible SDK.

No live source acceptance runner, video playback test, deployment or PR merge was
performed as part of these review fixes.
