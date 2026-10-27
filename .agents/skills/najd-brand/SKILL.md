---
name: najd-brand
description: Apply Najd TV / نجد identity, lavender dark/light themes, private local Thmanyah typography, responsive RTL layouts and readable launch poetry across Web/Flutter/native packages.
---
# Najd identity contract

Read `shared/najd-brand.json`, `docs/najd/IMPLEMENTATION_1.1.5.md`, `web/core/ui-contract.js` and `flutter_app/lib/src/ui_contract.dart` before changing product UI. The product is نجد / Najd TV. Never revive M,TA,MA TV,T-A-TV marks in active UI. Preserve compatibility IDs, user storage keys, migration history and historical release evidence.

Use one original mark from `assets/brand/najd-mark.png`. Generate icons from the master; no pixel-drawn M mark, no competitor logo. Palette reference is the official Riyadh Air site; it is a color reference, not permission to copy its identity. Keep a source URL and observed colors in the shared contract.

Dark=near black/lavender; light=white/lavender. Semantic on-surface/on-accent colors are mandatory. No hardcoded white titles on light cards. Keep video surfaces black independently of browsing theme. Respect actual viewport, safe insets, keyboard, text scaling, RTL, D-pad/focus targets (>=48px handheld,>=64px TV). Device marketing names are test labels, never the source of layout dimensions. Measure actual screen/viewport instead of assuming iPhone models.

Latest user restriction: Thmanyah fonts are local/private. Do not commit OTF/WOFF/archives or encode them to evade the restriction. Use `scripts/prepare_private_fonts.py` locally. Keep the license, never rename or alter font software. Test the documented fallback separately when private assets are absent; do not claim it is Thmanyah.

Launch poetry must preserve the supplied wording and attribution to محمد بن قرملة. Allow enough reading time, a visible skip action, large-screen scaling and reduced motion; direct media deep links may bypass the intro. Verify light/dark states, search, details, player, settings and navigation on narrow mobile, desktop and TV viewports. Do not remove features to satisfy screenshot tests.
