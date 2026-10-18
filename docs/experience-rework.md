# Experience rework: coordinated scope

Work continues on PR #2, stacked on PR #1. Neither PR is merged. The deployed
backend previously lacked `/api/v1/search/providers`, explaining the unavailable
source selector; building a client alone cannot add that server route.

## 1. Interface, theme and responsive layout

- [x] Shared Flutter catalog/search grid uses actual parent constraints and 2/4/6/8/10 columns.
- [x] Matching responsive web grids and larger desktop content area.
- [x] Responsive details header, optional duration/season/episode metadata; removed invented web metadata.
- [x] Shared refreshed logo asset/native generator, including macOS icons and a real Android TV banner.
- [x] Web header/navigation wraps without horizontal overflow at 320–1920px.
- [x] Home uses the existing TMDb trending contract; work selection starts real source exploration.

## 2. Search, sources and browsing

- [x] All display-name components use ذ, including English/numeric names; original identities are unchanged.
- [x] Default search calls the existing capability registry once, rather than parallel legacy duplicate paths.
- [x] General web search uses the same real provider search API; TMDb does not substitute playback cards.
- [x] Search presentation rejects unrelated titles and exact duplicate references.
- [x] Neutral movie/series/anime and language/type feeds browse declared categories in ten-work blocks. Unsupported genres do not fall back to other genres.
- [x] Coalesced hourly in-memory cache, bounded concurrency/deadlines and continued paging after sixty works.
- [x] Private Supabase feed persistence, one-hour expiry and hourly purge; RLS/grants verified remotely.
- [x] Aggregate per-work open counters and last-open time; no user/device identifier.
- [x] Live channel catalog uses existing live-capable adapters, with retry/loading/empty states.
- [ ] Validate owned Akwam/live on real devices before retiring obsolete upstream dependencies.
- [ ] Deploy backend and clients together after the complete regression gate.

## 3. Player and shared frame

- [x] LTR timeline and backward/play/forward order inside an RTL app.
- [x] Edge-to-edge gradient with safe controls, neutral button colors.
- [x] Page frame preserves video ratio and is bounded to 1440 logical pixels; fullscreen uses the viewport.
- [x] Small frame options use a menu so the controls remain within the video frame.
- [x] Tests cover viewport edges, frame bounds and transition out of fullscreen.
- [ ] Physical-device review and real playback verification; neither is inferred from fake-engine tests.

No scraper implementation, provider ID, reference encoder, server code or license
notice is changed by this rework. Legacy search aggregation remains available only
when an explicit adapter is injected, preserving its existing compatibility tests.
Search matching operates on returned presentation titles; the original query is
passed unchanged to the provider. No user identifier or covert tracking is added.

Applied database migration: `20261018084150_catalog_feed_persistence.sql` to the
repository-configured Supabase project on 2026-10-18. The new table has RLS enabled,
no anon/authenticated grants and service-role-only CRUD. The hourly purge is active.
This is additive and does not modify existing library, favorites or provider tables.
The stored first sixty works can survive a process restart; expired snapshots are
refreshed on demand. Database outages fall back to the normal provider adapters.

Applied `20261018085119_aggregate_work_activity.sql`: service-role-only atomic
open counter. The SQL transaction regression incremented a temporary fixture twice,
verified the count and rolled it back (zero fixture rows left). anon/authenticated
cannot read/write the table or execute the RPC. The feed and activity migrations
are already applied; application code remains under review on PR #2.

Current native regression corrections include deferred shared-source notifications
and synchronous setState callbacks for async retry operations. The expanded browser
suite checks the actual column count and document width at 320/768/1024/1440/1920px.
A 78px horizontal overflow found at 320px was repaired by wrapping the header/search
and constraining the seven-button mobile navigation.

Applied `20261018091131_catalog_feed_genres.sql` adds the new browse genre IDs to
the private feed cache boundary. All three migrations are additive; original
provider IDs and existing library/provider cache rows are preserved. New feed
work is bounded to two concurrent snapshot builds per server instance.

Flutter validation run `39114283495` passed analyze, targeted exploration tests
and the complete suite on `033cf33` (Flutter 3.47.7). Genre-routing changes follow
that run and are revalidated in the next build; do not attribute the earlier run
to later commits.

The legacy web live page contained demo match scores and public test videos labeled
as sports channels. Those production fallbacks are removed. The page reads the live
capability registry route, retries failures, and never substitutes demonstration
media. Failed match/server references remain failures for that match. The retired
cloud-fallback export stays callable but returns no unverified embedded players.

Publication now verifies the matching backend version, complete registry display
metadata, every new feed category and configured TMDb metadata. This gate calls
only static contracts and does not repeat live provider scraping or playback tests.
