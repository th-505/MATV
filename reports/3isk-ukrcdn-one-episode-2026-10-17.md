# 3isk ukrcdn one-episode probe — 2026-10-17

This is a single-episode probe of the intended ukrcdn path, using the Teskilat season 1 episode 187 page. No application refactor was performed.

| Stage | Request | Result | Duration | Finding |
|---|---|---:|---:|---|
| Watch page | `https://3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/` | Source connection failed (`ECONNREFUSED`); app route returned HTTP 502 | 5,247 ms source request; 5,274 ms app request | Stopped at the episode watch page |
| `see` page | Not requested | — | — | Not reached |
| Embed / ukrcdn player | Not requested | — | — | Not reached |
| Playback URL | Not requested | — | — | No URL or token obtained |
| HLS manifest / segment | Not requested | — | — | Not testable without a playback URL |

The test used the application's `/api/v1/3isk/resolve` HTTP route with `refresh=1`. The route's diagnostic request identified the failing source host and stage. No token, cookie value, or session data was logged. No video bytes were proxied.

**Classification:** access obstacle at the watch-page request, not an extractor failure. The ukrcdn embed and playback API remain untested in this run. No external deployment URL is configured in this environment, and the same-token second-network/IP-binding test remains pending.

An earlier live run recorded in [live-provider-results-2026-10-17.md](live-provider-results-2026-10-17.md) reached an HLS master, sub-playlist, and first segment. That evidence is separate and time-specific; it does not change the outcome of this current one-episode attempt.
