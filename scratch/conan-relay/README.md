# Isolated Conan relay access test

Node 22+; no dependencies. Set a random RELAY_ACCESS_TOKEN (24+ URL-safe characters) in hosting secrets. Start: `node scratch/conan-relay/server.mjs`.

Public health: `/health`. Private paths: `/<token>/status`, `/<token>/refresh`, `/<token>/index.m3u8`, `/<token>/myte.mp4`.

Only verified source formats are exposed. MP4 responses stream bytes with Range support; HLS variant/segment/key requests stay behind the relay. Source hosts and HLS directory are constrained. No TLS validation bypass.

This is an access test: free hosting can sleep, so the process timer alone does not guarantee hourly updates. A persistent external scheduler is required for the final service. A successful playlist does not certify the whole movie; verify variant and media segment playback too.

`index.m3u8` is a generated master playlist. Each variant has a stable ID and a proxied child playlist. The player exposes the actual HLS resolutions in its quality selector. A background pass checks the second Akwam scraper every refresh without blocking the working stream.

Additional HLS variants join the master only after checking the declared resolution, VOD segment timeline and media bytes. Cross-source variants require the same fixed film/edition, matching segment sequence, durations, discontinuities and codec declaration. Distinct same-resolution servers are retained; only the same variant ID is deduplicated. Unsupported/encrypted/MP4 candidates remain diagnostics, not fake variants; MP4 requires proper HLS packaging. Currently supported upstream hosts remain constrained to the observed media CDNs.

The expanded background pass uses the repository capability registry: 17 searchable independent providers (16 in discovery plus Akwam). Mirrors and the two live-only adapters are excluded. Known observed movie references seed five providers; other providers receive a bounded first-page title search. The report distinguishes unavailable providers from no match on the tested page and marks incomplete work explicitly.

`provider-runtime.mjs` is the generated, vendored adapter/HTTP bundle; `provider-entry.mjs` records the reproducible build command and its sources. Cheerio's slim parser avoids shipping browser/HTTP dependencies; captured search fixtures verify equivalent parser results. CimaNow's session POST uses the same guarded HTTP client rather than its legacy raw-fetch resolver. Newly observed media hosts pass URL and DNS checks, then are constrained to the selected source directory in playback. Unsupported MP4 candidates are not inserted into an HLS master without packaging.


Player and pagination expansion: `players.mjs` provides inert-data templates for HTML5, Artplayer/videoUrl (including master.txt), JWPlayer/Packer literals, Mixdrop, OK metadata, restricted Streamtape literal concatenation, declared download bridges and iframe chains. Every output is probed as actual HLS/MP4 bytes. Page JavaScript is never executed. Explicit domain restrictions and interactive verification are reported as barriers; a template's unit test is not a live-service success claim.

The six previously empty search sources are scanned with Arabic/original/English title queries and every advertised pagination link, including JSON next_page_url. Failed pages retain a resumable cursor. Cursors are atomically written outside Git under /tmp and can survive a process restart on the same filesystem; Render's ephemeral filesystem does not guarantee their retention across deployment/replacement. No pagination links means no advertised next page, not proof that an entire site archive contains one page. The protected diagnostics route reports page counts, attempted domains, HTTP statuses and player-stage failures. Legacy NETWORK_TIMEOUT classifications are accompanied by actual HTTP failure details so a fast 503 is not described as a literal timeout.

The HLS master keeps duplicate-quality alternatives as requested and supports playlist content served with .txt paths. Each accepted variant is verified against VOD timing; the local Artplayer and Fastvip samples matched across 656 segments. Deploy/live verification remains separate from local verification.
