# NajdTV 3.0.0 / build300 — review checkpoint

User requested version3.0.0, all existing general providers retained, independent Najd/Beta configurations and caches, all observed servers/qualities rather than stopping at first success, fifteen original Thmanyah faces before packaging, and category shelves without falsely claiming IMDb data.

## Implemented

- Media resolution collects verified alternatives after the first success. Host traversal and container probes have separate bounded concurrency, deadlines checked between requests, observed/attempted candidate counts and explicit partial-scan metadata. At most64 observed resolver targets and256 direct candidates per scan; no unlimited crawl or claim of complete enumeration after a bound. Existing source-specific references/headers and guarded HTTP/private-IP protections remain.
- Observed external embeds can use the stateless host resolver rather than being sent to a provider-only reference decoder. When server references are already discovered, these do not require re-resolving the source first. Najd/Beta state and queues remain separate.
- Fixed Beta's premature return inside the candidate-probe loop. Its regression retains three distinct720/1080/1440 sources. This is fixture evidence, not a claim that every server offers those qualities.
- Details decoding had an additional eight-link cutoff after upstream limits had been raised. It now retains up to256 source/quality alternatives, as does source ranking. Known failures still lose priority; equal-health static alternatives prefer observed higher resolution. The expiring URL registry remains memory-bounded.
- HLS master inspection records actual resolution/bandwidth/codecs; the original master remains intact so alternate audio/subtitles are preserved. No fabricated quality, upscaling-to-HD claim, transcoding or arbitrary video proxy. Existing Web HLS controller offers observed level selection and actual decoded/display dimensions. Native quality controls use engine-exposed tracks/source alternatives.
-54 collection policies:22 film,20 series,6 anime,6 Turkish. Real TMDB discover filters include genres, popularity, vote floor for rating ranks, current-year lists and real TV air-date windows. These are TMDB rankings, not IMDb charts. Top-ten shelves have More/pagination, and shelves request data only near the viewport. Continue Watching/My List precede ranked lists. Language filtering and the original paginated grid remain available.
-380 Flutter tests passed with7 environment-dependent skips after adapting navigation/cache tests to lazy shelves. Analysis clean. Node/full runtime checks separately recorded in logs and subsequent validation notes.

## Thmanyah before packaging

The exact uploaded bundle contains three families, each with Light300, Regular400, Medium500, Bold700, Black900. Both original OTF and WOFF2 sets have15 faces. Private originals remain outside Git; only hashes, preparation code and audit metadata enter source control.

- Sans: interface text/buttons/labels.
- Serif Text: readable longer text and supporting headings.
- Serif Display: display headings, hero and poetry styles.

All fifteen family/weight pairs are mapped to the fifteen semantic text roles. Custom font selection still overrides the default deliberately. Original Arabic and Latin glyph coverage was checked on all15 OTF faces. Native unit-test output verified all15 OTF hashes, manifest weights and unchanged license. Release Web output verified all15 WOFF2 hashes/weights/license. Actual Chromium loaded all15 WOFF2 faces without font errors; mobile/desktop screenshots inspected. This is not physical iOS/Android/macOS device certification.

Future native builds reject the old three-face fallback. Public publishing requires the original private bundle URL and verifies all15 WOFF2 faces. Six-target artifact verification checks native font manifests/original bytes in APK, IPA and portable Windows ZIP, Web WOFF2, and the macOS packaging typography report. APK size budget is40MiB to accommodate the expanded original font set; actual final package size remains to be measured.

## Load evidence

See load-profiles-3.0.0.json. Real local HTTP router/Beta cache with injected public markup/media probe, synthetic loopback virtual users paced at one request/second, production rate limiter enabled. Profiles: normal8VU, stress64VU, spike4→64→4VU, five-minute8VU soak. No human users, production Supabase load, external-provider load or production capacity guarantee. Initial test-harness route/pace were corrected before the recorded final report.

## Missing-source research — not activated without full verification

- Fushaar: public self-branded catalogue https://fushaar.link/ ; sampled upcoming film had no public direct stream. Search/positive playable work still needs verification.
- TurkishSerie: https://turkishserie.net/ public series/episode/calendar routes; sampled episode507 linked the real series and adjacent episodes. Client player/search extraction not yet validated.
- Asia2TV: https://asia2tv.com/ public GET catalogue search and episode/series links; sampled episode required login. Do not bypass that requirement or describe it as no content.
- FaselHD: seed redirects to https://www.fasel-hd.co/ showing a challenge. https://fasselhd.com/ is an unconfirmed candidate, not silently substituted.
- Cima4u: seed https://www.cima4u.actor/ parked. https://c4u.top/ branded candidate not proven to be the requested service.
- Drama Online: search matched https://www.dramaonlinelibrary.com/ (academic product), so requested provider identity remains ambiguous.

Official URLs requested for the last three. No existing provider removed or confined to a category. No100-feature completion claim.

## Publication is still pending

The new persistent Android key and private backup exist; original installed APK signatures need not be preserved because the user authorized fresh installation. GitHub input verification run42146474491 passed after bounded normalization of a missing outer JSON brace. The exact four fields, keystore password, private-key password and pinned permanent certificate were verified. No private-key values were repaired and no disposable key generated.

The owner uploaded assets/fonts/Thmanyah-Font-Family.zip to main in commit5debef4. Its SHA256 exactly matches the original chat bundle. Merged that owner commit and made all build targets prefer this verified checkout archive; no additional URL or secret is required. Private URL input remains an optional fallback only. Missing or mismatched input fails rather than publishing fallback typography.

Remaining: live provider repairs/reports, final six-target builds/device checks, safe Web update handling, remaining PWA/native PiP validation and publication. This checkpoint is not a released3.0.0 build.

## Final automated validation before the source checkpoint

-380 Flutter tests passed,7 environment/device-dependent skips; analysis clean.
-210 Node tests passed. npm check passed. Continuation includes75 offline fixture checks with0 failures and0 network attempts.
-Actual native unit-test asset output and Web release asset output verified15 original font faces/weights/license each; Chromium loaded all15 WOFF2 faces without errors.
-Four load profiles including a five-minute soak completed with200 responses on the isolated real-router fixture. This is not a production Supabase benchmark.
-Live22-provider sample: Najd6 passed,10 partial,6 failed; Beta5 passed,10 partial,7 failed. See provider-live-3.0.0.json. No all-provider success claim.
-User delegated alternative-source selection. Additional public checks rejected fasselhd.com as a landing page without usable catalogue cards, and c4u.top samples exposed empty player/server lists despite visible metadata. These are evidence, not newly activated working sources.
-Corrected contradictory Chromium/Windows client hints previously sent alongside a Safari compatibility UA. Public request context stays consistent; no browser-identity farm, login or challenge bypass is implemented.

Signing and font-input blockers are resolved. Run42146474491 proves the permanent signing input; checkout archive checksum5b16d16a091cda3b11f8c86de800793ecb75c78943b7e0091003cdff514ede99 proves the full original font input. Native/six-target CI is now able to start.
