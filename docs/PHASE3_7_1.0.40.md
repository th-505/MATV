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
