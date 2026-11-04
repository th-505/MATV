# Najd TV 2.0.0 beta — active implementation checklist

User-authorized scope, 2026-11-03. Preserve IDs, migrations, library data, real provider/episode references and private-font policy. No live-provider success claims from fixture-only tests. Keep live source audit as the last functional verification stage.

- [x] Compact player: remove bottom gradient/blur, larger original transport controls, centered episode title and one back action; episodes, audio/subtitles, More; fit/fill/original/aspect choices inside More.
- [x] Temporary press-and-hold playback boost, configurable (including 2x/3x), release/cancel restores prior speed, pointer/remote semantics.
- [x] Intro: 10 seconds total, Continue after 3 seconds, preserve poem/attribution, Thmanyah typography.
- [x] Detail poster portrait proportions, compact tags, cast/director portraits, dedicated person works page with poster cards.
- [x] Arabic/English metadata preference per-work, sensible original-language default and TMDB language plumbing/cache isolation.
- [ ] Search failures classified by stage; group results as works with retained independent provider/season indexes and ambiguous identities.
- [ ] Add ffosta-tv.autos as an independent provider with separate search/catalog/playback parsing and deterministic fixtures.
- [ ] Beta 1 provider browsing: explicit setting, own app route and drawer entry, provider choice, real home/categories/search/catalog/episodes, no accounts/advertising UI, independent of ordinary browsing.
- [x] Remove redundant top search, remove regional drawer shortcuts, use قائمتي consistently, compact appearance controls/font import.
- [ ] History actions/filter/sort and favorites rating sort, meaningful empty states, actual download error diagnostics/support.
- [ ] Account linking: inspect actual errors, simplify sender/receiver/approval flow and verify persistent synchronized lists/progress.
- [ ] Review Gemini maintenance API, staged scraper boundaries, knowledge skill, bounded validated config repairs and verified reporting.
- [ ] Restore web experience on user's confirmed domain with latest identity/features, preserve required account protections and font restrictions.
- [ ] Actual native UI coverage matrix (250–350 meaningful route/state/theme/device variants), capture/verify implemented states; never count HTML catalogue files as implemented routes.
- [ ] Last: live audit independent providers and mirrors separately; search -> film/series -> seasons/episodes -> direct media/container probe. Classify DNS/domain/block/access/search/parser/index/media/timeout distinctly. Request replacement official domains for unresolved sites; never bypass access controls.
- [ ] Version 2.0.0 beta, immutable source manifests, full checks; build/publish Windows, unsigned iOS, Android mobile/TV and requested web (plus existing supported desktop targets if retained), downloadable release links.

Confirmed public web target: https://th-505.github.io/MATV/ (full application, user-confirmed).

Implementation evidence and remaining gates: [IMPLEMENTATION_2_BETA.md](IMPLEMENTATION_2_BETA.md).
