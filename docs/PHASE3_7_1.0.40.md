# MATV 1.0.40 — tasks 3–7

The earlier 1.0.39 device triplet passed binary verification. This increment adds Alooy, source routing, web delivery and player controls without modifying `match-playback.mjs`, `match-production.mjs` or `news-runtime.mjs`.

## Alooy

The verified source is `https://fa.alooytv16.xyz`. `/tv-series.html` has 24 works; page 2 is `/tvseries/home/24.html`. Series links are `/watch/{slug}.html`; episode links add `?key=...`. The parser reads source/video tags and script URLs, accepts HTTPS MP4/WebM only on the observed `ujeklsj.site` media family, and deduplicates sources. It does not execute source JavaScript or trust arbitrary `.site` domains.

`alooy-series` appears in the series selector, API categories and integrated search. Descriptive metadata has bounded caching/coalescing. Prefetch never substitutes for a playback resolution. Episodes retain opaque provider references; media requests carry the complete watch Referer (including the key), source Origin and browser User-Agent.

Android/iOS use a randomly addressed loopback listener with one registered target. It forwards Range/If-Range and preserves actual HTTP status, Content-Range and Content-Length. `addStream` applies backpressure without complete-file buffering or disk downloads. Disconnects, source changes and page closure stop upstream requests. Upstream headers are applied by the bridge; the native player calls loopback with no Origin header. Android cleartext access is restricted to localhost/127.0.0.1; iOS permits local networking.

Browsers request `platform=web` and receive an opaque HTTPS Render bridge reference. This route forwards media bytes through Render and consumes its bandwidth. Native Alooy playback keeps media traffic on the device.

## Router and player

`MediaItem`, `StreamSource`, `ResolutionOption` and `MediaRepository` provide a shared contract with compatibility aliases for existing callers. Sources returned for the same work are deduplicated and ranked using priority, observed startup latency and failures. Playback retries are bounded: alternate decoder, alternate source, then one refresh. Handoff retains the timestamp; failed catalog works are never replaced with unrelated works.

The extended renderer explicitly enables hardware acceleration with platform defaults (Android auto-safe). ARM64/ARMv7 libmpv packaging is checked in CI. Native HLS/MP4 and the extended MKV/WebM/DASH/TS path remain available. Codec availability still depends on hardware and the browser.

Playback enters landscape/immersive mode on native mobile and restores display/brightness on exit. Controls hide after four seconds of playback inactivity. Right/left vertical gestures control volume/brightness; double taps seek ten seconds with visible feedback. Controls show elapsed/remaining time, server quality alternatives and available embedded tracks; HTTPS SRT/VTT subtitles can be added externally. Existing D-Pad focus behavior remains covered by tests.

## Web and browsing

Flutter Web is published alongside the existing PWA at `/MATV/app/`. Shared work links use `?ref={encoded opaque reference}`. CanvasKit resources and HLS.js are bundled locally. Metadata/images are prefetched with bounded concurrency; lists retain infinite scrolling, deduplication and generation guards.

Chromium decoded both MP4 and HLS fixtures through the built Flutter app without JavaScript exceptions. This establishes renderer behavior, not universal source CORS support. Miravd remains client-resolved on native platforms; browsers cannot spoof its wrapper Referer, and Render's miravd hosting-network rejection remains an upstream limitation. Unsupported browser sources present a native-app fallback message. Browser MKV/DASH/TS support is not claimed without a compatible browser codec/renderer.

## Verification

- Node checks cover all three providers, trusted references, redirects, expiry/cache behavior, HTTP routing, HLS/DASH resource handling and ranged Alooy web streaming.
- The standalone Dart HTTPS fixture verifies native Range and Referer/Origin/UA, true 206/200 propagation, streamed bytes, and rejection of an unregistered target.
- A real Alooy episode was decoded through Dart API -> local bridge -> media_kit/libmpv at 1280×720 and sought to second 60 in this environment.
- Flutter tests cover fallback timestamp preservation, loopback header separation and disposal, metadata/playback separation, source ranking, player gestures, and existing matches/news/library behavior.
- CI builds Android Mobile ARM64, Android TV ARMv7 and unsigned iOS ARM64 from one commit/version. Verification checks SHA-256, actual native architecture, libmpv presence, embedded public API, version and unsigned IPA status before publishing a release.

Physical phone/TV playback, battery use, temperature and sustained device memory still require testing on the target devices. An unsigned IPA requires external signing before installation. Supabase durable cache remains unavailable with the retired legacy credential; in-memory metadata caching continues to work.

## Delivered packages

[MATV 1.0.40 release](https://github.com/th-505/MATV/releases/tag/v1.0.40) contains the Mobile ARM64 APK, TV ARMv7 APK and unsigned iPhone IPA, their SHA-256 files, and the verification report. All three passed the [successful build and release run](https://github.com/th-505/MATV/actions/runs/38403882619), including 100 Flutter tests for mobile and TV. The Android release lint requirement for explicit `includeSubdomains="false"` was corrected before release and is now tested as part of CI.

The public Render API passed live checks for Akoam movies/series (206, 4096-byte samples), both 3isk engines (manifest 200, segment 206), and native Alooy decoding plus continued progress after seeking beyond 60.5 seconds. Alooy's real web bridge returned 200 despite Range; this result is preserved rather than reported as 206. Native device seeking and a mock upstream returning actual 206 were tested separately.

Flutter Web CI successfully decoded MP4 and HLS in Chromium. The compiled bundle is committed under `app/` for the existing Pages source branch, with future CI rebuilding and publishing that directory. The earlier Pages deployment wait cleared automatically. The [final deployment](https://github.com/th-505/MATV/actions/runs/38405494733) succeeded; https://th-505.github.io/MATV/app/ now returns 200 and reports version 1.0.40/build 40. No manual approval is required.

Detailed hashes, URLs and remaining device tests are in [PHASE3_7_RESULTS_1.0.40.json](PHASE3_7_RESULTS_1.0.40.json).

The published site was also opened in Chromium through its real public URL. App startup and series navigation passed, with live category/news/matches API responses at 200 and no JavaScript exceptions.
