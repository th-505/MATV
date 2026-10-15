# MA TV

**MA TV** — Cross-Platform Direct Streaming Media Client (Android Mobile, Android TV, iOS Unsigned, Windows, macOS, Web).

Repository: https://github.com/th-505/MATV  
Flutter Web: https://th-505.github.io/MATV/app/

## Architectural Pillars
1. **Zero-Cost & Zero-Ads:** Strictly free tiers (Cloudflare Workers, Supabase Free Tier, GitHub Actions/Pages). 100% ad-free.
2. **Direct Edge Playback:** Video streams flow directly from origin to client devices. Server proxies (Render) are eliminated.
3. **Unified Media Engine:** Single `media_kit` (`libmpv`) pipeline supporting MP4, MKV, HLS, hardware decoding, and custom headers across all native targets.
4. **Adaptive Viewport & Modern Netflix UI:** `AdaptiveViewport` wrapping, flexible BoxFit toggle (`contain` / `cover`), touch gestures (volume, brightness, seek ±10s), and Dark Navy cinematic theme.
5. **Smart Client-Side Taxonomy:** Works classified into Movies, Series, and Anime using `MediaTaxonomy` and deduplicated with `UnifiedMedia.mergeSources`.
6. **Subtitles & Sync:** Stremio OpenSubtitles v3 API integration, UTF-8/CP1256 decoding, and native `sub-delay` synchronization.
7. **Android TV & Focus Navigation:** High-contrast focus borders, D-Pad support, and virtual pointer controller with smooth acceleration.
8. **Automated Multiplatform CI:** GitHub Actions matrix releasing 6 identical targets (Mobile ARM64, TV ARM32, iOS Unsigned IPA, Windows ZIP/Setup, macOS DMG, Web) with split ABI limits (~35 MiB).
