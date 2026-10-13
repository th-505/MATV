# MATV 1.0.42 final edge release

This is the final deliverable for the architecture documented in [EDGE_RESOLVER_1.0.41.md](EDGE_RESOLVER_1.0.41.md). It additionally distinguishes an intentional zero-second handoff from an absent resume position. Both manual changes and 403 failover retain zero or two seconds rather than restoring an older saved progress entry. An uninitialized failed source still preserves the saved library position.

All original 26 Marasli episode mappings are live in Cloudflare KV. Native playback extraction uses Cloudflare for all three providers; the catalog, matches and news still use Render. No video bodies pass through the edge. Web accepts only browser-compatible alternatives and does not revert to cloud media streaming for protected sources.

The legacy HLS CI job now installs its dependencies before running the complete check suite. Provider/quality display, source switching, free-plan limits, mapping boundaries and independent edge deployment remain as described in the architecture report. Physical-device battery/thermal testing remains unperformed.

Final CI, release assets and live web evidence are recorded below after completion.

Validation: 106 Flutter tests passed, analyzer clean, and Chromium MP4/HLS fixtures decoded with no exceptions. Live Alooy and Akoam libmpv decoding/60-second seeks passed. Miravd master, variant and a ranged segment returned 200/200/206 from a network separate from the extracting Worker.

Device build: https://github.com/th-505/MATV/actions/runs/38417114089 (source commit `f736695`). Final binary verification is pending completion of this run.
