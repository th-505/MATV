# Native interface integration — iPhone build 108

Build 107 packaged the pre-existing Flutter routes. The 81 HTML entries in
`design/najd-ui` were a design catalogue and were not app screens. Catalogue
presence is not evidence of native implementation.

Build 108 changes production Flutter routes rather than opening that catalogue:

- Home: poster hero, save action, real catalogue shelves, continue watching.
- Search/catalogue: native cards, loading, no results, retry; existing provider
  selection, pagination and request cancellation remain connected.
- Film/series details: banner, actual metadata, plot surface, episode navigation;
  source identity and season/episode matching remain unchanged.
- My list/history: native filters/editing, individual removal, progress, confirmation
  before clearing history; clearing preserves favorites and downloads.
- Downloads: completed/active tabs, real byte progress, cancellation confirmation,
  retry, verified local playback and confirmation before deleting a device file.
- Settings: appearance cards and preserved account, font and cleanup actions.
- Player: purple central control, themed source dialog selecting actual streams,
  unavailable-source state with real retry.

Shared components in `stitch_design.dart` are used by these routes. Progress is
explicitly LTR inside the Arabic RTL interface. Empty, loading and error states
use the same native components in both themes.

## Verification and limits

`stitch_native_routes_test.dart` exercises production routes and verifies that
cancel/confirm history clearing preserves favorites. `NAJD_CAPTURE=1` optionally
captures Flutter widget renders at 390 × 844 with the private original font;
fixtures deliberately use empty poster URLs, so placeholders in those captures
are expected. These are widget renders, not iPhone device screenshots.

This is **not a claim that all 81 designs are finished**. Dedicated TV layouts,
full device capacity reporting, download quality selection, next-episode overlay,
and detailed quality/audio/subtitle/link-refresh layouts still need integration
and acceptance against the catalogue. Existing working playback controls remain
available. Device storage values from a design example (128/3.6/88.6/35.8 GB)
are not fabricated as live device measurements.

The private font is fetched only during the explicitly requested iPhone workflow,
checked against its SHA-256 and copied to ignored assets with its license. Raw
font sources are never committed. Unsigned IPA still needs external signing;
physical iPhone verification is separate from widget and packaging checks.
