# T-A-TV 1.1.2: security and episode review

Reviewed 2026-10-27 against the attached Render email, search diagnostic export, Conan screenshot, and architecture DOCX. User diagnostic exports and administrative credentials are not committed.

## Verified security advisories and changes

- Node official October 2026 security release: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases and https://nodejs.org/dist/index.json. Production Docker and CI move from 24.19.0 to **24.22.1**. Other supported engine lines require >=22.23.4 or >=26.12.1 within their major version.
- Dart advisory https://github.com/dart-lang/sdk/security/advisories/GHSA-frr6-h895-5pxp: affected `dart:io` certificate verification on Android, Windows and Linux; patched **Dart 3.13.7 / Flutter 3.47.8**. All native/web release jobs use that Flutter version. Existing installed native binaries require replacement; a server-only deployment cannot patch their embedded SDK.
- Docker rebuild refreshes `ca-certificates` and OpenSSL without disabling HTTPS verification. Verified production image runtime: Node v24.22.1, OpenSSL 3.5.9, non-root uid1000; Debian certificate package 20250419~deb12u2. The Node patch also updates its built-in trust handling; OS package version alone is not evidence of Node CA remediation.
- No application PHP runtime or PHP source was found in this repository. Third-party source websites are outside this deployment's control.
- `npm audit` initially reported three advisories (Wrangler, Miniflare, Undici); lockfile update selects Wrangler4.153.0 and Undici7.30.1. Full audit after update: zero known advisories at review time, including development dependencies.

## Application security findings repaired

1. Match names, tournament names, score/time strings and image attributes were interpolated into HTML without escaping. Home shelf titles/subtitles are now escaped as well, and shelf DOM IDs use generated indexes rather than interpolated metadata. They now use output escaping and public image URL validation. Chromium regression injects HTML/event-handler payloads and verifies inert literal rendering.
2. CORS previously trusted every `*.github.io` origin in two handlers. Production accepts the explicit application origins; unrelated and lookalike origins are rejected at the outer server boundary. Native requests without an Origin remain supported. Loopback development origins are restricted to non-production.
3. Runtime route wrappers could bypass the base API limiter. The final runtime boundary now limits across paths, caps request URL length, sets bounded HTTP timeouts, and adds nosniff, frame denial, referrer and permission policies. Limiter maps are bounded. Direct deployments ignore forged forwarding headers; Render uses the last proxy-appended address rather than attacker-controlled first value. This assumes Render's documented append-style proxy chain; alternate hosting must configure equivalent trusted ingress.
4. Match-logo proxy previously followed redirects before checking the final URL. Redirects are now refused, and the response permits raster image types rather than executable SVG documents.
5. Scraper responses now cap both declared and streamed/decompressed HTML at8MiB. This limits oversized/chunked body memory consumption. Existing private-address, IPv6, redirect and DNS-resolution SSRF regressions remain passing.
6. Search diagnostics remain bearer-protected, no-store, CSP-restricted, memory-only/one-hour and bounded. Runtime Node/OpenSSL versions are available only with the admin token. The key is not embedded in clients or source. Search text remains private operational data; this console is not an authenticated account tracking system.

## Source episode identity correction

Actual source: https://shahidfu.cam/episode-almhqq-kwnan-detective-conan-e1217/

The page listed 12 links for **11 distinct episode numbers**: 1207–1217, including two alternative1216 pages. The public details adapter now retains title/type/own episode identity and an explicit success envelope compatible with the actual browser validator. The old reader missed modern episode tiles; web fallbacks fabricated1–12 and the main play button forced1. Those fallbacks were removed. Shared source identity distinguishes movie sequel numbers, season numbers, years and explicit episode numbers. Episode1217 stays1217, its source reference is retained, unrelated sidebar episodes are excluded, and movie pages do not acquire episode grids. Previous/next uses actual listed neighbors. Unknown lists remain unavailable rather than synthesized. A sanitized exact-markup fixture preserves the two1216 references.

The diagnostic export proves some searches succeed, while other domains reject the server with WAF403, redirect to login, are suspended, time out, or return unconfirmed empty extraction. These are not proof a work is absent; this update does not claim every provider is operational or bypass their access controls.

## Verification and limits

Passed: 64 Node unit tests, Conan1217/movie/XSS Chromium regression, SSRF/CORS/TMDB security suites, project runtime checks and continuation fixtures, responsive shell at390/1365/1920px, Flutter analysis and282 tests (6 existing platform-specific skips), production Docker import and local health/source-list/TMDB-unconfigured smoke. Final hosted deployment and package verification are recorded separately by CI/release receipts.

This is a targeted source/dependency/runtime review, not a guarantee that every possible vulnerability is absent. Cloud account permissions, unrelated deployed services and physical device behavior require their own verification. Existing admin-key handling and bounded telemetry were checked; no credential values are included here.

## Hosted Supabase verification

Queried the active application project: all11 public tables and storage tables have RLS enabled. Owner policies on library/devices and legacy favorites/history use auth.uid()=user_id, with both USING and WITH CHECK for updates. Backend cache/job tables have RLS and no client policies deliberately (deny-by-default), and no client table grants. Privileged maintenance RPCs are not executable by anon/authenticated; the only SECURITY DEFINER event trigger has a fixed pg_catalog search_path and no client execute privileges.

Removed excessive legacy table grants on mitv_favorites and mitv_watch_history: raw anon/PUBLIC have no privileges, authenticated retains only SELECT/INSERT/UPDATE/DELETE under existing owner RLS, and TRUNCATE/TRIGGER/REFERENCES are revoked. Policies now explicitly target authenticated. This retains anonymous Supabase Auth installations (which carry a unique auth.uid and the authenticated database role). Post-change privilege queries confirm the denial and preserved CRUD/backend access. SQL is captured in the CLI-generated migration.

The advisor's anonymous-user notices are expected for this app's per-installation cloud library, not evidence of cross-user access. Cron extension policies are managed defaults; anon/authenticated have no cron schema USAGE. No blanket anonymous-login disable or permissive replacement policy was applied. Leaked-password protection remains disabled in project Auth settings; the current app uses anonymous Auth rather than passwords. If password login is enabled, enable that protection through the Supabase dashboard: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . This account-level setting is not exposed by the connected tools, so it is recorded as outstanding rather than claimed fixed. Database advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

Tracked-source private-key/GitHub-token/AWS-access-key/Supabase-secret-key pattern scan returned no matches. This is a limited pattern scan, not certification of all repository history or credential types.

## Additional server-only embed hardening

A deeper inspection of the playback path found recursive embed requests using raw fetch, outside the shared SSRF/redirect/body-boundary checks. Every request in the generic/special-host embed resolver now uses the shared guarded HTTPS client, including redirect and DNS checks. Private direct-media/base64 bridge candidates are rejected before traversal. Recursive work has depth, total-node, URL-length and time budgets. Untrusted packed player metadata has radix/count/input/output/work limits and literal callback substitutions, avoiding unbounded loops and replacement-string expansion.

Shahid4u now follows the declared same-source watch link (`/watch/.../servers`) and reads modern data-src buttons / the designated player iframe, rejects private candidates, and tries distinct hosts before repeated alternatives. Fixture tests prove the navigation and candidate extraction, not successful live video decoding. A live metadata fetch of the Conan1217 watch page found19 embed buttons (DoodStream, Mixdrop, Share4max); current supported direct-link extraction still returns no valid video. These HTML pages were reachable, so this case is not labeled a WAF failure. No iframe/ad-player fallback or access-control bypass was added. Backend-only resolver corrections apply through the shared API without requiring another native installation.

The Web packaging workflow now separates locked dependency installation, codec setup, fixture generation, episode/XSS checks, MP4 playback, and HLS playback into individually bounded steps. Browser playback mocks Supabase Auth/library traffic and blocks service workers, so CI does not create live users or bypass request fixtures. Both codecs decoded successfully with the patched SDK in local Chromium.
