# MATV 1.0.41 — edge extraction and source switching

Production resolver: https://matv-edge-resolver.dada1000100.workers.dev

## Request and response

`GET /v1/resolve?ref={existing opaque playback reference}` or `GET /v1/resolve?episode_id={canonical identity}`. `refresh=1` renews expiring links. `/health` reports the schema and providers. The resolver has no media-streaming endpoint.

The router invokes three independent provider service bindings using `Promise.allSettled`. Only registered identities query other providers; unregistered references resolve their own provider. Failed providers are excluded from `sources`; `availability` distinguishes failures from unmapped providers. JSON is capped at 12 KiB. Responses include provider name/id, format, quality, direct URL, playback headers, expiry and mode. Signed URLs are not logged. HTML downloads and parsing are bounded; media validation uses HEAD and cancels response bodies. Workers never fetch video bodies.

Each provider has its own Worker to isolate source logic, failures and deployments. Splitting services does not increase the account's free allowance. The 3isk engine follows the episode/movie wrapper and selects ukrcdn's playback API or miravd's bounded Base62 unpacker. The full wrapper Referer is retained for miravd requests. Akoam follows validated watch redirects and extracts alternative qualities. Alooy returns MP4/WebM with the complete watch Referer, Origin and User-Agent.

## Episode identity matters

`edge/config/episodes.json` currently registers all 26 original subtitled Marasli episodes across 3isk and Akoam. It also registers Alooy's first dubbed episode separately. 3isk's dubbed series has 80 episodes, while Alooy has 42: equal episode numbers do not establish equivalent cuts. Other works remain provider-specific until their exact edition/episode mappings are added. Matching is a maintained cloud registry, not an automatic title-fuzzy search. Matching durations/edits and any timeline offsets require additional editorial verification; the player preserves elapsed time, not a guaranteed identical scene across different edits.

`node scripts/edge_registry.mjs --json` generates canonical records and hashed reference indexes for KV. Existing opaque references continue working when source origins are changed in provider configuration. The registered media domain allowlists live in Cloudflare configuration, not in new app binaries.

## Flutter behavior

Production playback requests go to the edge; catalog/news/matches still use Render. Movies and episodes both use edge resolution. No source HTML or Packer extraction executes on the device on this path. An unavailable edge response fails explicitly instead of silently reverting to device scraping.

The source menu displays provider and quality. Manual changes and automatic errors transfer the current position, including positions below five seconds. Edge failures try the next active source before one bounded refresh. Existing buffering/startup watchdogs cover stalled playback. The menu suspends control auto-hide while open.

Edge-issued HTTPS media URLs must be registered by the authenticated API client and remain unexpired before opening. Native protected MP4/WebM uses a random loopback URL; Range/If-Range are forwarded, actual status/content headers are preserved, and byte streaming uses backpressure. Redirects remain on the registered media host. Headers go to the upstream bridge, never the loopback player. Switching/closing aborts previous upstream requests.

Web uses the same edge API but only sources that pass a separate HEAD probe with the GitHub Pages Origin/Referer and permissive CORS. This is a preflight indication, not proof of every segment's CORS. Protected Alooy and miravd sources are native-only; the web client does not silently stream them through Render. Native-only alternatives are omitted from the browser menu. ukrcdn and Akoam returned browser-compatible sources during this check.

## Deployment and limits

Four Workers and one KV namespace were deployed through the connected Cloudflare API, with no paid plan activation. `edge/config/{provider}.jsonc` holds source configuration; `edge/wrangler.jsonc` holds bindings. Provider updates and KV mappings can be published independently of APK/IPA builds after the initial 1.0.41 app upgrade.

The edge-only GitHub workflow validates each build and can deploy with repository secret `CLOUDFLARE_API_TOKEN` scoped to this account's Workers/KV. That CI secret has not been provisioned through this session; connected deployment was used instead. Never commit tokens. Metadata changes do not require a native release.

Free Workers limits currently include 100,000 requests/day, 10 ms CPU/request, 128 MiB memory and 50 external subrequests. Service bindings do not add request fees on Standard pricing, while CPU usage is aggregated across the invoked Workers. KV also has free read/write/storage limits. Video bandwidth through the cloud resolver is zero; HTML/JSON traffic, local device streaming and decoder costs remain real. Free operation is conditional on staying within these allowances, not unlimited zero-cost hosting.

## Validation

- Actual Cloudflare extraction: 3isk miravd, 3isk ukrcdn, Akoam alternatives, Alooy MP4.
- Matched first original Marasli episode returned both 3isk and Akoam; JSON below 5 KiB.
- Node tests: concurrency of three provider services, partial failure, edition isolation, redirects/allowlists, Packer decoding and HEAD-only media validation.
- Flutter analysis and full tests; added edge response/URL registration tests and source menu callback tests for manual/403 changes across providers at two seconds.
- Real Dart/media_kit/libmpv Alooy playback via the edge and local bridge decoded 1280×720 and sought to 60 seconds. This is a Linux decoding test, not a physical Android/iPhone/TV test.
- Native TLS bridge fixture verifies Range/206, full headers, cleanup and target isolation.
- ARM64 mobile, ARMv7 TV and unsigned ARM64 iOS artifacts are built and binary-verified by device CI. Release URLs and CI evidence are appended after completion.

Protected match and news engine files are unchanged.
