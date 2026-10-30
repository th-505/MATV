# Isolated Conan relay access test

Node 22+; no dependencies. Set a random RELAY_ACCESS_TOKEN (24+ URL-safe characters) in hosting secrets. Start: `node scratch/conan-relay/server.mjs`.

Public health: `/health`. Private paths: `/<token>/status`, `/<token>/refresh`, `/<token>/index.m3u8`, `/<token>/myte.mp4`.

Only verified source formats are exposed. MP4 responses stream bytes with Range support; HLS variant/segment/key requests stay behind the relay. Source hosts and HLS directory are constrained. No TLS validation bypass.

This is an access test: free hosting can sleep, so the process timer alone does not guarantee hourly updates. A persistent external scheduler is required for the final service. A successful playlist does not certify the whole movie; verify variant and media segment playback too.
