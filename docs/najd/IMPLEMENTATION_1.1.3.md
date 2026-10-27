# نجد — Najd TV 1.1.3

Source instructions: user-provided Google Drive «أوامر.txt», reviewed in full. Competitor reference set:25 images (OnStream, Netflix, Shahid). References are private research inputs, not product assets.

## Required delivery checklist

- [ ] All six targets use Najd / نجد identity, new original smooth logo, lavender dark/light themes.
- [ ] Contrast-correct titles/buttons/inputs in both themes; safe-area and actual viewport/player measurements.
- [ ] Readable startup poetry, attribution, optional skip; no blocking of direct playback deep links.
- [ ] Thmanyah local font integration. **Latest user instruction: use locally; do not publish raw font files.** Private fonts and the original archive remain outside Git. Distributed source must not claim to contain them.
- [ ] Provider domain/search configuration separated from catalog/season/episode/player extraction.
- [ ] Actual season/episode numbers and source references, complete pagination with resumable cursors; no synthetic60/70/12 episode limits or invented results.
- [ ] Multi-factor TMDB identity matching with Arabic/original/alternative titles and actual provider evidence; conflicting years/episodes rejected.
- [ ] Favorites create persistent jobs automatically from owner-protected Supabase library events.
- [ ] Background workers enumerate works/providers/seasons/episodes and resolve original direct HTTPS MP4/HLS media. No video proxy, ads, or third-party player iframe fallback.
- [ ] Database-first lookup, hybrid fallback on a genuine cache miss;7-day work metadata retention and hourly updates while demanded. Signed media URLs expire at their own actual expiry and are re-resolved separately.
- [ ] Protected server/database admin dashboard showing safe queue/catalog/config/audit summaries, not exposing service keys or unrestricted SQL.
- [ ] Daily Gemini diagnosis, bounded verified fixes, test/live evidence, owner notification. Latest user choice: GitHub reports only temporarily; no SMTP or email sending. Never mark missing keys/quota as successful diagnosis. The reporting workflow now has sanitized artifacts, run summary and a persistent GitHub issue; automatic verified repairs remain pending.
- [ ] Reusable repository skills for brand/theme/accessibility and scraper maintenance, with a concise knowledge index.
- [ ] Remove only proved obsolete generated files; preserve working features, user libraries, bundle identifiers and migration compatibility.
- [ ] Appropriate automated/browser/API/database tests; one final frozen source commit for the six-target release.

Stable internal application IDs, database identifiers and old migration history are retained for installed-user compatibility. They are not visible product branding. No physical-device or all-provider-playback certification is implied by a build.

## Competitor-derived decisions

Retain the user's right-side navigation and dedicated search/exploration section. Add useful filter controls, continue-watching/progress, ranked shelves based on real ranking, clear source availability, consistent primary/secondary actions, sensible player controls and download/storage settings. Do not invent scores,4K/HDR support, live events, posters or availability. In light mode, cards and title contrast must be tested; the video canvas remains dark.
