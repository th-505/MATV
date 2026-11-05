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
