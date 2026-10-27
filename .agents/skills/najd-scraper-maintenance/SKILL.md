---
name: najd-scraper-maintenance
description: Diagnose and repair Najd provider search, pagination, real episode identity, direct media resolution and private Supabase harvesting without fabricated results or unsafe network requests.
---
# Scraper maintenance protocol (human or Gemini)

Read this file first, then only the affected provider, its registry/config entry and relevant fixture/test. Avoid re-reading the repository. Knowledge index: `docs/SEARCH_DIAGNOSTICS.md`, `docs/SECURITY_EPISODE_REVIEW_1.1.2.md`, `docs/ARCHITECTURE_ATTACHMENT_REVIEW.md`, `docs/najd/IMPLEMENTATION_1.1.3.md`.

Provider selection is explicit. A mirror is an alias, not another independent provider. Domain/search config belongs outside episode/media parsing. Diagnose sent URL, redirects, HTTP status/content type/title, actual search form, raw parsed count and filtered count.403/WAF, login, suspended pages, DNS errors and timeouts are availability failures; empty extraction never proves absence. Do not bypass access controls, execute page scripts, manufacture a successful result, delete a failing source or substitute a different provider silently.

Use shared guarded HTTP on EVERY request (including embedded players), HTTPS, redirect/DNS/private-address validation, response-size/time/queue/work bounds. Parse packed literals within radix/count/length/time limits; never eval. Only actual direct media enters a playback cache; no ad iframe, homepage, thumbnail or guessed URL. Probe headers and actual container; a successful HEAD or build is not full video/device certification. Do not pass signed media URLs, auth/cookies, user searches or credentials to Gemini or public logs.

Preserve actual episode numbers/references: Conan1217 is1217, Movie12 is a film sequel, season1 is not episode1. No index-based numbering, no synthetic12-item lists, no arbitrary60/70 caps. Paginate/resume explicitly; mark partial catalogs with real progress and retry state. Two1216 URLs are alternatives, not invented episodes. Preserve ambiguity rather than mixing works.

Canonical TMDB id/type drives matching. Consider Arabic/original/alternative titles, year, observed runtime/genres/poster/season counts. Never manufacture observed identity from the requested title; reject hard conflicts and quarantine weak evidence. Missing metadata is uncertainty. Private shared work/episode media is separate from owner RLS library rows.7-day catalog retention does not extend an expiring signed link. Hourly refresh jobs must survive process restarts and use atomic claims, leases and bounded retries.

Gemini output is an untrusted proposal. Automatic changes are limited to an explicit config schema/allowlist and require fixtures plus an actual known-positive source check. Never change secrets, workflows, tests, safety validators or enable iframe/video proxy as an automated repair. No arbitrary patch execution. Unverified repairs become reviewable PR/report items. During a release freeze, do not alter main. Notify the owner of repaired/unresolved/missing-configuration states; never claim mail delivery if SMTP was not configured or accepted.

Required checks: affected deterministic fixtures, episode/SSRF/embed security tests, relevant provider suite and continuation checks. A real network block is recorded, not a fabricated pass. Preserve failing evidence privately; commit only sanitized public markup fixtures. Keep reports concise: provider, stage, evidence, proposed change, checks, remaining reason.
