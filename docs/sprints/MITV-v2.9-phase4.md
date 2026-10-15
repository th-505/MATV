# MITV v2.9 — Phase 4 verification

## Auth and library

Anonymous sign-ins were enabled by the owner and verified through the public Auth settings and real Supabase SDK. The app restores one persisted anonymous session and device UUID, queues local changes offline, and uses owner-isolated RLS. The public publishable key is the only cloud key in Flutter.

A server-issued revision cursor prevents a late-arriving offline record from falling behind a timestamp cursor. Writes are batched, deletes retain tombstones, stale writes are rejected, and cloud progress updates are limited to a 60-second cadence while local progress remains frequent. A missing saved owner session does not silently replace the owner with another account.

Real two-owner checks passed: session restoration, device isolation, forbidden cross-owner access, stale mutation rejection, delete preservation and actual LocalLibraryStore sync. The two QA accounts and their local session files were removed after the proof; no production user rows were deleted.

## Metadata lifecycle and downloads

The four-provider private metadata cache stores no media URLs, headers, scripts or signed tokens. Reads/writes are bounded and coalesced; an optional Laroza metadata warm request does not delay playback. Source loading continues during database outages. Demand timestamps are bounded to three observations: three requests within seven days protect a locally trending title for 48 hours. Newness requires explicit publication evidence or a known latest feed, never just a release year.

The daily purge runs at 06:17 Asia/Riyadh. Idle one-off metadata older than seven days is eligible; new, trending and actively followed works are protected. Expired stream cache entries remain governed by their short expiry. Transactional TTL tests used an isolated clock and rolled back all fixtures.

Settings clear only browsing caches and explicitly confirmed downloaded files. In-flight generations cannot repopulate cleared caches; download cancellation waits for file writers and does not follow symlinks. Auth, device ID, sync cursors, favorites and watch history survive cache clearing. Native downloads accept direct MP4, verify the file, and reject HLS and retired cloud-proxy references. The dormant background-download contract is validated but is not a newly implemented native background service.

## Captions and playback clock

Attached caption tracks, local SRT/VTT/ASS files, and keyless Stremio OpenSubtitles v3 are supported. Stremio lookup requires verified work identity and explicit original season/episode coordinates, or an explicit user confirmation; title matches are not guessed. Subtitle bytes follow BOM → strict UTF-8 → Windows-1256 fallback. Native temporary files are normalized UTF-8 and cleaned on disposal. Web uses direct CORS requests and VTT cues, without forbidden native headers or a cloud proxy.

Actual libmpv tests decoded UTF-8 and CP1256 Arabic captions, selected a local subtitle URI, read back native `sub-delay` at +0.5/-0.5/0, and verified subtitles off. A live Stremio request returned five Arabic options and downloaded a valid 121,311-byte SRT without an API key. Basic ASS dialogue is supported; full ASS styling is not promised.

Saved watch positions include stable source, edition and timeline context. Unverified alternate cuts and unknown episode mappings cannot inherit a saved clock. Verified common editions apply their recorded offset. Old records without source context resume only when the original direct title reference is unchanged.

Physical iPhone, Android TV, battery and temperature tests are not claimed by these server/SDK/headless checks. The phase gate passed 276 Flutter tests, with six opt-in environment tests skipped in the default run, clean analysis, and the complete Node/Edge checks. Actual native caption, Stremio and Supabase SDK proofs were run separately as described above. The six release artifacts are recorded after the release gate.
