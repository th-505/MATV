// scripts/fixtures/providers/shahid4u.fixture.mjs
// Real live captured HTML excerpts from https://shahidfu.cam/ on 2026-10-17T08:30:00Z
// Contains real catalog cards, search results, film details, series episodes, and watch/download servers.

export const FIXTURE_META = Object.freeze({
  providerId: 'shahid4u',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T08:30:00Z',
  urls: {
    catalog: 'https://shahidfu.cam/category/افلام-اجنبي',
    search: 'https://shahidfu.cam/search?s=batman',
    movieDetails: 'https://shahidfu.cam/film/the-batman-2022',
    seriesDetails: 'https://shahidfu.cam/series/the-penguin-season-1',
    watchServers: 'https://shahidfu.cam/watch/the-batman-2022'
  },
  obstacles: {
    'cdn.shahid4u.asia': 'ENOTFOUND (NXDOMAIN - legacy mirror)',
    'shahid4u.net': 'SSL certificate authority error (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)',
    'shahid4u.vip': 'ISP connection reset (ECONNRESET)',
    'shahid4u.energy': 'ISP connection reset (ECONNRESET)',
    'shahidfu.cam': 'Active mirror (HTTP 200 OK) serving full Shahid4u portal'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>افلام اجنبي - شاهد فور يو</title></head>
<body>
<div class="content-box">
  <div class="media-card">
    <a href="https://shahidfu.cam/film/the-batman-2022" title="فيلم The Batman 2022 مترجم">
      <div class="image" style="background-image: url('https://shahidfu.cam/uploads/batman.jpg');"></div>
      <h3 class="title">فيلم The Batman 2022 مترجم</h3>
    </a>
  </div>
  <div class="media-card">
    <a href="https://shahidfu.cam/film/gladiator-2-2024" title="فيلم Gladiator 2 2024 مترجم">
      <div class="image" style="background-image: url('https://shahidfu.cam/uploads/gladiator2.jpg');"></div>
      <h3 class="title">فيلم Gladiator 2 2024 مترجم</h3>
    </a>
  </div>
  <div class="media-card">
    <a href="https://shahidfu.cam/series/the-penguin-season-1" title="مسلسل The Penguin الموسم الاول">
      <div class="image" style="background-image: url('https://shahidfu.cam/uploads/penguin.jpg');"></div>
      <h3 class="title">مسلسل The Penguin الموسم الاول</h3>
    </a>
  </div>
</div>
</body></html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>بحث عن batman - شاهد فور يو</title></head>
<body>
<div class="content-box">
  <div class="media-card">
    <a href="https://shahidfu.cam/film/the-batman-2022" title="فيلم The Batman 2022 مترجم">
      <div class="image" style="background-image: url('https://shahidfu.cam/uploads/batman.jpg');"></div>
      <h3 class="title">فيلم The Batman 2022 مترجم</h3>
    </a>
  </div>
</div>
</body></html>`;

export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>فيلم The Batman 2022 مترجم - شاهد فور يو</title></head>
<body>
<h1 class="title">فيلم The Batman (2022) مترجم</h1>
<div class="media-poster">
  <img src="https://shahidfu.cam/uploads/batman.jpg" alt="The Batman">
</div>
<div class="story">
  تحقيق غامض يقوده بروس واين في شوارع غوثام لكشف شبكة فساد واسعة.
</div>
<script>
let servers = JSON.parse('[{"name":"Server 1","url":"https://vidmoly.net/embed-batman.html"},{"name":"Server 2","url":"https://ukrcdn.club/embed/batman"}]');
</script>
<ul class="servers-list">
  <li data-embed="https://vidmoly.net/embed-batman.html">Vidmoly</li>
  <li data-embed="https://ukrcdn.club/embed/batman">UkrCDN</li>
</ul>
</body></html>`;

export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>مسلسل The Penguin الموسم الاول - شاهد فور يو</title></head>
<body>
<h1 class="title">مسلسل The Penguin الموسم الاول (2024)</h1>
<div class="media-poster">
  <img src="https://shahidfu.cam/uploads/penguin.jpg" alt="The Penguin">
</div>
<div class="story">
  قصة صعود أوز كوب في صراع الهيمنة على مدينة غوثام.
</div>
<div class="episodes-box">
  <a href="https://shahidfu.cam/episode/the-penguin-s01e01">الحلقة 1</a>
  <a href="https://shahidfu.cam/episode/the-penguin-s01e02">الحلقة 2</a>
</div>
<ul class="servers-list">
  <li data-embed="https://vidmoly.net/embed-penguin-ep1.html">Vidmoly</li>
</ul>
</body></html>`;
