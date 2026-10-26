# Search diagnostics — 1.1.1

`GET /diagnostics` serves a private-data-free shell. `GET /api/v1/diagnostics/searches` requires a Bearer token configured by the operator as `DIAGNOSTICS_TOKEN` (minimum 24 characters). The browser holds it only in memory. Do not put it in URLs, Git or client bundles. The service-level secret is managed in Render, not the Blueprint.

Each advanced search is assigned an independent UUID before queuing. AsyncLocalStorage isolates concurrent requests. Events show server receipt, DNS resolution, actual requested URL/method, redirects, HTTP status, WAF classification, discovered search form action/field names, parsed item count/titles and post-filter count. HTTP response completion is observable; successful rendering on a device is not. If nothing reaches the server, this dashboard cannot determine what happened on the device.

Normal TMDB search also creates a trace on the production runtime and redacts API keys from traced URLs. HTTP failures retained in scraper `_meta` are propagated as failures rather than silently converted to successful empty results. A 200 login/suspended page is unavailable, not an empty search. Empty results remain explicitly unconfirmed. Arabic alef/ya variants are normalized before title filtering.

The updated clients send a random per-launch/session identifier and a self-reported platform, not an account identity. Old native versions still produce server traces, but may show `native-unknown` without a session. This is request diagnostics, not a user identity tracking system. Web shows a support trace ID; updated native errors also show it.

Retention: **memory only, up to 400 traces for one hour, cleared on process restart**. Multi-instance aggregation and durable history are not implemented. Only summary IDs/provider/state/count/duration are written to structured server logs, not queries, result titles, cookies, IPs, API keys or authorization headers. Admin-visible in-memory records contain the search query and a few public result titles. This is an operational console, not a persisted analytics warehouse.

The report `مهام/تقارير/search-live-audit.json` records all 19 real search attempts and their limitations. It is not a claim that all sources or playback paths work. MyCima, Shahid4u and QFilm were corrected from live page forms and card markup. No search is silently rerouted to another provider.

Checks: `node --test tests/search-diagnostics.test.mjs`, `npm run test:continuation`, `npm run check`, full Flutter tests/analyze. Repeatable network audit: `NODE_USE_ENV_PROXY=1 node scripts/audit_source_searches.mjs /tmp/source-audit.json` (requires internet; failures are recorded, not treated as success).
