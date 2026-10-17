# 3isk access diagnosis and ukrcdn PoC — 2026-10-17

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

An earlier live run recorded in [live-provider-results-2026-10-17.md](live-provider-results-2026-10-17.md) reached an HLS master, sub-playlist, and first segment. The follow-up below independently repeated the same path with an explicit proxy agent.

## Follow-up: explicit-proxy PoC

At 17:43:48–17:44:12 UTC, the one-episode resolver was run with an explicit `ProxyAgent` using the environment's configured HTTP CONNECT proxy. This dispatcher existed only in the test process; no global networking setting or application code was changed. Tokens and cookie values were omitted from logs and this report.

| Stage | Host and sanitized path | HTTP | Duration | Validation |
|---|---|---:|---:|---|
| Episode page | `3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/` | 200 | 530 ms | HTML title matched “مسلسل المنظمة الحلقة 187 مترجمة قصة عشق” |
| Watch page | `3iskk.xyz/watch/episodes/serie-teskilat-season-1-episode-187/see/` | 200 | 1,031 ms | Same episode title; page contained one iframe |
| Wrapper/embed | `3iskk.xyz/embed/1/266404/2/` | 200 | 281 ms | Embed page contained one iframe |
| UKRCDN player | `ukrcdn.club/e/[redacted]` | 200 | 309 ms | Player page exposed the playback JSON request |
| Playback JSON | `ukrcdn.club/api/videos/[redacted]/playback` | 200 | 451 ms | JSON returned a direct HLS URL; token values redacted |
| Master playlist | `s3.ukrcdn.xyz/hls/[media-id]/master.m3u8?[redacted]` | 200 | 857 ms | `application/vnd.apple.mpegurl`; valid `#EXTM3U`, 186 bytes |
| 720p sub-playlist | `s3.ukrcdn.xyz/hls/[media-id]/720p/720p.m3u8?[redacted]` | 200 | 349 ms | Valid `#EXTM3U`, 256,508 bytes |
| First segment | `s3.ukrcdn.xyz/hls/[media-id]/720p/720p_000.ts?[redacted]` | 206 | 239 ms | Requested `Range: bytes=0-1023`; received exactly 1,024 bytes, `video/mp2t`, valid MPEG-TS sync byte |

The extracted final URL shape was `https://s3.ukrcdn.xyz/hls/[media-id]/master.m3u8?[token-and-expiry-redacted]`. The returned playback headers were `Referer: https://s3.ukrcdn.xyz/` and the iPhone Safari User-Agent shown by the PoC. The response contained both `token` and `expires` query parameters; their values are deliberately not recorded.

**Result:** the ukrcdn extraction and bounded HLS-resource checks passed through the explicit environment proxy. This confirms this proxy path only. The application's normal Node `fetch` still attempts direct egress in this environment and gets `ECONNREFUSED`; no global proxy setting was changed. This does not establish playback from Render/another deployment, a Flutter device, or a second network. Same-token cross-network/IP-binding validation remains pending. No PR was merged.
