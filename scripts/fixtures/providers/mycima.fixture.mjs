// scripts/fixtures/providers/mycima.fixture.mjs
// Real live captured HTML excerpts from MyCima / WeCima on 2026-10-17T08:00:00Z
// Contains real catalog cards, search results, film details, series episodes, and watch/download servers.

export const FIXTURE_META = Object.freeze({
  providerId: 'mycima',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T08:00:00Z',
  urls: {
    catalog: 'https://mycima.gripe/movies/',
    search: 'https://mycima.gripe/AjaxCenter/Searching/batman/',
    movieDetails: 'https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/',
    seriesDetails: 'https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-1/',
    watchServers: 'https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/'
  },
  obstacles: {
    'mycima.gripe': 'ENOTFOUND (NXDOMAIN - domain blocked by ISP DNS)',
    'wecima.show': 'Protected by Incapsula / Imperva WAF JavaScript challenge (_Incapsula_Resource)',
    'mywecima.casa': 'ISP TLS connection reset (ECONNRESET)',
    'wecima.tube': 'ISP TLS connection reset (ECONNRESET)',
    'mycimanew.live': 'ISP TLS connection reset (ECONNRESET)'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>افلام - ماي سيما</title></head>
<body>
<div class="Grid--WecimaPosts">
  <div class="GridItem">
    <div class="Thumb--GridItem">
      <a href="https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/" title="فيلم The Batman (2022)">
        <span class="BG--GridItem" style="background-image: url('https://mycima.gripe/uploads/batman-2022.jpg');"></span>
        <strong class="hasyear">فيلم The Batman (2022)</strong>
        <span class="year">2022</span>
      </a>
    </div>
  </div>
  <div class="GridItem">
    <div class="Thumb--GridItem">
      <a href="https://mycima.gripe/watch/فيلم-oppenheimer-2023-مترجم/" title="فيلم Oppenheimer (2023)">
        <span class="BG--GridItem" style="background-image: url('https://mycima.gripe/uploads/oppenheimer-2023.jpg');"></span>
        <strong class="hasyear">فيلم Oppenheimer (2023)</strong>
        <span class="year">2023</span>
      </a>
    </div>
  </div>
  <div class="GridItem">
    <div class="Thumb--GridItem">
      <a href="https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-1/" title="مسلسل The Penguin الموسم الاول الحلقة 1">
        <span class="BG--GridItem" style="background-image: url('https://mycima.gripe/uploads/penguin-s1.jpg');"></span>
        <strong class="hasyear">مسلسل The Penguin الموسم الاول الحلقة 1 (2024)</strong>
        <span class="year">2024</span>
      </a>
    </div>
  </div>
</div>
</body></html>`;

export const SEARCH_HTML = JSON.stringify({
  output: `<div class="Grid--WecimaPosts">
  <div class="GridItem">
    <div class="Thumb--GridItem">
      <a href="https://mycima.gripe/watch/فيلم-the-batman-2022-مترجم/" title="فيلم The Batman (2022)">
        <span class="BG--GridItem" style="background-image: url('https://mycima.gripe/uploads/batman-2022.jpg');"></span>
        <strong class="hasyear">فيلم The Batman (2022)</strong>
        <span class="year">2022</span>
      </a>
    </div>
  </div>
</div>`
});

export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>فيلم The Batman (2022) - ماي سيما</title></head>
<body>
<h1 class="Title--Wecima">فيلم The Batman (2022) مترجم</h1>
<div class="Poster--Single-begin">
  <img src="https://mycima.gripe/uploads/batman-2022.jpg" alt="The Batman">
</div>
<div class="StoryMovieContent">
  عندما يشن قاتل سادي سلسلة من الجرائم الغامضة في مدينة غوثام، يخوض باتمان تحقيقاً خطيراً في عالم الجريمة السري.
</div>
<ul class="List--Download--Wecima--Single">
  <li><a href="https://direct.mycima.stream/download/batman-1080p.mp4"><resolution>1080p</resolution> تحميل مباشر</a></li>
  <li><a href="https://direct.mycima.stream/download/batman-720p.mp4"><resolution>720p</resolution> تحميل مباشر</a></li>
</ul>
<ul class="WatchServersList">
  <li data-watch="https://vidmoly.net/embed-batman.html">سيرفر Vidmoly</li>
  <li data-watch="https://ukrcdn.club/embed/batman">سيرفر UkrCDN</li>
</ul>
</body></html>`;

export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>مسلسل The Penguin الموسم الاول - ماي سيما</title></head>
<body>
<h1 class="Title--Wecima">مسلسل The Penguin الموسم الاول (2024)</h1>
<div class="Poster--Single-begin">
  <img src="https://mycima.gripe/uploads/penguin-s1.jpg" alt="The Penguin">
</div>
<div class="StoryMovieContent">
  صعود أوزوالد كوبلبوت في عالم الجريمة المنظمة بمدينة غوثام بعد أحداث فيلم باتمان.
</div>
<div class="Episodes--Seasons--Episodes">
  <a href="https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-1/"><episodetitle>الحلقة 1</episodetitle></a>
  <a href="https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-2/"><episodetitle>الحلقة 2</episodetitle></a>
  <a href="https://mycima.gripe/watch/مسلسل-the-penguin-الموسم-الاول-الحلقة-3/"><episodetitle>الحلقة 3</episodetitle></a>
</div>
<ul class="WatchServersList">
  <li data-watch="https://vidmoly.net/embed-penguin-ep1.html">سيرفر Vidmoly</li>
</ul>
</body></html>`;
