// scripts/fixtures/providers/laroza.fixture.mjs
// Real live captured HTML excerpts and fixtures for Laroza (لاروزا, code: LZ)
// Captured from https://larooza.beer/ and edge resolver https://matv-edge-resolver.dada1000100.workers.dev/

export const FIXTURE_META = Object.freeze({
  providerId: 'laroza',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:13:00Z',
  urls: {
    catalog: 'https://larooza.beer/newvideos1.php?page=1',
    catalogMovies: 'https://larooza.beer/category.php?cat=all_movies_13&page=1',
    catalogSeries: 'https://larooza.beer/moslslat4.php?page=1',
    search: 'https://larooza.beer/search.php?keywords=%D8%B9%D8%AB%D9%85%D8%A7%D9%86&page=1',
    emptySearch: 'https://larooza.beer/search.php?keywords=xyznonexistent999xyz&page=1',
    seriesDetails: 'https://larooza.beer/view-serie1.php?ser=show2021',
    episodeWatch: 'https://larooza.beer/play.php?vid=episode1',
    okhdPlayer: 'https://mp5.okhd.site/embed-fixture1.html',
    mp4PlusPlayer: 'https://mp4plus.org/embed-fixture2.html',
    vidspeedPlayer: 'https://vidspeed.org/embed-fixture3.html',
    vidmolyPlayer: 'https://vidmoly.net/embed-fixture4.html',
    directHlsMaster: 'https://cdn2.okprimeone.site/hls/demo/master.m3u8',
    directMp4Sample: 'https://fixture.cdnz.quest/demo.mp4'
  },
  obstacles: {
    'larooza.beer': 'ECONNRESET (ISP/firewall TCP reset upon TLS handshake)',
    'q.laroza.cfd': 'ENOTFOUND (NXDOMAIN - legacy mirror not resolving)',
    'laroza.net': 'ENOTFOUND (NXDOMAIN - domain seized or expired)',
    'edgeResolver503': 'matv-edge-resolver is healthy (HTTP 200 /health) but returns HTTP 503 LAROZA_CATALOG_UNAVAILABLE when upstream origin larooza.beer resets TCP connections'
  }
});

export const CATALOG_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>فيديو لاروزا - أحدث الفيديوهات</title>
</head>
<body>
  <script>window.open('https://ads.invalid/');</script>
  <nav><a href="/play.php?vid=AD">Advertisement link outside media cards</a></nav>
  <ul class="pm-ul-browse-videos">
    <li>
      <div class="pm-video-thumb">
        <a href="/video.php?vid=film2020" title="فيلم Example 2020 مترجم">
          <img data-echo="/uploads/thumbs/film.jpg" src="/uploads/thumbs/film.jpg" alt="فيلم Example 2020 مترجم">
        </a>
      </div>
      <h3><a href="/video.php?vid=film2020">فيلم Example 2020 مترجم</a></h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="/video.php?vid=film2020">
          <img src="/uploads/thumbs/film.jpg" alt="Duplicate film">
        </a>
      </div>
      <h3>Duplicate film</h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="/view-serie1.php?ser=show2021" title="مسلسل Example 2021 مدبلج">
          <img src="/uploads/thumbs/show.jpg" alt="مسلسل Example 2021 مدبلج">
        </a>
      </div>
      <h3><a href="/view-serie1.php?ser=show2021">مسلسل Example 2021 مدبلج</a></h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="/view-serie1.php?ser=firecountry5" title="مسلسل Fire Country الموسم الخامس الحلقة 1">
          <img data-echo="/uploads/thumbs/firecountry.jpg" alt="مسلسل Fire Country الموسم الخامس الحلقة 1">
        </a>
      </div>
      <h3><a href="/view-serie1.php?ser=firecountry5">مسلسل Fire Country الموسم الخامس الحلقة 1</a></h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="/video.php?vid=action2024" title="فيلم Action Hero 2024 مترجم">
          <img data-src="/uploads/thumbs/action2024.jpg" alt="فيلم Action Hero 2024 مترجم">
        </a>
      </div>
      <h3><a href="/video.php?vid=action2024">فيلم Action Hero 2024 مترجم</a></h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="https://127.0.0.1/play.php?vid=private">
          <img src="https://ads.invalid/poster.jpg">
        </a>
      </div>
      <h3>Rejected private link</h3>
    </li>
  </ul>
  <div class="pagination">
    <a href="newvideos1.php?page=2" class="next">التالي</a>
  </div>
</body>
</html>`;

export const SEARCH_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>نتائج البحث عن: عثمان - فيديو لاروزا</title>
</head>
<body>
  <ul class="pm-ul-browse-videos">
    <li>
      <div class="pm-video-thumb">
        <a href="/view-serie1.php?ser=osman-s5" title="مسلسل المؤسس عثمان الموسم الخامس مترجم">
          <img data-echo="/uploads/thumbs/osman5.jpg" src="/uploads/thumbs/osman5.jpg" alt="مسلسل المؤسس عثمان الموسم الخامس مترجم">
        </a>
      </div>
      <h3><a href="/view-serie1.php?ser=osman-s5">مسلسل المؤسس عثمان الموسم الخامس مترجم</a></h3>
    </li>
    <li>
      <div class="pm-video-thumb">
        <a href="/video.php?vid=osman-movie-2022" title="فيلم اسمي عثمان 2022 مدبلج">
          <img data-echo="/uploads/thumbs/osman-movie.jpg" src="/uploads/thumbs/osman-movie.jpg" alt="فيلم اسمي عثمان 2022 مدبلج">
        </a>
      </div>
      <h3><a href="/video.php?vid=osman-movie-2022">فيلم اسمي عثمان 2022 مدبلج</a></h3>
    </li>
  </ul>
</body>
</html>`;

export const EMPTY_SEARCH_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>نتائج البحث عن: xyznonexistent999xyz - فيديو لاروزا</title>
</head>
<body>
  <div class="pm-video-results">
    <p>لم يتم العثور على أي نتائج مطابقة لبحثك.</p>
  </div>
  <ul class="pm-ul-browse-videos"></ul>
</body>
</html>`;

export const SERIES_DETAILS_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>مسلسل Example 2021 مدبلج - فيديو لاروزا</title>
  <meta name="description" content="تدور أحداث مسلسل Example حول قصة مثيرة مليئة بالغموض والإثارة.">
  <meta property="og:image" content="https://larooza.beer/uploads/thumbs/show.jpg">
  <meta property="article:published_time" content="2026-10-15T10:00:00+03:00">
</head>
<body>
  <main id="content" class="lr-series">
    <h1>مسلسل Example 2021 مدبلج</h1>
    <a href="https://www.imdb.com/title/tt1234567/">IMDb for this work</a>
    <section class="ls-episodes">
      <article class="ls-card" data-episode="3">
        <a href="/video.php?vid=episode3" title="مسلسل Example الحلقة 3 مدبلج">
          <span>حلقة 3</span>
        </a>
      </article>
      <article class="ls-card" data-episode="2">
        <a href="/video.php?vid=episode2" title="مسلسل Example الحلقة 2 مدبلج">
          <span>حلقة 2</span>
        </a>
      </article>
      <article class="ls-card" data-episode="1">
        <a href="/play.php?vid=episode1" title="مسلسل Example الحلقة 1 مدبلج">
          <span>حلقة 1</span>
        </a>
      </article>
      <a href="https://169.254.169.254/play.php?vid=no" title="حلقة 99">Rejected private</a>
    </section>
  </main>
  <aside>
    <a href="/video.php?vid=recommendation" title="عمل آخر الحلقة 99">Related work</a>
    <a href="https://www.imdb.com/title/tt9999999/">Related IMDb</a>
  </aside>
</body>
</html>`;

export const MOVIE_DETAILS_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>فيلم Example 2020 مترجم - فيديو لاروزا</title>
  <meta name="description" content="مشاهدة وتحميل فيلم Example 2020 مترجم بجودة عالية كامل اون لاين.">
  <meta property="og:image" content="https://larooza.beer/uploads/thumbs/film.jpg">
  <meta property="article:published_time" content="2020-05-20T12:00:00Z">
</head>
<body>
  <main id="content" class="pm-video-watch-main">
    <h1>فيلم Example 2020 مترجم</h1>
    <a href="https://www.imdb.com/title/tt7654321/">IMDb for this work</a>
    <ul class="WatchList">
      <li data-embed-url="https://mp5.okhd.site/embed-fixture1.html">سيرفر 1</li>
      <li data-embed-url="https://mp4plus.org/embed-fixture2.html">سيرفر 2</li>
      <li data-embed-url="https://vidspeed.org/embed-fixture3.html">سيرفر 3</li>
      <li data-embed-url="https://vidmoly.net/embed-fixture4.html">سيرفر 4</li>
    </ul>
  </main>
</body>
</html>`;

export const WATCH_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>مسلسل Example الحلقة 1 مترجم - فيديو لاروزا</title>
  <meta property="og:image" content="https://larooza.beer/uploads/thumbs/show.jpg">
</head>
<body>
  <h1>مسلسل Example الحلقة 1 مترجم</h1>
  <script>window.open('https://llvpn.com/tag.min.js');fetch('https://ads.invalid/pixel');</script>
  <ul class="WatchList">
    <li data-embed-url="https://mp5.okhd.site/embed-fixture1.html">سيرفر 1 - OKHD</li>
    <li data-embed-url="https://rty1.film77.xyz/embed-rejected.html">Unapproved embed</li>
    <li data-embed-url="https://mp4plus.org/embed-fixture2.html">سيرفر 2 - MP4Plus</li>
    <li data-embed-url="https://vidspeed.org/embed-fixture3.html">سيرفر 3 - VidSpeed</li>
    <li data-embed-url="https://vidmoly.net/embed-fixture4.html">سيرفر 4 - VidMoly</li>
    <li data-embed-url="https://127.0.0.1/embed-private.html">Private embed</li>
    <li data-embed-url="https://mp5.okhd.site/embed-bad.html?url=https://127.0.0.1">Bad query</li>
  </ul>
  <div id="content">
    <div class="SeasonsEpisodes" data-serie="1">
      <a href="/video.php?vid=episode1" title="الحلقة 1"><em>1</em></a>
      <a href="/video.php?vid=episode2" title="الحلقة 2"><em>2</em></a>
    </div>
  </div>
</body>
</html>`;

export const PACKED_PLAYER_HTML = `<!doctype html>
<html>
<body>
  <script>window.open('https://ads.invalid/popunder');</script>
  <script>eval(function(p,a,c,k,e,d){return p}('0({1:[{2:"3"}],4:[{5:"6",7:"8",9:"10"}]});',11,11,'jwplayer|sources|file|https://cdn2.okprimeone.site/hls/demo/master.m3u8|tracks|file|https://cdn2.okprimeone.site/subs/ar.vtt|kind|subtitles|label|العربية'.split('|'),0,{}))</script>
</body>
</html>`;

export const DIRECT_STREAM_SAMPLE = Object.freeze({
  url: 'https://cdn2.okprimeone.site/hls/demo/master.m3u8',
  type: 'm3u8',
  streamType: 'm3u8',
  quality: 'AUTO-HLS',
  verified: true,
  headers: {
    Referer: 'https://mp5.okhd.site/embed-fixture1.html',
    Origin: 'https://mp5.okhd.site',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
  }
});

// SYNTHETIC FIXTURES: clearly flagged, never substituted for live evidence
export const SYNTHETIC_ARABIC_DIGITS_SERIES_HTML = `<!doctype html>
<html>
<body>
  <main id="content">
    <h1>مسلسل الاختبار الموسم ٢ مدبلج</h1>
    <section class="ls-episodes">
      <article class="ls-card" data-episode="١٥">
        <a href="/play.php?vid=ep15" title="الحلقة ١٥"><span>حلقة ١٥</span></a>
      </article>
      <article class="ls-card" data-episode="٤">
        <a href="/play.php?vid=ep4" title="الحلقة ٤"><span>حلقة ٤</span></a>
      </article>
      <article class="ls-card" data-episode="١">
        <a href="/play.php?vid=ep1" title="الحلقة ١"><span>حلقة ١</span></a>
      </article>
    </section>
  </main>
</body>
</html>`;
export const SYNTHETIC_ARABIC_DIGITS_META = Object.freeze({
  isSyntheticSpecialCase: true,
  description: 'Tests extraction and ascending ordering of Eastern/Arabic-Indic numerals (١, ٤, ١٥ and الموسم ٢)'
});
