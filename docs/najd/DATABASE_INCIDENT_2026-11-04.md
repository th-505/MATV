# Database pressure incident — 2026-11-04

## Evidence

- Dashboard reported 95–96% CPU and Unhealthy on the Nano database. SQL management connections alternated between success and timeout.
- Historical `pg_stat_statements` showed 138,876 legacy queue-claim calls and about 5,296 seconds total execution. Queue: approximately 194,400 rows / 163 MB. This is cumulative evidence, not a current CPU measurement.
- Two live Render deployments used the same repository: current `najdtv.onrender.com` and legacy `matv.onrender.com`, in two workspaces both named NajdTV. Both logged harvest polling failures.
- An expensive management advisor query was observed separately. Do not run repeated advisor sweeps during saturation.

## Applied containment

- `NAJD_HARVEST_ENABLED=0` on both Render services; both deployments were verified live. Legacy HTTP compatibility remains available.
- Cron job 7 (`select public.najd_hourly_refresh()`) disabled and verified inactive. No unrelated cron tasks changed.
- `najd_claim_known_jobs` migration applied successfully. Anonymous/authenticated execution denied; service-role execution enabled. Beta tables likewise have RLS, no anonymous/user SELECT grants and service-role access.
- Worker adds 5–120 second exponential retry backoff and limits idle lane sweeps to once per 30 seconds; immediate completion does not rescan the full backlog. Exact interactive durable keys retain 20 search slots.
- No jobs, user histories, favorites or accounts were deleted. No VACUUM FULL or paid compute upgrade was used.
- Server changes merged by PR 13 and deployed as 2.0.3. Owner dashboard password hash configured on current service and authenticated provider-config GET verified successful (22 providers).

## Managed recovery

A managed pause was accepted by Supabase. The project subsequently reported PAUSING. A restore request during PAUSING was rejected by the provider; do not repeat pause requests. Wait for the state transition and restore the same project as soon as it is allowed. No successful restore or CPU reduction is asserted in this checkpoint.

## Prevention and verification

- Keep the legacy worker disabled permanently. Re-enable only one current worker after recovery and measurement.
- Keep hourly refresh paused until bounded processing and queue demand are verified; do not start a mass recrawl to test recovery.
- Private `/api/v1/admin/database-health` exports only sanitized CPU percentage, sampling time and availability. It uses the project Metrics API with server-held credentials, a single in-flight request, a 60-second cache and two real CPU counter samples. It never returns raw exporter labels or credentials. Missing metrics are unavailable, never zero.
- Dashboard includes a manual CPU measurement action. No extra automatic metrics polling or support-report scans are added.
- Tests: 183 Node cases passed before the dashboard measurement button; dedicated metrics/dashboard tests passed after the UI change, including mobile/desktop/TV and credential destination checks.
- After restore: verify schema, service-only grants, account/library tables, keyed RPC, one actual source index, metrics samples and authenticated cloud writes. Retain release hold until availability and data are verified.
