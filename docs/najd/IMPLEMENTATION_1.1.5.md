# Najd TV 1.1.5 delivery plan

Authoritative input: `Prompt_and_Development_Plan_for_Najd_TV_v1.1.5.md`, Drive file `1ENuft4UlnPICpEqWVdkN-4MlUbeecgvO`, read in full. It supersedes conflicting 1.1.3 navigation and public-web requirements. Keep valid prior work, installed-user identifiers and migrations. The latest separate font restriction remains local use only; user ZIP import is allowed without redistributing the raw files.

## Stages and evidence

1. **Identity and responsive shared Flutter UI**: Najd branding, official lavender palette, contrast-correct light/dark themes, four original logo concepts, readable attributed poetry, themed scrollbars, TV modal navigation blur and measured layouts. Implemented in the shared source; adaptive mobile/desktop/TV keyboard tests pass. Native packaging remains pending.
2. **Independent providers**: domain/search configuration separate from each site's parsing; TMDB name+year identity; explicit provider content scope; separate search/catalog/direct-media stages; actual episode numbers, resumable pagination and manual exploration. Implemented with bounded runtime configuration, strict year/name matching and fixture tests. Live blocked sources remain unavailable; no access-control bypass.
3. **Browse/player**: five bottom shortcuts, scroll-responsive top brand/type filters, TMDB-only regional categories; infinite pages and view-more, 30-minute search cache, rich details/cast/director, real server/quality/audio/subtitle controls, next-episode preparation, episode/season downloads. Implemented and covered by Flutter tests; physical-device playback remains unverified.
4. **Accounts and persistent state**: anonymous owner-protected accounts, explicit secure same-device linking (hardware serials are unavailable to browsers/iOS), one-year inactivity cleanup, five-second progress persistence, seven-day owner-approved link authorization, hourly favorites and escalating manual-refresh cooldown. Implemented: one-use link with explicit receiver join and owner approval, separate Auth sessions and revocable grants. Database rollback tests verified replay rejection, pre-approval isolation and grant expiry. Never merge strangers by fingerprint or a forgeable serial.
5. **Settings and protected dashboards**: bounded safe user ZIP font import, account/profile separate from storage, scoped administration keys and a central dashboard without SQL/service-key exposure. Implemented in source; owner/member revocation and partial dashboard availability are included. Deployment pending.
6. **Maintenance and security**: concise reusable Gemini knowledge, daily midnight Saudi run with validated config-only repairs and durable discoveries; GitHub-only reports per owner; security checks before release. Daily reporting CI passed. Config-only proposals require GitHub OIDC and independent known-positive/negative live checks with revision compare-and-swap; arbitrary generated code never executes. Production activation pending.
7. **Delivery**: version 1.1.5, installable Android mobile/TV, Windows, macOS and iOS release assets; web only through authenticated internal testing, no public web publishing. Keep unsigned iOS/macOS limitations explicit. Pending; no release completion claim without assets and checks.

Do not tick off a stage based only on code presence or a successful build. Record deterministic tests, live behavior and remaining environmental limitations independently.

## Verification checkpoint — 2026-10-27

- All 294 Flutter tests passed (7 explicitly skipped platform/private-font cases). Adaptive navigation/player focus: 8/8 passed after fixing the missing rendering import. A later command named a nonexistent theme test file; that invocation is not counted as a pass.
- Full Node suite: 77/77 passed before the additional persistent-cache/outage test; targeted harvest suite including that new test: 9/9 passed. Rerun the complete suite in the feature gate.
- Runtime check and continuation suite passed, including 66 offline source fixtures and no network attempts. Python maintenance tests: 11/11; platform parity: 8/8.
- Private Thmanyah ZIP imported locally in tests; public source contains the redistributable Noto fallback with its license. Raw Thmanyah files are excluded.
- Actual Conan source index exposes 12 links, 11 distinct episode numbers 1207–1217 (1216 duplicated), and a series parent. The parser now reads those real structures; it never invents episodes 1–1206. A sanitized observed HTML fixture preserves the evidence.
- Private database migrations for harvesting, account grants, linked refresh, verified configuration and queue fairness have been applied. Client roles cannot claim background jobs. Runtime harvesting activation and native release remain pending.
- Android update signing continuity and Apple developer signing credentials are not confirmed. Do not assert seamless in-place updates, App Store distribution, notarization, or physical-device certification.
