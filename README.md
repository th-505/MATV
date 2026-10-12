# MATV

Destination repository: https://github.com/th-505/MATV

Imported from `theeb505/Al-Qahtani`, preserving its Git history, Flutter app, Node.js server, and existing match/news/library behavior. Phase 1 isolates Akoam in `server/providers/akoam.mjs` and adds a standalone 3isk HLS resolver.

Run `npm install` and `npm run check` from the repository root. Run `npm run poc:3isk` to resolve the agreed episode. See [Phase 1 validation](docs/PHASE1_3ISK_VALIDATION.md) for live playback evidence and the user's successful Safari/4G test.

Phase 2 integrates 3isk Turkish/dubbed catalogs, shared search, direct HLS playback in Flutter/web, and an expiry-aware backend Supabase cache. See [integration and setup](docs/PHASE2_3ISK_INTEGRATION.md). The Supabase schema and live persistent caching are verified, including cache retrieval after a Node restart. Server secrets remain local and are excluded from Git.

## Original project

GitHub Pages: https://theeb1230-dot.github.io/Al-Qahtani/

Clean-room continuation of the uploaded Albasri TV web project, preserving working behavior while removing advertising/legacy app coupling and preparing a provider-based Flutter migration.

## Current web pages
- `index.html` — match schedule/player
- `basrimatches.html` — structured matches implementation
- `albasri-cinema.html` — movies/series
- `news.html` — readable decoded news page
- `Player.html` / `bsr-Player.html` — legacy Android player bridge, retained temporarily for behavior migration

See `docs/AUTONOMOUS_DEVELOPMENT_STATE.md` and `docs/PROVIDER_INVENTORY.md` for the current migration state.
