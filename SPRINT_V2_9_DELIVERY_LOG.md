# MITV Project — Master Architecture Sprint v2.9 Delivery Log
**Author:** Multi-Agent Squad (Sharqawi Session)  
**Target Audience:** Engineering Team (Sharqawi & Gharbawi handover reference)  
**Date:** October 14, 2026  

---

## 1. Overview & Architectural Compliance
This document serves as the official handover and state transition log for the MITV multi-platform streaming platform (Android Mobile, Android TV, iOS, Windows, macOS, Web). All tasks outlined in Sprint v2.9 have been executed in parallel using a multi-agent workflow, strictly adhering to our non-negotiable core constraints:
- **Zero Cost & Zero Ads:** 100% free-tier infrastructure (Cloudflare Workers, Supabase Free Tier, GitHub Actions) with zero ad-injection or tracking.
- **Zero Server Video Proxies:** All server-side video proxy routes (Render) have been fully retired. Video streams flow directly from source/edge to client.
- **Client-Side Smart Taxonomy:** Discarded raw scraper categories in favor of normalized, app-driven taxonomies (Movies, Series, Anime).
- **Target Scale:** Optimized for a tight scope of max 20 users (5-10 concurrent streams).

---

## 2. Multi-Agent Squad Task Breakdown & Execution Status

### Agent 1: Universal Player & Adaptive Viewport (Tasks 1 & 7)
- **Engine Standardization:** Migrated core playback across native platforms to `media_kit` (backed by `libmpv`) supporting hardware acceleration and custom HTTP headers (`Referer`, `Origin`, `User-Agent`).
- **Adaptive Viewport:** Implemented `AdaptiveViewport` and `FullscreenVideoSurface` to dynamically calculate safe area bounds and eliminate black borders on iPhone. Added runtime toggle between `BoxFit.contain` and `BoxFit.cover`.
- **Cinematic Gestures:** Enabled vertical drag gestures for brightness (left) and volume (right), plus double-tap seeking ($\pm10\text{s}$).

### Agent 2: Content Aggregator & Safe Laroza Parser (Task 2)
- **Smart Taxonomy Engine:** Introduced `MediaTaxonomy.classify` to cleanly categorize raw scraper feeds into structured internal sections.
- **Deduplication:** Applied `UnifiedMedia.mergeSources` to aggregate multi-source items into unified presentation cards.
- **Safe Laroza Extraction:** Rebuilt `laroza.mjs` parsers relying strictly on AST/Regex text processing **without any `eval` execution**, backed by an strict allowlist of top-4 clean streaming servers.

### Agent 3: Netflix-Style Modern UI & Navigation (Task 3)
- **Dark Navy Theme:** Implemented a sleek cinematic theme (`#0B1220`, `#151F32`, `#708DB8`) replacing legacy layouts.
- **Unified Navigation Bar:** Fixed layout order to `[Live] -> [Home] -> [Movies] -> [Series] -> [Anime] -> [Settings]`, permanently removing the sports news section.
- **Live Match & Error Handling:** Enhanced live stream management and integrated clean fallback UI handling for `NO_MATCH_MEDIA`.

### Agent 4: Supabase Anonymous Auth, TTL Cache, & Downloads (Task 4)
- **Silent Auth & RLS:** Configured `SupabaseService` with `signInSilently()` using a persistent `Device UUID`, securing favorites and watch history with strict row-level security (`auth.uid() = user_id`).
- **7-Day TTL Purge:** Created database function `cleanup_idle_cache_7d()` to automatically prune inactive cache items while protecting trending, user-favorited, and newly added media.
- **Direct MP4 Downloads:** Enabled direct MP4 downloading with range-request resume support while disabling downloads for encrypted HLS streams.

### Agent 5: Branding, TV D-Pad, & 6-Platform CI/CD (Tasks 5 & 6)
- **Branding Clean-up:** Purged legacy references, standardizing the application identity completely as **MITV**.
- **Android TV D-Pad & Virtual Pointer:** Enhanced `FocusHighlight` with high-contrast glowing borders (`3px`) and integrated `VirtualPointerController` with smooth acceleration physics.
- **6-Platform Matrix CI:** Updated GitHub Actions (`mobile-trial.yml`) to automatically build and package Android Mobile, Android TV (`armeabi-v7a`), iOS Unsigned IPA, Windows Setup/ZIP, macOS DMG/ZIP, and Web App under the 35 MiB ABI-split ceiling.

### Agent 6: External Subtitles & Sync Engine (Task 8)
- **Stremio OpenSubtitles v3:** Integrated automated IMDb-based subtitle retrieval via Stremio's free public endpoint (zero API keys required), prioritizing Arabic (`ara`) results.
- **Encoding Correction:** Built smart character set normalization to convert legacy encodings (`Windows-1256` / `CP1256`) to clean `UTF-8`.
- **Sub-Delay Control:** Added runtime synchronization adjustments (`sub-delay` via `NativePlayer.setProperty`) with an intuitive on-screen offset selector ($\pm0.5\text{s}$).

---

## 3. Summary of Key Files Modified/Created
- `flutter_app/lib/src/subtitles_service.dart`
- `flutter_app/lib/src/supabase_service.dart`
- `flutter_app/lib/src/universal_player.dart`
- `flutter_app/lib/src/player_page.dart`
- `flutter_app/lib/src/library_store.dart`
- `flutter_app/lib/src/focus_highlight.dart`
- `supabase/migrations/20261014220000_mitv_anonymous_sync_and_ttl.sql`
- `server/providers/laroza.mjs` & `edge/src/laroza.mjs`
- `.github/workflows/mobile-trial.yml`
