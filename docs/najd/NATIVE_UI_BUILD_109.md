# Native sources and player refinement — iPhone build 109

The work page keeps its poster, official title, story and metadata, with three
primary actions: watch, download, sources. Opening metadata still admits a
background harvest request. Scan progress, per-provider availability and index
choices are shown only after the user opens Sources. Watch goes directly to the
native player and automatic discovery; it does not redirect to a provider list.

The explicit advanced search defaults to all available providers, with up to six
concurrent requests. Results from faster providers appear without waiting for
slow providers. Each provider's stable reference is preserved even for identical
titles. A changed query stops queued work and rejects late results. All-failed
searches are reported as unavailable, not evidence that the work does not exist.

The player has centered transport controls, an LTR timeline, a horizontally
scrollable action strip and shared Najd selection panels for sources, quality,
audio, subtitles, speed and episodes. Light browsing mode still gives the video
white controls on a black surface. Source panels retain the browsing theme and
Thmanyah typography. Menus adapt to portrait, landscape and remote focus targets.
Other remaining menus (season, history ordering, download actions, account link)
use the same panel components or shared themed native controls.

Provider browsing is optional from inside playback. It pauses the current video,
opens the chosen provider's observed metadata and season/episode catalogue, and
restores playback if cancelled. Choosing a source episode keeps the current clock
and opens its actual source reference. For example, an explicit choice of source
season 1 / episode 21 remains source season 1 / episode 21; it is not renamed to
TMDB season 2 / episode 1. A device-local preference remembers that explicit
selection for subsequent Watch and Download actions. Only stable source references
and small display metadata are stored, never signed media URLs or headers.

Explicit source switching preserves the selected clock. Proven timeline offsets
are applied when known. Automatic failure recovery retains the existing stricter
cut/identity checks; it does not silently jump into an unverified cut. Equal clock
positions across different edits are not proof of identical scene alignment.
The previous source progress is saved before a manual switch. Player display
ownership prevents an outgoing player from resetting the replacement to portrait.

The API adds an optional observed source-poster field while retaining existing
canonical response fields for older clients. Explicit source catalogues use the
observed title, poster, synopsis, genres, year and content type where available.
Missing source metadata is not manufactured. No provider access controls, direct
media validation, numbering guards or database ownership policies are bypassed.

Verification uses deterministic provider fixtures and recording playback engines,
including the exact 20-minute / source episode-21 scenario, source-selection
persistence, concurrent/partial/cancelled search, subtitle facade integration,
and narrow portrait/landscape layouts in both themes. Optional captures under
`NAJD_CAPTURE=1` are Flutter widget renders with fixture metadata and blank video,
not physical iPhone screenshots or proof that every external provider is online.
Private original Thmanyah assets remain ignored and are fetched only for the
requested build workflow. Physical iPhone playback remains a device check.
