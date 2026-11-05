Najd TV 2.0.4 — Beta 5 · build 204

- Season/episode-specific watch checkpoints, including providers with empty or repeated episode IDs. Legacy records remain readable; opening another episode cannot reuse the previous episode’s clock.
- Exact Supabase checkpoint lookup before playback, immediate best-effort checkpoint submission on pause/exit and bounded foreground synchronization. Offline changes remain local and queued for later delivery. Earlier episodes are no longer deleted merely because 80 newer episodes were watched.
- TV linking is receive-only. Each installation uses its own automatically provisioned anonymous identity; playback/browsing does not require a manual account login. The existing explicit provider-switch clock handoff remains available.
- Playback handoff between explicitly linked devices: choose a TV/computer in the player More menu, accept on the receiver, and open the exact season/episode at the sender millisecond position using a freshly resolved stream. Expiring metadata-only requests are owner-scoped; TV sending is rejected by the server as well as the client.
- Observed hosting-server fallback expands beyond the former four-target limit, with bounded concurrency, a scan budget and explicit partial-scan reporting. No login, challenge or access restriction is bypassed.

Website: https://th-505.github.io/NajdTV/
API: https://najdtv.onrender.com

The iPhone IPA requires external signing. macOS is ad-hoc signed and not notarized; Windows is not Authenticode signed. Automated architecture, source/checksum, playback fixtures and regression checks are recorded with the release. Physical-device certification and availability of every external provider are not claimed. Native builds include the supplied Thmanyah typography; public Web uses its licensed fallback with local font import. Offline HLS downloading remains unsupported.

Android upgrade limitation found after package verification: the 2.0.4 APK certificate differs from 2.0.3. These APKs cannot update an installed 2.0.3 app in place. Do not remove an existing installation before preserving its library/session recovery options. A persistent original signing keystore is required for a compatible upgrade; architecture/container/signature-validity checks alone do not prove upgrade continuity. Future native builds now require explicit persistent signing secrets rather than silently generating another disposable debug identity.

Additional iPhone compatibility package: https://github.com/th-505/NajdTV/releases/download/v2.0.4/Najd-TV-iPhone-Unsigned-Compatible.ipa
All 24 device executables are normalized to unsigned thin arm64 with executable permissions. Archive CRC and SHA-256 passed; iOS15+ and external signing are required. This is a packaging compatibility improvement; an actual device installation has not been certified, and the original archive was CRC-valid.
