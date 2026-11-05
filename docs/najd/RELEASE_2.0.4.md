Najd TV 2.0.4 — Beta 5 · build 204

- Season/episode-specific watch checkpoints, including providers with empty or repeated episode IDs. Legacy records remain readable; opening another episode cannot reuse the previous episode’s clock.
- Exact Supabase checkpoint lookup before playback, immediate best-effort checkpoint submission on pause/exit and bounded foreground synchronization. Offline changes remain local and queued for later delivery. Earlier episodes are no longer deleted merely because 80 newer episodes were watched.
- TV linking is receive-only. Each installation uses its own automatically provisioned anonymous identity; playback/browsing does not require a manual account login. The existing explicit provider-switch clock handoff remains available.
- Observed hosting-server fallback expands beyond the former four-target limit, with bounded concurrency, a scan budget and explicit partial-scan reporting. No login, challenge or access restriction is bypassed.

Website: https://th-505.github.io/NajdTV/
API: https://najdtv.onrender.com

The iPhone IPA requires external signing. macOS is ad-hoc signed and not notarized; Windows is not Authenticode signed. Automated architecture, source/checksum, playback fixtures and regression checks are recorded with the release. Physical-device certification and availability of every external provider are not claimed. Native builds include the supplied Thmanyah typography; public Web uses its licensed fallback with local font import. Offline HLS downloading remains unsupported.
