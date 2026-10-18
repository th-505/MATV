# Experience rework: coordinated scope

Work continues on PR #2, stacked on PR #1. Neither PR is merged. The deployed
backend previously lacked `/api/v1/search/providers`, explaining the unavailable
source selector; building a client alone cannot add that server route.

## 1. Interface, theme and responsive layout

- [x] Shared Flutter catalog/search grid uses actual parent constraints and 2/4/6/8/10 columns.
- [x] Matching responsive web grids and larger desktop content area.
- [x] Responsive details header, optional duration/season/episode metadata; removed invented web metadata.
- [ ] Consistent refreshed logo/theme across all six build targets.

## 2. Search, sources and browsing

- [x] All display-name components use ذ, including English/numeric names; original identities are unchanged.
- [x] Default search calls the existing capability registry once, rather than parallel legacy duplicate paths.
- [x] General web search uses the same real provider search API; TMDb does not substitute playback cards.
- [x] Search presentation rejects unrelated titles and exact duplicate references.
- [x] Neutral movie/series/anime feeds browse declared provider categories in ten-work blocks.
- [x] Coalesced hourly in-memory cache, bounded concurrency/deadlines and continued paging after sixty works.
- [x] Private Supabase feed persistence, one-hour expiry and hourly purge; RLS/grants verified remotely.
- [x] Aggregate per-work open counters and last-open time; no user/device identifier.
- [ ] Validate owned Akwam/live replacement before retiring obsolete upstream dependencies.
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
