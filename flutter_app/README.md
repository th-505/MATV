# MITV

Cross-platform cinema, live matches and offline MP4 library. Native playback uses direct HTTPS media resolved by Cloudflare; protected MP4 sources carry their own headers or use the device-local Range bridge.

- Flutter 3.47.7 / Dart 3.13.5.
- API: `--dart-define=MITV_API_BASE=https://matv.onrender.com`.
- Edge: `--dart-define=MITV_EDGE_BASE=https://matv-edge-resolver.dada1000100.workers.dev`.
- Targets: `MITV_TARGET=mobile`, `tv`, `ios`, `desktop`.
- Android ARM64, Android TV ARMv7, unsigned iOS ARM64 and Windows x64 CI: `.github/workflows/mobile-trial.yml`.

Windows distribution includes a per-user `.exe` installer and a portable ZIP containing `mitv.exe`, all plugins, assets and libmpv. The executable needs the accompanying bundle; it is not distributed alone.

New native bundle ID: `com.mitv.mitv`. The new application can coexist with the earlier beta. Existing files migrate from the legacy directory only when accessible in the same app container; this cannot access another iOS application's sandbox.
