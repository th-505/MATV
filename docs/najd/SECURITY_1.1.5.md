# Najd TV 1.1.5 security verification — 2026-10-27

This records bounded checks, not a claim that every possible vulnerability is absent.

- `npm audit --json` and `npm audit --omit=dev --json`: zero reported advisories across the locked dependency graph on the date above.
- Node regression suite: 79 passing tests. Includes SSRF/private-address rejection, redirected upstream requests, body bounds, CORS, rate limits, episode identity, internal-web asset authentication, GitHub OIDC verification and provider-config isolation.
- Media approval requires observed canonical name and year, and requested season/episode. A positive AI verdict cannot override missing/conflicting identity. Cached media is re-probed and reviewed before returning it to discovery clients.
- Fixed SQL NULL handling in `najd_link_claim`: NULL, empty and forged tokens are rejected. A real token is accepted only as a pending claim; the owner still must approve it. A live database transaction checked all four cases and rolled back its synthetic accounts.
- Link-grant tests separately verified no access before owner approval, one-use replay rejection, unrelated-account isolation and expiry. Background claim/config functions cannot execute as `anon` or `authenticated`; private queue/media/config tables have RLS enabled and no client grants.
- Private web assets require bearer authentication or opaque HttpOnly/Secure/SameSite=Strict cookies. Every asset is checked; paths/symlinks are bounded, caching is disabled, and CSP disallows embedded frames. Public GitHub source remains public; this is runtime access control, not source secrecy.
- Provider changes accept a bounded field allowlist, safe HTTPS domains and selectors, never executable code. Automatic changes require a fixed GitHub workflow identity, live positive/negative checks and revision compare-and-swap. Reports contain known test queries, not users' raw search history or signed media URLs.
- Raw Thmanyah font files remain private/local. ZIP import is size/path/type bounded. Public fallback fonts include their redistributable license.

## Supabase advisor findings that remain intentional or external

The advisor reports RLS-without-policy for private server-only tables. This is intentional deny-by-default, with service-role access only. Do not add permissive policies merely to remove an informational notice. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Account/link RPCs intentionally use SECURITY DEFINER to reach private grant tables, with empty search paths, explicit `auth.uid()` checks and ownership validation. Their authenticated execution is required; anonymous silent accounts still have authenticated sessions and owner-scoped policies. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Leaked-password protection is disabled in the hosted Auth settings. This release uses anonymous sessions, not password registration. Enable the setting before introducing passwords; it was not silently represented as fixed. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Native device, installer-signature and end-to-end production verification are recorded separately from source/unit checks. Unsigned Apple packages do not constitute an App Store or notarized release.
