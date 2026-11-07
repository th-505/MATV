# Independent Najd and beta scraper families

The owner requested independently editable implementations for both product paths.
There are exactly **25 Najd scrapers + 25 beta scrapers = 50 registered scraper
implementations**, plus supporting helper modules. The same source ID is retained
in each family for compatibility with installed histories, source references and
configuration rows. This does not mean fifty distinct upstream websites.

| Concern | Najd | Beta |
|---|---|---|
| Registry | `server/scrapers/registry.mjs` | `server/browser/registry.mjs` |
| Site implementations | `server/scrapers/sites/` | `server/browser/providers/sites/` |
| Source-specific legacy parsers | `server/providers/` | `server/browser/providers/legacy/` |
| Laroza-specific parser | `edge/src/laroza.mjs` | `server/browser/providers/edge/laroza.mjs` |
| Configuration | Najd provider rows | Beta configuration rows / lane |
| Work pipeline | Canonical discovery/harvest | Beta source-work service |
| Source-index parser | `server/harvest/episode-index.mjs` | `server/browser/episode-index.mjs` |

Beta catalog routes, search routes, work indexing, configuration and diagnostics
explicitly select the beta registry. They never fall back to the Najd registry.
Najd's wrapped entry points retain Najd configuration even if called from a beta
async context; beta entry points automatically enter their own configuration lane.
Default-origin registrations are namespaced by family, so independently changing
one family's built-in domains cannot overwrite the other's rewrite rules.

No source parser is re-exported across the two families. The generic guarded HTTP,
normalization, concurrency, literal unpacking and reference-format utilities are
shared infrastructure; source-specific implementations and mutable module state
are separate. Host-player resolution remains a generic transport/media service.
Existing HTTPS, DNS, redirect, private-address, work-budget and container-probe
boundaries stay enforced. This change does not add a media proxy or weaken guards.

## Maintenance

Edit the relevant family explicitly. A fix to a Najd site file does not update
beta automatically, and a beta experiment cannot replace the Najd parser. If a
fix is wanted in both, make two deliberate changes and run both fixture suites.
Do not regenerate beta source files from Najd as part of a build or startup.

`python3 scripts/provider_inventory.py` records both families and their separate
source hashes. `--check` rejects stale inventories. The count is based on real
registered files with `PROVIDER_META`, never fabricated duplicate registry rows.

```sh
node --test tests/scraper-family-isolation.test.mjs
node scripts/providers_unit_and_integration_test.mjs
node --test tests/*.test.mjs
npm run check
npm run test:continuation
python3 scripts/provider_inventory.py --check
node scripts/fivetv_capture_audit.mjs /private/site-capture.json
```

Isolation checks verify all 50 function sets, independently owned provider-parser
dependencies, separate enable/domain/search settings, origin registration and
diagnostic routing. The offline source fixture suite exercises both registries
without network access. Capability restrictions and mirror relationships within
each family remain unchanged; fifty implementations does not certify fifty
working network sources or physical-device playback.

Verification for this change: all 225 Node tests passed, `npm run check` and
`npm run test:continuation` passed, and the dual-registry offline fixture suite
passed 154 checks with zero network attempts. Both 5TV readers independently
parsed the private capture's 151 detail pages and 132 catalog pages without
failure; four service pages were classified outside catalog scope in each audit.
