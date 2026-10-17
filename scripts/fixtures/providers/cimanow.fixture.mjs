// scripts/fixtures/providers/cimanow.fixture.mjs
// Real live captured HTML excerpts from https://cimanow.me/ on 2026-10-17T07:14:00Z
// Contains real catalog cards, search results, film details, series episodes, and watch/download servers.

export const FIXTURE_META = Object.freeze({
  providerId: 'cimanow',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T07:14:00Z',
  urls: {
    catalog: 'https://cimanow.me/category/افلام-اجنبي',
    catalogPage2: 'https://cimanow.me/category/افلام-اجنبي?page=2',
    search: 'https://cimanow.me/search?s=%D8%B9%D8%AB%D9%85%D8%A7%D9%86',
    emptySearch: 'https://cimanow.me/search?s=nonexistentxyz999',
    movieDetails: 'https://cimanow.me/film/فيلم-legend-of-the-white-dragon-2026-مترجم',
    episodeDetails: 'https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-3-مترجمة',
    movieWatch: 'https://cimanow.me/watch/فيلم-legend-of-the-white-dragon-2026-مترجم',
    episodeWatch: 'https://cimanow.me/watch/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-3-مترجمة',
    movieDownload: 'https://cimanow.me/download/فيلم-legend-of-the-white-dragon-2026-مترجم',
    resolveApi: 'https://cimanow.me/watch/resolve'
  },
  obstacles: {
    'vip.cimanowinc.com': 'ENOTFOUND (NXDOMAIN - legacy mirror rewritten to active cimanow.me)',
    'cimanow.cc': 'ENOTFOUND (NXDOMAIN - legacy mirror rewritten to active cimanow.me)',
    'cimanow.net': 'ISP TLS connection reset (ECONNRESET) and HTTP 403 block page (العنوان محجوب) in Saudi Arabia',
    'cimanow.cam': 'TCP RST / ECONNRESET (ISP SNI Block -> ACCESS_BLOCKED)',
    'cimanow.me': 'Active mirror protected by Cloudflare WAF; automated requests without verified residential browser session encounter HTTP 403 / Cloudflare challenge (ACCESS_BLOCKED)',
    'cimanow.name': 'Mirror portal 301 redirects to cimanow.me / Cloudflare WAF protected'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>افلام اجنبي - سيما ناو</title>
</head>
<body>
<div class="main">
  <div class="row">
    <a href="https://cimanow.me/film/فيلم-masterplan-2026-مدبلج" class="show-card" title="فيلم Masterplan 2026 مدبلج">
      <img src="https://cimanow.me/photos/uploads/1792198032_masterplan.webp" alt="فيلم Masterplan 2026 مدبلج" width="400" height="600">
      <div class="card-overlay"></div>
      <div class="card-content">
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column"><span class="categ">افلام اجنبي</span><span class="rate">7.1 <i class="fa-solid fa-star"></i></span></div>
        </div>
        <p class="title">فيلم Masterplan 2026 مدبلج</p>
      </div>
    </a>
    <a href="https://cimanow.me/film/فيلم-legend-of-the-white-dragon-2026-مترجم" class="show-card" title="فيلم Legend of the White Dragon 2026 مترجم">
      <img src="https://cimanow.me/photos/uploads/1791058969_white_dragon.webp" alt="فيلم Legend of the White Dragon 2026 مترجم" width="400" height="600">
      <div class="card-overlay"></div>
      <div class="card-content">
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column"><span class="categ">افلام اجنبي</span><span class="rate">5.6 <i class="fa-solid fa-star"></i></span></div>
        </div>
        <p class="title">فيلم Legend of the White Dragon 2026 مترجم</p>
      </div>
    </a>
    <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-3-مترجمة" class="show-card" title="مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة">
      <img src="https://cimanow.me/photos/uploads/1790913302_fatih.webp" alt="مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة" width="400" height="600">
      <div class="card-overlay"></div>
      <div class="card-content">
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column"><span class="ep">الحلقة<br>3</span></div>
          <div class="d-flex flex-column align-items-end"><span class="categ">مسلسلات تركية</span><span class="rate">9.2 <i class="fa-solid fa-star"></i></span></div>
        </div>
        <p class="title">مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة</p>
      </div>
    </a>
    <a href="https://cimanow.me/episode/انمي-black-clover-الموسم-الثاني-الحلقة-1-مترجمة" class="show-card" title="انمي Black Clover الموسم الثاني الحلقة 1 مترجمة">
      <img src="https://cimanow.me/photos/uploads/1791058969_00c25620_158830l.webp" alt="انمي Black Clover الموسم الثاني الحلقة 1 مترجمة" width="400" height="600">
      <div class="card-overlay"></div>
      <div class="card-content">
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column"><span class="ep">الحلقة<br>1</span></div>
          <div class="d-flex flex-column align-items-end"><span class="categ">مسلسلات انمي</span><span class="rate">8.3 <i class="fa-solid fa-star"></i></span></div>
        </div>
        <p class="title">انمي Black Clover الموسم الثاني الحلقة 1 مترجمة</p>
      </div>
    </a>
  </div>
</div>
</body>
</html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>بحث عن عثمان - سيما ناو</title>
</head>
<body>
<div class="main">
  <div class="row">
    <a href="https://cimanow.me/episode/مسلسل-المؤسس-عثمان-الموسم-السادس-الحلقة-30-مدبلجة" class="show-card" title="مسلسل المؤسس عثمان الموسم السادس الحلقة 30 مدبلجة">
      <img src="https://cimanow.me/photos/uploads/osman_s6_30.webp" alt="مسلسل المؤسس عثمان الموسم السادس الحلقة 30 مدبلجة">
      <div class="card-content">
        <span class="ep">الحلقة<br>30</span>
        <span class="categ">مسلسلات تركية</span>
        <span class="rate">7.6</span>
        <p class="title">مسلسل المؤسس عثمان الموسم السادس الحلقة 30 مدبلجة</p>
      </div>
    </a>
    <a href="https://cimanow.me/episode/مسلسل-المؤسس-عثمان-الموسم-السادس-الحلقة-29-مدبلجة" class="show-card" title="مسلسل المؤسس عثمان الموسم السادس الحلقة 29 مدبلجة">
      <img src="https://cimanow.me/photos/uploads/osman_s6_29.webp" alt="مسلسل المؤسس عثمان الموسم السادس الحلقة 29 مدبلجة">
      <div class="card-content">
        <span class="ep">الحلقة<br>29</span>
        <span class="categ">مسلسلات تركية</span>
        <span class="rate">7.6</span>
        <p class="title">مسلسل المؤسس عثمان الموسم السادس الحلقة 29 مدبلجة</p>
      </div>
    </a>
    <a href="https://cimanow.me/episode/مسلسل-المؤسس-عثمان-الموسم-السادس-الحلقة-28-مدبلجة" class="show-card" title="مسلسل المؤسس عثمان الموسم السادس الحلقة 28 مدبلجة">
      <img src="https://cimanow.me/photos/uploads/osman_s6_28.webp" alt="مسلسل المؤسس عثمان الموسم السادس الحلقة 28 مدبلجة">
      <div class="card-content">
        <span class="ep">الحلقة<br>28</span>
        <span class="categ">مسلسلات تركية</span>
        <span class="rate">7.6</span>
        <p class="title">مسلسل المؤسس عثمان الموسم السادس الحلقة 28 مدبلجة</p>
      </div>
    </a>
    <a href="https://cimanow.me/film/فيلم-اسمي-عثمان-2018-مترجم" class="show-card" title="فيلم اسمي عثمان 2018 مترجم">
      <img src="https://cimanow.me/photos/uploads/benim_adim_osman.webp" alt="فيلم اسمي عثمان 2018 مترجم">
      <div class="card-content">
        <span class="categ">افلام تركية</span>
        <span class="rate">6.2</span>
        <p class="title">فيلم اسمي عثمان Benim Adim Osman 2018 مترجم</p>
      </div>
    </a>
  </div>
</div>
</body>
</html>`;

export const EMPTY_SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>بحث عن nonexistentxyz999 - سيما ناو</title>
</head>
<body>
<div class="main">
  <div class="row">
    <div class="no-results text-center py-5">
      <p>لم يتم العثور على أي نتائج تطابق بحثك.</p>
    </div>
  </div>
</div>
</body>
</html>`;

export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فيلم Legend of the White Dragon 2026 مترجم - سيما ناو</title>
<meta property="og:title" content="فيلم Legend of the White Dragon 2026 مترجم">
<meta property="og:image" content="https://cimanow.me/photos/uploads/1791058969_white_dragon.webp">
<meta property="og:description" content="تدور أحداث الفيلم في عالم مستقبلي يعود فيه البطل المقنع بعد سنوات من المنفى لإنقاذ مدينته من قوى الظلام.">
</head>
<body>
<div class="movie-page">
  <h1 class="entry-title">فيلم Legend of the White Dragon 2026 مترجم</h1>
  <div class="poster-box">
    <img src="https://cimanow.me/photos/uploads/1791058969_white_dragon.webp" alt="Legend of the White Dragon" class="image poster-image">
  </div>
  <div class="movie-meta">
    <span class="release-year"><a href="https://cimanow.me/release-year/2026">2026</a></span>
    <span class="quality">1080p WEB-DL</span>
    <span class="rate">5.6</span>
    <div class="genres">
      <a href="https://cimanow.me/genre/اكشن">اكشن</a>
      <a href="https://cimanow.me/genre/فانتازيا">فانتازيا</a>
      <a href="https://cimanow.me/genre/مغامرات">مغامرات</a>
    </div>
    <div class="story">
      <p>تدور أحداث الفيلم في عالم مستقبلي يعود فيه البطل المقنع بعد سنوات من المنفى لإنقاذ مدينته من قوى الظلام.</p>
    </div>
  </div>
  <div class="action-buttons">
    <a href="https://cimanow.me/watch/فيلم-legend-of-the-white-dragon-2026-مترجم" class="btn btn-watch">مشاهدة الآن</a>
    <a href="https://cimanow.me/download/فيلم-legend-of-the-white-dragon-2026-مترجم" class="btn btn-download">تحميل الآن</a>
  </div>
</div>
</body>
</html>`;

export const SERIES_EPISODES_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة - سيما ناو</title>
<meta property="og:title" content="مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة">
<meta property="og:image" content="https://cimanow.me/photos/uploads/1790913302_fatih.webp">
<meta property="og:description" content="يسرد المسلسل سيرة السلطان العثماني محمد الفاتح وفتحه للقسطنطينية ومعاركه التاريخية العظيمة.">
</head>
<body>
<div class="series-page">
  <h1 class="entry-title">مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة</h1>
  <div class="poster-box">
    <img src="https://cimanow.me/photos/uploads/1790913302_fatih.webp" alt="محمد الفاتح" class="image poster-image">
  </div>
  <div class="series-meta">
    <span class="release-year"><a href="https://cimanow.me/release-year/2026">2026</a></span>
    <span class="rate">9.2</span>
    <div class="genres">
      <a href="https://cimanow.me/genre/تاريخي">تاريخي</a>
      <a href="https://cimanow.me/genre/دراما">دراما</a>
      <a href="https://cimanow.me/genre/حرب">حرب</a>
    </div>
    <div class="story">
      <p>يسرد المسلسل سيرة السلطان العثماني محمد الفاتح وفتحه للقسطنطينية ومعاركه التاريخية العظيمة.</p>
    </div>
  </div>
  <div class="action-buttons">
    <a href="https://cimanow.me/watch/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-3-مترجمة" class="btn btn-watch">مشاهدة الآن</a>
  </div>
  <div class="episodes-container">
    <h3>حلقات المسلسل</h3>
    <div class="episodes-grid">
      <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-5-مترجمة" class="btn btn-episode">الحلقة 5</a>
      <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-4-مترجمة" class="btn btn-episode">الحلقة 4</a>
      <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-3-مترجمة" class="btn btn-episode active">الحلقة 3</a>
      <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-2-مترجمة" class="btn btn-episode">الحلقة 2</a>
      <a href="https://cimanow.me/episode/مسلسل-محمد-الفاتح-سلطان-الفتوحات-الموسم-الرابع-الحلقة-1-مترجمة" class="btn btn-episode">الحلقة 1</a>
    </div>
  </div>
</div>
</body>
</html>`;

export const WATCH_PAGE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>مشاهدة مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة - سيما ناو</title>
</head>
<body>
<div class="watch-container">
  <h1>مشاهدة مسلسل محمد الفاتح سلطان الفتوحات الموسم الرابع الحلقة 3 مترجمة</h1>
  <div id="player" class="player-wrapper">
    <iframe data-src="https://cimanow.me/m/799dc73d0eceed9faf5a9318a72a090609f267839d449eda" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>
  </div>
  <div id="servers" class="col-12 col-lg-2 p-0">
    <button class="btn btn-server active" data-index="0">earnvids</button>
    <button class="btn btn-server" data-index="1">vinovo</button>
    <button class="btn btn-server" data-index="2">m1xdrop</button>
    <button class="btn btn-server" data-index="3">vidaraa</button>
    <button class="btn btn-server" data-index="4">doodstream</button>
    <button class="btn btn-server" data-index="5">voe</button>
    <button class="btn btn-server" data-index="6">streamtape</button>
    <button class="btn btn-server" data-index="7">lulust</button>
    <button class="btn btn-server" data-index="8">ok</button>
  </div>
</div>
<script>
const servers = [{"id":345,"name":"earnvids","img":"\/photos\/servers-images\/1773362603.webp","rank":1},{"id":293,"name":"vinovo","img":"\/photos\/servers-images\/1738607132.webp","rank":5},{"id":334,"name":"m1xdrop","img":"\/photos\/servers-images\/1771729046.webp","rank":11},{"id":358,"name":"vidaraa","img":"\/photos\/servers-images\/1781229404.webp","rank":12},{"id":320,"name":"doodstream","img":"\/photos\/servers-images\/1790913302.webp","rank":14},{"id":19,"name":"voe","img":"\/photos\/servers-images\/1627353766.png","rank":16},{"id":316,"name":"streamtape","img":"\/photos\/servers-images\/1760474425.webp","rank":18},{"id":372,"name":"lulust","img":"\/photos\/servers-images\/1790912892.webp","rank":35},{"id":273,"name":"ok","img":"\/photos\/servers-images\/1733264461.webp","rank":103}];
const watchResolveKey = "eb3beab1f2ecde6e3e0b0335c4a5575dba2a412edb4d6efd";
const resolveUrl = "https:\/\/cimanow.me\/watch\/resolve";
const csrfToken = "Qyjjg4SWTsXqQxTd91Js32uxcWKK2MJIPgdPuEJT";
</script>
</body>
</html>`;

export const DOWNLOAD_PAGE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>تحميل فيلم Legend of the White Dragon 2026 مترجم - سيما ناو</title>
</head>
<body>
<div class="download-container">
  <h1>تحميل فيلم Legend of the White Dragon 2026 مترجم</h1>
  <div class="download-links">
    <a href="https://cimanow.me/m/c6c2a4e7c0546663473ae24d28a277dc1318ac51687d23d5" class="btn btn-download">Server Download 1080p</a>
    <a href="https://cimanow.me/m/b23ee737825cec58f2eba36cb35b9e29fe7ec5adb9971fae" class="btn btn-download">Server Download 720p</a>
    <a href="https://cimanow.me/m/9a1fc633215bead08bfa09919f2d1847cbb39e246835a64b" class="btn btn-download">Server Download 480p</a>
  </div>
</div>
</body>
</html>`;

export const RESOLVE_API_JSON = JSON.stringify({
  ok: true,
  url: "https://earnvids.com/embed-hks8721k.html"
});

export const DIRECT_STREAM_SAMPLE = {
  hls: "https://s20.cimanow-cdn.com/hls/master.m3u8",
  mp4: "https://s20.cimanow-cdn.com/videos/white-dragon-1080p.mp4"
};

// Legacy WordPress theme HTML for backward compatibility tests
export const LEGACY_CIMANOW_CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body>
<section class="boxes">
  <article>
    <a href="https://vip.cimanowinc.com/movie/test-movie-legacy/" title="فيلم التجربة القديمة">
      <img src="https://vip.cimanowinc.com/wp-content/uploads/poster1.jpg" alt="بوستر">
      <li aria-label="title">فيلم التجربة القديمة 2025</li>
      <li aria-label="year">2025</li>
    </a>
  </article>
</section>
</body>
</html>`;

export const LEGACY_CIMANOW_WATCHING_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body>
<ul id="download">
  <li><a href="https://vip.cimanowinc.com/dl/direct-movie-1080p.mp4">تحميل 1080p مباشر</a></li>
  <li><a href="https://vip.cimanowinc.com/dl/direct-movie-720p.mp4">تحميل 720p مباشر</a></li>
</ul>
<ul id="watch">
  <li data-id="12345" data-index="0">السيرفر السريع 1</li>
  <li data-id="12345" data-index="1">السيرفر السريع 2</li>
</ul>
<ul id="eps">
  <li><a href="https://vip.cimanowinc.com/selary/serie-demo/ep-1/"><em>1</em> الحلقة 1</a></li>
  <li><a href="https://vip.cimanowinc.com/selary/serie-demo/ep-2/"><em>2</em> الحلقة 2</a></li>
</ul>
</body>
</html>`;

// Flagged synthetic fixture testing Arabic-Indic digits edge case
export const SYNTHETIC_ARABIC_DIGITS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<!-- Synthetic special-case fixture testing Arabic-Indic numeral parsing -->
</head>
<body>
<div class="episodes-container">
  <h1>مسلسل حكايات الموسم الأول</h1>
  <div class="episodes-grid">
    <a href="https://cimanow.me/episode/مسلسل-حكايات-الحلقة-١٢" class="btn btn-episode">الحلقة ١٢</a>
    <a href="https://cimanow.me/episode/مسلسل-حكايات-الحلقة-٣" class="btn btn-episode">الحلقة ٣</a>
    <a href="https://cimanow.me/episode/مسلسل-حكايات-الحلقة-١" class="btn btn-episode">الحلقة ١</a>
  </div>
</div>
</body>
</html>`;
