# MITV v2.9 delivery status

Updated 2026-10-16. This log records verified repository and live-service state; a feature is not considered released until the unified workflow succeeds for the exact source commit.

## Completed phases

- Phase 1: Render video-forwarding endpoints return `410`; Cloudflare and Node routes return metadata and source references only. The live Render health endpoint and production route tests passed.
- Phase 2: Flutter uses `media_kit` on native targets and the browser video element on Web. The approved navy/blue six-tab navigation, adaptive player, focus handling and TV pointer controls are implemented. Browser-protected sources remain unavailable on Web.
- Phase 3: Laroza parsing uses bounded text parsing and allowlisted hosts. Catalog merging preserves season, episode, audio language, edition and timeline identity. Worker fixture and live checks passed for healthy items.
- Phase 4: Anonymous Supabase sessions, owner-scoped library sync, metadata-only cache lifecycle, local cleanup and external subtitle handling are implemented. Supabase migrations are present in the live project. The local gate passed 276 Flutter tests, `flutter analyze`, and the Node checks.

Detailed phase evidence is in `docs/sprints/MITV-v2.9-phase3.md` and `docs/sprints/MITV-v2.9-phase4.md`.

## Release work remaining

The repository source declares version `1.0.44+44`. This version does not yet have a published GitHub release. The unified workflow must build and verify Android Mobile ARM64, Android TV ARMv7, unsigned iOS IPA, Windows, macOS and Web from one commit before publishing the release. APKs must remain below 35 MiB. Native installation and playback still require physical-device checks; CI does not establish battery, thermal or device compatibility.

No Cloudflare or Render video proxy is part of the release path. The Cloudflare Worker change for phase 4 must be deployed before claiming that edge-provided captions are live.
