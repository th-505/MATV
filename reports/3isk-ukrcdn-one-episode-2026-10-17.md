# 3isk access diagnosis — 2026-10-17

Reproduction for the Teskilat season 1 episode 187 page. No application refactor or extractor change was made.

Requested page: `https://3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/`

## DNS and transport

At 17:39:55 UTC, `3iskk.xyz` resolved to IPv4 `172.67.169.118`, `104.21.71.36` and IPv6 `2606:4700:3033::6815:4724`, `2606:4700:3035::ac43:a976` (Cloudflare addresses). DNS lookup returned both families; `dns.lookup` took 5.063 s.

Direct TCP connection to the resolved host on port 443 was refused with `ECONNREFUSED` after 5.101 s. A direct Node `fetch` (no explicit proxy dispatcher; Node environment-proxy mode was off) returned `ECONNREFUSED` for both the home page `/` and the episode path, in 5.053 s and 5.035 s respectively. Through the app resolver this made `/api/v1/3isk/resolve` return HTTP 502 after 5.274 s. This is a network-path failure before page parsing.

The environment defines `HTTPS_PROXY`/`HTTP_PROXY` as `proxy:8080` (no proxy credentials); the proxy resolved to `172.31.6.13` and accepted TCP on port 8080 in 3 ms. Requests made through an explicit HTTP CONNECT proxy agent reached the source:

| Request | Result through proxy | Duration | Body |
|---|---:|---:|---|
| Home page `/` (iPhone Safari UA) | HTTP 200 | 567 ms | `text/html`, title `قصة عشق`, 143,642 bytes |
| Episode page (iPhone Safari UA) | HTTP 200 | 548 ms | `text/html`, title `مسلسل المنظمة الحلقة 187 مترجمة قصة عشق - قصة عشق`, 141,318 bytes |

The current app provider uses Node's default `fetch` without a proxy dispatcher. In this environment it therefore attempted direct egress and did not use the configured proxy. This explains the observed `ECONNREFUSED`; the source page is reachable from this environment through its configured proxy.

## Redirect check

An HTTP 302 observed through the proxy pointed from `3iskk.xyz` to `ww4.3ick.club`; this was an observed source redirect, not a guessed mirror. Following it with the compatible test UA produced a redirect cycle: `ww4.3ick.club` returned 301 to `3iskk.xyz`, which returned 302 back to `ww4.3ick.club` for both home and episode paths. With the iPhone Safari UA, both original URLs returned HTTP 200 directly. Because the redirect behavior varied by request/UA and the observed generic-UA chain looped, this check does **not** establish a stable canonical host. No alternative host was selected.

| Stage | Outcome |
|---|---|
| Page transport | Direct: refused; explicit proxy: home and episode HTTP 200 |
| `see` page | Not requested in this access-only diagnosis |
| Embed / ukrcdn player | Not requested |
| Playback URL/token | Not obtained in this run |
| Manifest / segment | Not tested |
| Same-token second-network/IP test | Pending a real playback URL and deployed endpoint |

No token, cookie value, or session data was logged, and no video bytes were proxied. The exact episode URL above is ready for an independent check from the user's network.

An earlier live run recorded in [live-provider-results-2026-10-17.md](live-provider-results-2026-10-17.md) reached an HLS master, sub-playlist, and first segment. That is separate, time-specific evidence; it does not change the outcome or transport diagnosis of this run.
