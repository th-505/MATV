# Najd TV 1.1.5 delivery plan

Authoritative input: `Prompt_and_Development_Plan_for_Najd_TV_v1.1.5.md`, Drive file `1ENuft4UlnPICpEqWVdkN-4MlUbeecgvO`, read in full. It supersedes conflicting 1.1.3 navigation and public-web requirements. Keep valid prior work, installed-user identifiers and migrations. The latest separate font restriction remains local use only; user ZIP import is allowed without redistributing the raw files.

## Stages and evidence

1. **Identity and responsive shared Flutter UI**: Najd branding, official lavender palette, contrast-correct light/dark themes, four original logo concepts, readable attributed poetry, themed scrollbars, TV modal navigation blur and measured layouts. In progress; tests and packaging required.
2. **Independent providers**: domain/search configuration separate from each site's parsing; TMDB name+year identity; explicit provider content scope; separate search/catalog/direct-media stages; actual episode numbers, resumable pagination and manual exploration. In progress; no fake successes or access-control bypass.
3. **Browse/player**: five bottom shortcuts, scroll-responsive top brand/type filters, TMDB-only regional categories; infinite pages and view-more, 30-minute search cache, rich details/cast/director, real server/quality/audio/subtitle controls, next-episode preparation, episode/season downloads. Pending integration.
4. **Accounts and persistent state**: anonymous owner-protected accounts, explicit secure same-device linking (hardware serials are unavailable to browsers/iOS), one-year inactivity cleanup, five-second progress persistence, seven-day QR authorization, hourly favorites and escalating manual-refresh cooldown. Pending integration and RLS tests. Never merge strangers by fingerprint or a forgeable serial.
5. **Settings and protected dashboards**: bounded safe user ZIP font import, account/profile separate from storage, scoped administration keys and a central dashboard without SQL/service-key exposure. Pending.
6. **Maintenance and security**: concise reusable Gemini knowledge, daily midnight Saudi run with validated config-only repairs and durable discoveries; GitHub-only reports per owner; security checks before release. Reporting shipped and verified separately; automated repairs pending.
7. **Delivery**: version 1.1.5, installable Android mobile/TV, Windows, macOS and iOS release assets; web only through authenticated internal testing, no public web publishing. Keep unsigned iOS/macOS limitations explicit. Pending; no release completion claim without assets and checks.

Do not tick off a stage based only on code presence or a successful build. Record deterministic tests, live behavior and remaining environmental limitations independently.
