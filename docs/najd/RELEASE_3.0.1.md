# NajdTV v3.0.1

- Web sections, title pages and exact episode playback have GitHub Pages compatible hash URLs. Refresh preserves the requested page; browser back/forward and native system back retain their respective behavior. The intro runs once per browser session and deep content links skip it. Restoring content does not load hidden Home shelves.
- Player seeking previews the chosen position during dragging and seeks once on release. Previous/next use observed season/episode ordering; season selection appears only when multiple seasons exist, and movie playback hides episode controls.
- Desktop playback enters real window fullscreen through window_manager, restores the prior mode on exit and protects the new episode's window from an old player closing. F and Escape remain available even after decoder failure. Physical Windows/macOS behavior still needs device feedback.
- Device pairing displays a locally generated QR for the short-lived link. After linking and approval, use Player → More → Send playback to choose a linked receiver. The TV remains receive-only; media credentials are not put in sharing URLs.
- Web settings include installation guidance/prompt support. Versioned Najd icon URLs refresh Web metadata; existing OS-installed shortcut metadata can remain cached.
- Bundled Thmanyah remains automatic: three families, five original weights each, OTF for native and WOFF2 for Web. No font import setting. Version/build remain visible below licenses.
- Background indexing and media verification each default to one slot while interactive search keeps twenty slots. Automatic backlog/hourly scans are disabled on the primary service. Short post-deploy CPU samples fell from about 95.5% to below 1% of the free service's 0.15 CPU quota; this is not a sustained-load guarantee or a Supabase/final-bill measurement.

Android uses the existing permanent release signing key. The iPhone IPA is unsigned. Provider availability remains mixed; raw search cards are not proof of identity, episode indexing or playback. Native PiP depends on platform/format support and is not certified on every physical device.

Validation includes controlled Chromium navigation/refresh/history and exact-episode restoration, desktop window ownership/system-back unit tests, and the unified six-target artifact gate. Browser navigation fixtures deliberately do not certify live source decoding.
