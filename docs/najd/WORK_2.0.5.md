# Najd TV 2.0.5 — implementation and evidence

Scope: preserve all22 independent providers and2 mirror registrations; no three-provider routing rollout. Future category routing remains deferred. No fabricated availability, quality, users, device fingerprint, or bypass of access restrictions.

## User requirements

- [ ] Confirm persistent Android signing secret against approved certificate before publishing.
- [ ] Repair default Thmanyah loading/weights and ZIP import persistence; native/private builds use original licensed font. Public raw-font distribution awaits permission because the supplied license prohibits standalone hosting.
- [ ] Stable browser anonymous identity across reload; isolate actual storage/refresh failures from account display failures, Safari/PWA contexts and cleared/private storage.
- [ ] Najd PWA icons, title, manifest identity, update detection and safe asset refresh without wiping sessions.
- [ ] Fullscreen Web bridge, Safari fallback, fullscreen native player, position/remaining on separate physical sides.
- [ ] Previous/next, episodes, audio/subtitle and quality shortcuts with capability-aware controls.
- [ ] Preserve HLS master/observed qualities; show actual decoded dimensions and avoid fake1440/1080 labels.
- [ ] Keep title metadata and poster while only the season episode list reloads.
- [ ] Home anime/Asian catalogue filters and source matching; distinguish TMDB metadata from IMDb ratings.
- [ ] Compact landscape home carousel, full-poster details and clear season/episode states.
- [ ] Explain clocks as queued/running/backoff/partial states with observed reason, not a user-ID cap.
- [ ] Test existing providers by stage; independent parser repairs where live evidence exists.
- [ ] Add newly requested providers to general search only after official URL and live/fixture verification.
- [ ] Four load profiles: load, spike, stress, soak. Local isolated fixtures for stress; bounded production probes with synthetic test sessions, never claim human testing.
- [ ] Rebuild/publish Android mobile/TV, iPhone unsigned, Windows, universal macOS and public Web after checks.

## Provider inventory

Existing: Alooy/AlooYTV, Brstej, Ahwak, CimaNow, ArabSeed, EgyDead,3isk, Laroza, Anime4Up, WitAnime, RistoAnime, MovizTime, Akwam, MyCima, Shahid4u. No removal or category restriction.

Seed-only (not working registered scrapers): Fushaar, FaselHD, Cima4u. No module/seed: TurkishSerie, Asia2TV, Drama Online. Requested official URLs before activation; seed presence is not verification. This would yield28 independent requested providers if all six become verified, without counting mirrors twice.

## Ten additional practical improvements

1. Persistent-key certificate check, preventing silent release-signature rotation.
2. Precise account readiness/storage error state without replacing an existing anonymous owner.
3. Local metadata backup/export and validated import for a signing migration, excluding secrets and video links.
4. Playback diagnostics showing actual dimensions, bitrate where known, codec and selected quality.
5. Capability-driven fullscreen/PiP actions and explicit unsupported state.
6. Reduced-motion-aware intro typing with preserved poetry attribution.
7. Stable loading/error/retry state for episodes without replacing the whole details page.
8. Persistent source-specific refresh and selection without affecting other provider sessions.
9. Version-aware Web update prompt preserving session/library and active playback.
10. Reproducible load-test reports with p50/p95, error rates, concurrency and clearly stated limitations.

An item is complete only after its relevant tests/evidence are recorded. Platform support cannot be certified solely from builds. No100-feature completion claim from a count of UI variants.

## Development checkpoint — 2026-11-06

Implemented on the review branch, not a published 2.0.5 release:

- Web HLS level selection uses the player's observed levels and preserves the master playlist/audio groups. Replacing the HLS controller disposes the previous controller attached to the same video. Actual decoded/display dimensions and dropped-frame counters are available in diagnostics. Native/source alternatives remain bounded at64 rather than8.
- Equal-health source ranking prefers the observed higher resolution; known failures still lose priority. A generic source label no longer overrides an explicit quality field.
- Web fullscreen uses document fullscreen with Safari video fallback. PiP retries the Safari presentation API when the standard API rejects the request. Physical Safari/PWA/native PiP still needs device verification.
- Current time is physically left and remaining time right. Previous/next episode controls use observed episode identities.
- Season loading retains title/poster metadata and replaces the episode portion only; busy/error states prevent launching the previous season by mistake.
- Full-ratio compact poster and adjacent metadata header; home carousel has up to8 actual works, reduced-motion support, manual navigation and pauses after interaction. Failed anime/series shelves have independent retry instead of disappearing permanently.
- Source cards no longer display an indefinite clock for every unavailable index; the API exposes the observed index state. Unknown state is labelled unknown/not ready rather than running.
- Private font build manifests register the original400/500/700 faces and theme readiness notifies listeners. No font bytes committed. Public Web font permission remains unresolved.
- Account ID display reads the persisted owner before an optional profile RPC. This does not recover a deleted session, identify hardware, or unify Safari/PWA storage contexts automatically.
- Metadata-only library backup/export/import rejects secret/media payloads before mutation. Atomic library snapshots retire three redundant legacy copies while retaining owner/session keys.
- Najd180px Apple touch icon and manifest identity prepared. Safe version-aware update handling is not yet implemented.

Validation:

- Flutter analyze: no issues before the final documentation checkpoint.
- Release Web build: succeeded; later carousel/header state changes covered by focused widget tests and analysis, requiring final release rebuild.
- Node full suite:197 passed; subsequently added source-state regression:3 passed in that file.
- Flutter full suite:372 passed,7 skipped,1 failure caused by the quality-order change bypassing the fixture's deliberately broken lower-quality source. Updated the fixture so the higher-quality source is deliberately broken, preserving the decoder/failover assertion. Focused re-run:9 passed including failover at the saved40-second checkpoint, quality ordering, carousel and light/dark production routes. Final full release suite remains required.
- Browser bridge:3 passed in real headless Chromium with controlled public API/HLS fixtures, not live streaming/provider or physical Safari tests.
- Library backup:3 passed; private font manifest:2 passed.

Release blockers/open work: corrected Android signing bundle JSON, Web font permission, official URLs for six missing providers, remaining live source-stage diagnostics/repairs, four bounded load profiles, deeper browser-session persistence verification, final platform builds/device checks and publication. No claim that all providers, all PiP platforms, or100 new features have passed.

### Follow-up verification

- Final full Flutter suite after quality fixture repair and carousel integration:377 passed,7 skipped,0 failures. `flutter analyze` reports no issues.
- `npm run check` passed, including native branding/packaging contracts and provider/runtime/security checks.
- Brstej supplied `.beer` URL now publicly redirects to `https://su.brstej.com/home03` (observed2026-11-06). Updated only its explicit primary/host allowlist, retaining old references and private-IP rejection. Live targeted result:40 home cards,41 episode entries on the selected series.5 parser/reference security tests passed. This is indexing evidence, not successful decoding of all episodes.
- New iPhone CI packages now run the same nested Mach-O/execute-mode/thinning/unsigned audit used by the previously published compatible IPA. The Linux audit fixtures passed; the changed CI job still requires a macOS build.
- Android input verification re-run42136430396 still failed. No Android release published with a replacement/debug certificate.
