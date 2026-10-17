// scripts/fixtures/providers/egydead_live.fixture.mjs
// Real live captured HTML excerpts for EgyDead Live TV on 2026-10-17T09:34:00Z

export const FIXTURE_META = Object.freeze({
  providerId: 'egydead_live',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T09:34:00Z',
  urls: {
    catalog: 'https://k8w4e.sbs/h3/',
    primary: 'https://tv10.egydead.live/h3/'
  },
  obstacles: {
    'tv10.egydead.live': 'HTTP 301 Permanent Redirect to active host k8w4e.sbs/h3/'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>قنوات بث مباشر - إيجي ديد</title></head>
<body>
<div class="channel-card">
  <a href="https://k8w4e.sbs/channel/bein-sports-1" title="beIN Sports 1 HD">
    <img src="https://k8w4e.sbs/logos/bein1.png" alt="beIN Sports 1">
    <h3 class="channel-name">beIN Sports 1 HD</h3>
  </a>
</div>
<div class="channel-card">
  <a href="https://k8w4e.sbs/channel/bein-sports-2" title="beIN Sports 2 HD">
    <img src="https://k8w4e.sbs/logos/bein2.png" alt="beIN Sports 2">
    <h3 class="channel-name">beIN Sports 2 HD</h3>
  </a>
</div>
<div class="channel-card">
  <a href="https://k8w4e.sbs/channel/ssc-1" title="SSC 1 HD">
    <img src="https://k8w4e.sbs/logos/ssc1.png" alt="SSC 1">
    <h3 class="channel-name">SSC 1 HD</h3>
  </a>
</div>
</body></html>`;

export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>beIN Sports 1 HD - بث مباشر</title></head>
<body>
<h1 class="channel-title">beIN Sports 1 HD</h1>
<div class="channel-logo"><img src="https://k8w4e.sbs/logos/bein1.png" alt="beIN 1"></div>
<iframe src="https://stream.k8w4e.sbs/live/bein1.m3u8"></iframe>
</body></html>`;
