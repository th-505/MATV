# MITV 1.0.43 — live edge playback, downloads, viewport and Windows

## Live matches

The observed Basri player uses AlbaPlayer with Base64 media URLs. Current engine labels include hls, clappr and plyr. The new private `mitv-extract-matches` Worker supports these literals, bounded Packer expansion, direct source configurations and validated iframe traversal. It does not evaluate remote JavaScript or retrieve advertising scripts.

The router exposes `/v1/matches`, `/v1/matches/servers`, `/v1/matches/playback` and `/v1/matches/resolve`. Stable references encode the source article; extraction re-fetches the provider's current signed match link and session rather than persisting its token. Upstream article/player and media hosts are explicit configuration allowlists. Request counts, nesting, HTML size, redirects and timeouts are bounded. Media checks use HEAD only; Workers do not download or relay video bodies.

Flutter gets live metadata and playback directly from the edge. The Render compatibility facade returns edge JSON and direct URLs/headers. Its retired `/api/matches/media` responds 410 without calling any video upstream. The old match manifest rewriting and media streaming implementation was removed.

The first live source formerly failing with `NO_MATCH_MEDIA` now returns a direct HLS URL from the edge. This does not certify every scheduled game's source or the accuracy of third-party match labels. Other current/future hosting domains require a configuration update after observation.

## Shared full-window player

Live events, cinema and downloaded files use `PlayerPage` and `UniversalPlayer`. `FullscreenVideoSurface` fills the available window; FittedBox/BoxFit.contain controls only the image. Safe insets apply to controls, not a Column/ListView restricting the video surface. No intentional image distortion/cropping is used; letterboxing caused by different aspect ratios remains correct.

The surface listens for actual decoder size changes and adapts to rotation. Live streams do not restore VOD history positions. Windows/Linux/macOS use media_kit/libmpv; supported mobile formats use native video playback with an extended-engine fallback. Buffer/error fallback retains the last observed timestamp even when the decoder's error value drops its position. Local-file decoder fallback shares the same controls and viewport.

## MP4 downloads

The native downloader accepts registered edge-issued HTTPS MP4 URLs with Referer/Origin/User-Agent, Range resume, bounded validated redirects, partial files and final length/MP4 signature checks. It writes through IOSink rather than storing an entire video in memory. HLS manifests are never renamed to MP4 or offered as downloadable media. No HLS muxer is implemented.

The player exposes download only for a selected MP4 source. Detail-page actions use a resolved MP4 alternative; unknown/HLS-only episodes have no download button until a suitable source is known. Web downloads remain disabled. Format checks and successful file finalization do not guarantee every upstream file's codec/integrity; a real complete MP4 fixture is downloaded, resumed and decoded in the verification tool.

Downloads now live under Documents/MITV/Downloads and `.mitv-*.part`. A compatibility migration moves accessible legacy files/partials without overwriting conflicts. New native application ID is `com.mitv.mitv`; it can coexist with the earlier beta. A new app cannot read the earlier iOS app's separate sandbox; migration only applies when files are accessible in the same container.

## Identity and Windows

Flutter package/classes, application titles, flags, web manifest, launcher/splash assets and library paths use MITV. The identity uses a charcoal background and crimson M/play mark. Previously deployed repository/service URLs remain stable; old names remain only where required for migration or historical records.

The device workflow builds Android ARM64, Android TV ARMv7, unsigned iOS ARM64 and native Windows x64. Windows includes a portable ZIP plus a per-user Inno Setup `.exe` installer with all DLLs/assets/libmpv. CI installs it silently in a temporary directory and compares installed file hashes to the complete release bundle. A standalone copied `mitv.exe` without its bundle is not supported. Packages are not represented as store-signed products.

## Validation and limits

- Unit/widget coverage: viewport dimensions/centering/aspect preservation in portrait, landscape and desktop; protected direct MP4 Range/headers; HLS/private-URL rejection; migration without overwrites; shared live player; actual-format download buttons; error-position handoff.
- Node coverage: Basri Base64/Clappr/Packer parsing, stable identity, source allowlists, HEAD-only media validation and the Render facade's no-video 410 route.
- Live edge extraction and Linux libmpv playback, downloaded-file decoding and browser fixture evidence are recorded after checks.
- Mobile/iOS/TV physical-device testing is not performed in this managed Linux environment. GUI/codec support and heating/battery behavior need physical testing.
- Cloudflare operations remain within free-plan allowances; splitting Workers does not expand account limits. The live resolver carries HTML/JSON traffic but no video bodies. Independent GitHub edge deployment requires the scoped repository secret; connected Cloudflare deployment is used here.

## Published validation evidence

Runtime Docker packaging initially omitted the shared bounded-response reader imported by the new JSON facade. The image now copies that dependency; the rebuilt container starts successfully with health 200 and the retired media route returns 410. Render deployed the corrected 1.0.43 runtime and its public list returns `basri-matches-edge`.

The first Windows CI attempt failed a test-only assertion using Unix path separators. The platform-independent assertion passed on the corrected build: 116 tests passed, one optional native smoke skipped in CI. Native libmpv smoke was executed separately in Linux. Windows compiled successfully; the per-user installer installed silently and all installed payload hashes matched.

The compiled Flutter Web 1.0.43 bundle is published at https://th-505.github.io/MATV/app/. Chromium decoded complete MP4 and HLS fixtures; this does not establish that every third-party live source permits browser CORS. Native packages use commit `ab25cc9`; later Docker/runtime-log fixes affect only Render. Full structured evidence: [MITV_1.0.43_RESULTS.json](MITV_1.0.43_RESULTS.json).

All four platform jobs and the cross-package verification/release job passed in [CI run 38442970957](https://github.com/th-505/MATV/actions/runs/38442970957). The [MITV 1.0.43 release](https://github.com/th-505/MATV/releases/tag/v1.0.43) contains mobile ARM64 APK, TV ARMv7 APK, unsigned ARM64 IPA, Windows x64 installer and portable ZIP, checksums, and device-verification.json. Release asset sizes match the verification report.
