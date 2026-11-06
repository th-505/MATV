# NajdTV v3.0.0

- Font import was removed from Settings; bundled Thmanyah is automatic. Three original Thmanyah families/fifteen weights: OTF in native packages and WOFF2 on Web. Original files, manifest weights and Arabic/Latin coverage verified.
-54 TMDB-based shelves, with Continue Watching/My List before top-ten ranking, More/pagination and lazy loading. These are not IMDb charts. Language filters and paginated browsing remain available.
- Source resolution retains observed backup servers and quality variants, avoids the former first-success/first-probe and eight-link cutoffs, preserves the HLS master/audio groups, and exposes actual quality/decoded dimensions. Missing variants are never invented.
- Web fullscreen/Safari PiP fallbacks, previous/next episode controls, elapsed/remaining display, stable season-only updates, metadata backup/import and clearer source states.
- Android uses the pinned permanent new signing key. It cannot update APKs signed with the old disposable certificates in place; this release is a fresh installation as authorized. Export/link the old library before removing it if those local records are needed.
- iPhone package is unsigned, actual arm64 device format and normalized nested executables. External legitimate signing is required. Windows/macOS packages are not Apple-notarized/Authenticode-signed.

Validation:380 Flutter tests passed with7 environment/device-dependent skips;210 Node tests and continuation/runtime checks passed. Fifteen Web faces loaded in actual Chromium without errors. Four isolated synthetic HTTP load profiles include a five-minute soak; this is not production Supabase capacity certification or human testing.

Live provider samples remain mixed: Najd6 passed/10 partial/6 failed; Beta5 passed/10 partial/7 failed. A successful sample/container probe does not certify every film, series or device decoding. Existing providers remain registered; ambiguous/empty alternative sites are not advertised as working sources. Some sources require login, reject access or time out. PWA/native PiP behavior still depends on platform support and requires device feedback.
