# MA TV v8.5 implementation audit

Audit date: 2026-10-16

## Verified and changed

- Removed committed TMDb API keys from server scraper enrichment. Server enrichment now runs only when `TMDB_API_KEY` is configured; browser TMDb requests require a user's local key. The web client validates API paths, coalesces duplicate requests, and bounds its one-hour cache.
- Added a 60-second bounded cache and in-flight coalescing to category scraping; category page numbers are capped at 50. Existing search limits remain in place.
- Removed synthetic third-party embed fallbacks from MA-NEXUS. Server probing is capped at 12 HTTPS URLs and uses `HEAD` against the media URL.
- Added HTTPS and provider-host validation plus the required iframe sandbox to the standalone web player. The sandbox omits popups and top navigation. External frames can still render content inside their own frame; direct stream extraction remains preferred.
- Corrected the web CP1256 decoder to use the standard Windows-1256 decoder where available, and added regression tests.
- Applied the MA TV charcoal/gold identity to Flutter source, web metadata, static entry points, generated native branding, and release presentation. Retained the six approved navigation destinations from v2.9 and retained existing Android bundle identifiers and storage paths.

## Boundaries and remaining gaps

- Render and the edge gateway return metadata and direct URLs; retired cloud media routes return HTTP 410. Alooy's `edge_local_proxy` label represents a loopback bridge on the user's device for source headers; it does not relay video through Render or Cloudflare.
- The scraper directory contains 18 provider functions, but not all are reachable through catalog/detail dispatch. Do not describe all 18 as fully integrated until each source has an end-to-end category, detail, and playback route.
- Anonymous Supabase auth, owner-bound RLS, and TTL migrations are present. Repository review cannot establish whether the production `pg_cron` cleanup job is presently scheduled and running; verify that from Supabase's live cron catalog.
- A browser sandbox prevents popups and top-level navigation but cannot guarantee that a third-party player page has no in-frame advertising. Sources that require such pages should be replaced with direct extraction or excluded from web playback.
- Release workflows define six targets. No claim is made here that a new six-platform release has completed; only a successful GitHub Actions run can establish that.

## Validation

- `npm run check` passed, including provider, edge, runtime, metadata, TMDb, subtitle, iframe-policy, and category quota tests.
- `flutter analyze` passed.
- `flutter test` passed after updating the focus-color assertion for the approved gold theme; six opt-in integration/native smoke tests were skipped by their existing environment gates.
- Both release workflow files parse as YAML. Native release workflows and six-platform packaging have not been run in this audit.
