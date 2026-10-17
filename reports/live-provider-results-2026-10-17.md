# Live provider verification — 2026-10-17

All times are UTC. The aggregate `npm run test:live` run paced request starts at least 1.5 seconds apart (including redirects handled as separate requests) and ran provider suites sequentially. The suite command exited **1**: a mixture of access failures, empty/parser results, unsupported capabilities, and stale/strict assertions occurred. A zero exit from an individual legacy suite is not treated as proof that its full capability matrix works. The table records the last stage actually evidenced by the run, not the last function named by a test.

| Provider | Checked at (UTC) | Host(s) actually reached/attempted | Functions exercised | Result classification | Last successful stage / outcome |
|---|---|---|---|---|---|
| 3cktv | 11:32:48 | `e.3cktv.com`, `ei.3cktv.com` | catalog, search, details, episodes, servers, resolve attempted | Access obstacle | Primary returned 302; redirect host DNS failed, so no catalog HTML |
| 3isk | 11:58:20 (rerun) | `ww4.3ick.club`, `3iskk.xyz`, `miravd.com`, `mwdy.cc`, `s25.grzcdn.com` | catalog, search, details, episodes, servers, resolve; HLS master/sub-playlist/segment GET | HTTP resource verified | Full journey through first `.ts` segment: master and sub-playlist contained `#EXTM3U`; segment returned HTTP 200, 695,232 bytes. The earlier hard-coded-domain assertion was corrected to use configured primary/fallback domains. |
| Akwam | 11:33:43 | `ak.sv`, `akwam.ss`, `s303d1.downet.net` | catalog, search, details, servers, resolve; API search→details→episode→resolve; HEAD resource probe | Resource access obstacle | API returned results and two direct server candidates; CDN HEAD returned HTTP 503/timeout. Not an in-app playback test. |
| Alooy TV | 11:57:03 (API journey; live suite 11:56:08) | `fa.alooytv16.xyz`, `vid6.ujeklsj.site` (live suite also `vid9.ujeklsj.site`) | catalog, search, details, episodes, servers, resolve; API search→details→episode→resolve; 32-byte range probe | HTTP resource verified | API journey selected episode 97, returned two direct candidates; one returned HTTP 206 to a 32-byte range. Live suite independently observed MP4 `ftyp` bytes and HTTP 206. No app playback claim. |
| Anime4Up | 11:50:55 (API journey; suite 11:35:22) | `www.anime4up.bond`, `4g.7jcsvwa.shop`, `w1.anime4up.rest`, embed hosts | catalog, search, details, episodes, servers, resolve; API search→details→episode→resolve | Embed-only / resource not checked | API returned 14 search results, One Piece details (48 episodes), episode 1135 and three embed candidates. No direct resource was tested. |
| ArabSeed | 11:35:39 | `www.arabseed.wine` | catalog, search, details, episodes, servers, resolve attempted | Scraper/data mismatch | HTTP page fetch succeeded, but catalog/search parsed empty; no content journey. This is not an access block. |
| CimaNow | 11:36:15 | `cimanow.me` and extracted server hosts | catalog, search, details, servers, resolve attempted | Partial / scraper error | Catalog/search/details/server extraction returned data; resolve logged upstream `TypeError` and no media-resource validation was performed. |
| EgyDead | 11:37:01 | `w1.egydead.top`, `tv10.egydead.live`, `k8w4e.sbs` | catalog, search, details, episodes, servers, resolve; live probe | Mixed: access obstacle + scraper/data mismatch | Main host returned HTTP 503; fallback chain reached HTTP 200 but catalog parsed empty. No verified resource. |
| IPA Universe | 11:37:22 | `watch.ipauniverse.com`, `vidsrc.to` | catalog/search/details/episodes/servers/resolve contracts | Configuration blocker; capability limits | SPA shell was reachable; search/details require a configured TMDb key. Movie episode extraction is not applicable; returned embed was unverified. |
| Laroza | 11:38:25 | `matv-edge-resolver.dada1000100.workers.dev`, `larooza.beer`, `larozza.study`, `llaroza.casa` | catalog, search, details, episodes, servers, resolve, live | Scraper/parser error | Catalog/search pages returned items; details title was generic and yielded no episodes/servers. HTTP reachability succeeded, extraction did not. |
| Mewsry | 11:39:22 | `www.mewsry.live`, `www.soryatv.live`, `www.manasorya.site` and feed hosts | catalog, live, search, details, servers, resolve | Partial; live-event episode capability unsupported | Catalog/search/details/server extraction returned data; resolver produced an HLS-looking URL, but manifest/segment was not checked. |
| MovizTime | 11:52:14 (API journey; suite 11:39:49) | `moviz-time.quest`, `vidhls.com` | catalog, search, details, servers, resolve; API search→details→resolve→HEAD | Scraper error | Search/details/resolve returned a candidate, but HEAD was HTTP 200 `text/html`, not media. Resource validation now rejects HTML responses as media. |
| MyCima | 11:40:38 | `mycima.gripe`, `mycima.gdn`, `fastvip.space`, `mycima-my.com`, `acceptable.a-ads.com`, other extracted hosts | catalog, search, details, episodes, servers, resolve | Scraper/security issue found | Catalog/details/server candidates were returned; a candidate chain reached an `a-ads` host. Ad-host filtering was added after this run; post-fix live resolution is not yet proven. |
| QFilm | 11:41:19 | `a.qfilm.tv` | catalog, search, details, episodes, servers, resolve | Scraper/parser error | HTTP 200 page reachable, but results were empty/generic and server extraction failed. The legacy fixture-oriented suite's exit 0 is not counted as live success. |
| RistoAnime | 11:41:54 | `ristoanime.me`, `vidmoly.net`, `vidmoly.biz` | catalog, search, details, episodes, servers, resolve | Embed/resolution unverified | Content and server listing extracted; resolver followed VidMoly redirect to an HTML host. No manifest/media bytes were verified. |
| Shahid4U | 11:42:03 | `shahidfu.cam` | catalog, search, details, episodes, servers, resolve attempted | Scraper/parser mismatch | HTTP 200, but catalog parsed zero items. No content journey. |
| Witanime | 11:42:25 | `www.witanime.net`, `witanime.site` | catalog, search, details, episodes, servers, resolve, live | Access obstacle | Gateway redirected to active host; that host returned HTTP 403 for catalog/data requests. Direct-looking resolve output was not verified. |
| YallaShoot | 11:58:29 (rerun) | `yalla-shootz.cc`, extracted `aerar.vip-gx.online` | catalog succeeded; search/episodes declared unsupported; details/servers/resolution not reached in rerun | Scraper/source-integrity error | Catalog returned 10 matches, but the selected match URL pointed outside configured provider domains. Kept as a failure rather than weakening the host assertion. |
| Anime4Up Rest | 11:42:53 | `4g.7jcsvwa.shop`, `w1.anime4up.rest` | search/catalog probe | Partial live search | Redirect chain reached the configured rest host and search returned 14 results; details/episode/servers were not exercised for this alias. |
| EgyDead Live | 11:43:02 | `k8w4e.sbs`, `tv10.egydead.live` | catalog/search probe | Scraper/parser mismatch | HTTP 200 after redirects, but catalog parsed zero items. |
| Shii4U | 11:43:09 | `shii4u.cam` | search probe | Access obstacle | DNS/network resolution failed before a page was obtained. |

## Actual application HTTP journeys

These requests used the running Node application routes, not direct calls to provider functions. They verify HTTP/API behavior only; none exercised Flutter's player UI.

| Provider and time (UTC) | API journey | Resource check | Finding |
|---|---|---|---|
| Anime4Up — 11:50:55 | `/api/v1/search` 200 (14 results) → `/api/cinema/details` 200 (One Piece, 48 episodes) → selected episode 1135 → `/api/v1/resolve` 200 (3 candidates) | Not run: all returned candidates were embeds | API flow passed through resolver; playback resource remains unverified. |
| Akwam — 11:51:25 | search 200 (8 results) → details 200 (“حد أقصى”) → episode 1 → resolve 200 (2 direct candidates) | HEAD to CDN returned HTTP 503 / timeout | Scraper/API path passed; external CDN access blocked at resource stage. |
| MovizTime — 11:52:14 | search 200 (16 results) → details 200 (Batman movie) → no episode applicable → resolve 200 (one candidate) | HEAD 200, `text/html` | Candidate is an intermediate webpage, not a verified direct media resource. |
| Alooy — 11:56:44–11:57:03 | search 200 (3 results) → details 200 (15 episodes) → episode 97 → resolve 200 (2 direct candidates) | HEAD omitted content type; a bounded `Range: bytes=0-31` GET returned 206 | API flow and MP4 byte-range resource verified. This does not establish in-app playback. |

## Follow-up checks after the aggregate run

- 3isk rerun completed successfully at 11:58:20 UTC through a real HLS manifest, sub-playlist and a 695,232-byte transport-stream segment.
- YallaShoot rerun confirmed the source-integrity failure: its match reference points at `aerar.vip-gx.online`, outside the configured YallaShoot domains. This needs parser investigation; it was not reclassified as an assertion-only issue.
- Alooy rerun confirmed the API journey and a small MP4 byte-range response.
- No Flutter/native/web player session was exercised. Therefore **no source is reported as successfully playing inside the app**.

## Classification definitions

- **Access obstacle:** DNS, connection, timeout, WAF, or upstream HTTP denial prevented the relevant page/resource from being fetched.
- **Scraper/parser error:** HTTP access succeeded, but the expected content, correct identity, server, or media resource was not extracted.
- **Unsupported capability:** the source does not expose that operation (for example, episodes for a live match). This is not a network failure.
- **Configuration blocker:** a required optional integration value, such as a TMDb API key, is not configured.
- **Embed-only / unverified:** an embed URL was returned; this is neither a direct media resource nor proof of playback.

## Targeted live reruns after provider fixes (2026-10-17 15:33 UTC)

Only CimaNow, MovizTime, RistoAnime, Laroza, and ArabSeed were rechecked because their resolver/source behavior changed. Shahid4U and inactive YallaShoot were intentionally not probed again. These live scripts did not emit per-run timestamps; the exact start time for each probe was not recorded, so no precise timestamp is inferred here.

| Provider | Time (UTC) | Host(s) | Journey / final probe | Classification | Last verified stage |
|---|---|---|---|---|---|
| CimaNow | 15:xx UTC (exact start not recorded) | `cimanow.me` | Catalog/search/details/episodes/servers/resolve for “Masterplan 2026” | TypeError fixed; content API stages live; embed unverified | Resolve returned an embed, no direct resource/playback proof. |
| MovizTime | 15:xx UTC (exact start not recorded) | `moviz-time.quest`, `vidhls.com` | Catalog/search/details/servers/resolve for “Norm: The Tale of Norm MacDonald 2026”; prior HEAD on candidate was HTTP 200 `text/html` | HTML candidate rejected as direct media; resolver safely returns embed | Resolve returned `EMBED_UNVERIFIED`. |
| RistoAnime | 15:xx UTC (exact start not recorded) | `ristoanime.me`, `vidmoly.net`, `prx-1562-ant-o.vmpx.online` | Catalog/search/details/episodes/servers/resolve; attempted manifest GET and first segment only if manifest valid | Parser extracted tokenized HLS candidate; external fetch failed before manifest validation | `.m3u8` candidate only; manifest and segment unverified due fetch failure. |
| Laroza | 15:xx UTC (exact start not recorded) | `matv-edge-resolver.dada1000100.workers.dev`; direct origins `larooza.beer`, `q.laroza.cfd`, `laroza.net` | Live catalog and search → real series ref “Tulsa King مترجم” → details/episodes → server list → resolver | Edge-backed detail journey succeeded; direct origins had ECONNREFUSED/ENOTFOUND; server candidates were embeds | Title plus 2 episodes and 4 server candidates; resolver embed unverified. Edge `/health` through the shared safe HTTP client returned HTTP 200. |
| ArabSeed | 15:xx UTC (exact start not recorded) | `www.arabseed.wine` and configured fallbacks | Live catalog probe | Account suspension identified from response body/URL; classified `SOURCE_UNAVAILABLE`, not parser-empty | No usable content stage; account suspended. |

Resource checks distinguish player URLs from direct media. RistoAnime did not yield a fetched manifest/segment. CimaNow, MovizTime, and Laroza yielded no verified in-app playback. The QFilm bounded-resolver behavior is fixture-verified only in this rerun.
