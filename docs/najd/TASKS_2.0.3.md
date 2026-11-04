# Najd TV 2.0.3+203 — implementation checkpoint

Date: 2026-11-04. This is a verification checkpoint, not a release certificate.

## Implemented

- Beta has independent source-owned indexing, playback jobs, caches and configuration context; it does not request TMDB metadata. Saved Beta history retains its scope and source origin.
- Episode entry points follow observed parent, pagination and adjacent episode links, with ordered source numbering, explicit partial state and safe same-site search fallback. No invented episode lists.
- Najd discovery starts up to 20 provider searches concurrently. A slow optional database cache has a bounded deadline and circuit breaker. Beta transport leaves host capacity available to Najd.
- Candidate playback uses each provider’s own resolver stages and verifies media containers; rejected candidates can fall through to another actual server for the same provider.
- Settings service checks report incremental catalog, search, metadata, media and dependency results. Provider configuration is scoped to Najd or Beta.
- The dashboard supports a server-side password hash while retaining existing machine-token authentication. No user password is committed.
- Brstej follows the observed official redirect from brstejj.beer to brstejj.pics. Original references remain accepted.
- Download request headers retain safe Referer/Origin/User-Agent values. Resume and PiP regression coverage remains in place.

## Verified locally

- Flutter analysis: no issues.
- Flutter suite: 359 passed, 7 skipped.
- Node test suite: 179 passed, no failures.
- Continuation provider fixtures: 75 passed, no network requests.
- Provider inventory and 2.0.3+203 version contracts pass.
- Live Beta samples for MyCima, Ahwak and Brstej returned posters, observed episode indexes and media passing container checks. This is not physical-device certification or proof that every work/source is available.

## Release gates still open

- Supabase management SQL, direct Edge database connection and tested pooler connections timed out or failed. Healthy project metadata does not prove database connectivity. Network restrictions have not been verified by the owner.
- New isolated Beta tables/configuration migration and keyed interactive-claim migration are not confirmed applied. Do not claim cloud persistence/configuration ready until verified.
- Temporary schema diagnostic Edge function was replaced with an inert authenticated 410 response (version 4); no repair endpoint remains active.
- Some of the 22 distinct provider audits remain blocked, timed out, empty/unconfirmed or missing media. Do not certify all providers from the three successful live samples.
- Season-link discovery and broad cross-provider pagination need further live coverage; current fixture success is not proof of every site layout.
- Admin password hash deployment and authenticated production verification remain pending.
- Current public website is 2.0.2+202. Previously successful six-target 202 artifacts do not include this branch’s changes. Build 203 and production deployment must be verified independently.

## Next steps

1. Resolve database transport and apply/verify the private migrations and service-only grants.
2. Complete targeted season/pagination and provider failure checks; retain accurate per-stage failures.
3. Run six-target 203 review builds, verify artifacts, deploy the scoped configuration/auth changes, then publish the website and release assets.
