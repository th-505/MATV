# MITV v2.9 — Phase 3 verification

The v2.9 UI has six sections: Live, Home, Movies, Series, Anime, Settings, with a navy/slate blue theme. Laroza joins 3isk, Akwam and Alooy through a private Cloudflare extractor; Render consumes JSON only. The application never executes source scripts or opens their advertising pages.

## Safe extraction

- Literal/Packer parsing without eval, four explicit player adapters, public host allowlists, bounded HTML and redirects.
- Catalog movies rotate across seven source feeds, two requests per page. Empty filtered pages retain explicit pagination; no automatic scan across unrelated feeds.
- Metadata routes contain no video URLs. Resolution returns direct URLs, headers and short expiry. Validation uses HEAD; video bytes go from the origin to the playback device.
- Attached captions are returned only when explicitly present and identified as captions/subtitles, not thumbnail tracks.
- Cloudflare gateway checks its Edge Cache before KV and preserves both free-plan rate-limit bindings. Public refresh cannot bypass the cache.

## Identity and switching

Catalog identity includes year, underlying media kind, season, episode, audio language and edition. Missing identity keeps cards separate. IMDb work evidence alone does not certify a cut's playback timeline. Distinct provider references survive deduplication and favorite persistence; no signed media URL is persisted in a favorite.

Aligned episode references require both parent works to match the catalog identity and explicit season/episode values. Matching an episode number alone cannot attach another series. The API tries known alternatives if the primary fails and keeps its selected URL/headers/expiry consistent with its ranked sources.

Cross-provider timestamp transfer requires an explicitly verified common edition. Unknown cuts require a manual restart from zero. Same resolved provider alternatives preserve their playhead unless their explicit editions conflict.

## Live evidence

- Laroza latest/movies/series/anime, page 2 and search returned HTTP 200.
- Direct HLS resolved for The Sun Never Sets and Jujutsu Kaisen; broken upstream adapters were filtered out.
- Doctor X, Fire Country and Georgie returned their real episode references. A series with zero episodes on its source is kept empty rather than populated from recommendations.
- Provider request example: CPU 5 ms, outcome ok. One gateway category sample reported 12 ms, also outcome ok; no 1102 was observed. This does not prove every future request will fit the free CPU allowance.
- Cloudflare transports metadata/HTML only. Tests and origin HEAD probes are not tests on a physical iPhone/Android TV.

Source refs are stable; signed stream URLs are intentionally omitted from this report. Native Laroza HLS decoding through the actual UniversalPlayer/libmpv produced a 1280×582 frame (11,872-byte PNG) and resumed at 1,209 ms after a one-second seek. The phase gate passed 217 Flutter tests (three opt-in native tests skipped in the default run), with clean analysis and passing Node checks. Explicit Arabic season ordinals are parsed without defaulting unknown seasons to season 1. Final release artifacts are recorded after the unified build gate.
