# MATV 1.0.42 final edge release

This is the final deliverable for the architecture documented in [EDGE_RESOLVER_1.0.41.md](EDGE_RESOLVER_1.0.41.md). It additionally distinguishes an intentional zero-second handoff from an absent resume position. Both manual changes and 403 failover retain zero or two seconds rather than restoring an older saved progress entry. An uninitialized failed source still preserves the saved library position.

All original 26 Marasli episode mappings are live in Cloudflare KV. Native playback extraction uses Cloudflare for all three providers; the catalog, matches and news still use Render. No video bodies pass through the edge. Web accepts only browser-compatible alternatives and does not revert to cloud media streaming for protected sources.

The legacy HLS CI job now installs its dependencies before running the complete check suite. Provider/quality display, source switching, free-plan limits, mapping boundaries and independent edge deployment remain as described in the architecture report. Physical-device battery/thermal testing remains unperformed.

Final CI, release assets and live web evidence are recorded below.

Validation: 106 Flutter tests passed, analyzer clean, and Chromium MP4/HLS fixtures decoded with no exceptions. Live Alooy and Akoam libmpv decoding/60-second seeks passed. Miravd master, variant and a ranged segment returned 200/200/206 from a network separate from the extracting Worker.

Device build: https://github.com/th-505/MATV/actions/runs/38417114089 (source commit `f736695`). All jobs, including final binary verification and release publication, passed.

Miravd also decoded 1280×720 and sought to 60 seconds using libmpv. Its initial development-only failure was FFmpeg rejecting the managed HTTPS proxy protocol; allowing `httpproxy` in the development smoke client resolved it. This transport option is not installed in the application player. All three provider paths now have real Linux decoding evidence.

## Final delivery

- Release: https://github.com/th-505/MATV/releases/tag/v1.0.42
- Android Mobile ARM64: [APK](https://github.com/th-505/MATV/releases/download/v1.0.42/MATV-Android-Mobile-ARM64.apk)
- Android TV ARM32: [APK](https://github.com/th-505/MATV/releases/download/v1.0.42/MATV-Android-TV-ARM32.apk)
- iPhone unsigned ARM64: [IPA](https://github.com/th-505/MATV/releases/download/v1.0.42/MATV-iPhone-Unsigned.ipa) — external signing required.
- Live Flutter Web: https://th-505.github.io/MATV/app/ (`version.json` reports 1.0.42). Pages run 38417739057 passed.
- Render runtime reports 1.0.42; edge `/health` reports all three providers and `media_proxy:false`.
- SHA-256, selected architectures, unsigned iOS bundle, native libmpv and embedded API were verified in [device-verification.json](https://github.com/th-505/MATV/releases/download/v1.0.42/device-verification.json). All three packages share source commit `f736695fb4a55616b10c71c7537b1fb94fcce66a`.

Browser fixtures and Linux decoding are test evidence, not physical-device certification. Automatic edge deployment from GitHub still needs the scoped repository secret; connected Cloudflare deployment is live.
