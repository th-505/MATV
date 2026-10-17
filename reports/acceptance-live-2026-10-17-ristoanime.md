# Live acceptance — 2026-10-17

Run: 2026-10-17T16:18:20.749Z – 2026-10-17T16:19:13.655Z UTC. Seed: 505. Serialized app HTTP requests, minimum spacing 1200 ms, per-request timeout 12000 ms.

| Provider | Selection | Work / episode | Type | Test time (UTC) | Outcome | Stage evidence |
|---|---|---|---|---|---|---|
| ristoanime | latest_additions (page 1) | انمي Black Clover الموسم 2 الحلقة 3 مترجمة — الحلقة1 | series | 2026-10-17T16:18:44.076Z – 2026-10-17T16:18:46.989Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | latest_additions (page 1) | انمي Black Clover الموسم 2 الحلقة 3 مترجمة — الحلقة3 | series | 2026-10-17T16:18:46.989Z – 2026-10-17T16:18:53.936Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | latest_additions (page 1) | انمي Tokyo Revengers: Santen Sensou-hen الموسم 4 الحلقة 3 مترجمة | series | 2026-10-17T16:18:53.936Z – 2026-10-17T16:18:54.080Z | no_search_result | search_identity:no_search_result |
| ristoanime | latest_additions (page 1) | انمي Hotaru no Yomeiri الحلقة 2 مترجمة — الحلقة1 | series | 2026-10-17T16:19:00.017Z – 2026-10-17T16:19:02.627Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | latest_additions (page 1) | انمي Hotaru no Yomeiri الحلقة 2 مترجمة — الحلقة2 | series | 2026-10-17T16:19:02.627Z – 2026-10-17T16:19:04.377Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | seeded_random_older_page (page 2) | انمي Tempal: Item no Chikara الحلقة 3 مترجمة — الحلقة1 | series | 2026-10-17T16:19:09.051Z – 2026-10-17T16:19:11.671Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | seeded_random_older_page (page 2) | انمي Tempal: Item no Chikara الحلقة 3 مترجمة — الحلقة3 | series | 2026-10-17T16:19:11.671Z – 2026-10-17T16:19:13.463Z | embed_unverified | success; embed:embed_unverified |
| ristoanime | type_completion (page 1) | فيلم Mononoke Movie 3: Hebigami | movie | 2026-10-17T16:19:13.463Z – 2026-10-17T16:19:13.654Z | no_search_result | search_identity:no_search_result |

## Provider summary

| Provider | Result | Configured domains | Domains actually checked | Samples | Outcome counts |
|---|---|---|---|---:|---|
| ristoanime | tested_with_failures_or_unverified | https://ristoanime.me, https://ristoanime.com | ristoanime.me, www.mp4upload.com | 5 | {"embed_unverified":3,"no_search_result":2} |

An `embed_unverified` result is not playback success. Resource checks read only bounded manifest/Range samples. Flutter playback was not tested by this harness.
