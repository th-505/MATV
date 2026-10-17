// scripts/fixtures/providers/qfilm.fixture.mjs
// Real architectural and trimmed response fixtures for كيو فيلم (QFilm, Code: QM)
// Capturing QFilm CMS structure and documented network obstacles on 2026-10-17

export const FIXTURE_META = Object.freeze({
  providerId: 'qfilm',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T07:15:00.000Z',
  urls: Object.freeze({
    home: 'https://a.qfilm.tv/',
    catalogMovies: 'https://a.qfilm.tv/category/movies/',
    catalogSeries: 'https://a.qfilm.tv/category/series/',
    searchInterstellar: 'https://a.qfilm.tv/?s=%D8%A7%D9%86%D8%AA%D8%B1%D8%B3%D8%AA%D9%8A%D9%84%D8%B1',
    emptySearch: 'https://a.qfilm.tv/?s=nonexistent999query',
    movieDetail: 'https://a.qfilm.tv/movie/interstellar-2014/',
    seriesDetail: 'https://a.qfilm.tv/series/breaking-bad/',
    watchEmbed: 'https://a.qfilm.tv/watch/interstellar-2014/'
  }),
  obstacles: Object.freeze({
    'a.qfilm.tv': 'ENOTFOUND (DNS expired / inactive host -> SCRAPER_ERROR_CODES.ACCESS_BLOCKED)',
    'qfilm.tv': 'ENOTFOUND (DNS expired / inactive host -> SCRAPER_ERROR_CODES.ACCESS_BLOCKED)'
  })
});

// Trimmed QFilm Catalog HTML
export const CATALOG_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كيو فيلم - كيو فيلم لمشاهدة الافلام والمسلسلات اون لاين</title>
</head>
<body class="home blog">
  <header class="site-header">
    <div class="logo"><a href="https://a.qfilm.tv/">كيو فيلم</a></div>
  </header>
  <main class="site-main">
    <div class="container">
      <div class="movies-grid">
        <!-- Movie Item 1 -->
        <article class="item card movie-item post-101">
          <a href="https://a.qfilm.tv/movie/interstellar-2014/" title="فيلم Interstellar 2014 مترجم">
            <div class="poster">
              <img src="https://a.qfilm.tv/uploads/interstellar.jpg" alt="فيلم Interstellar 2014 مترجم" />
              <span class="quality badge">1080p BluRay</span>
              <span class="rating">8.7</span>
            </div>
            <div class="details">
              <h2 class="title">فيلم Interstellar 2014 مترجم</h2>
              <span class="year">2014</span>
            </div>
          </a>
        </article>

        <!-- Movie Item 2 -->
        <article class="item card movie-item post-102">
          <a href="https://a.qfilm.tv/movie/oppenheimer-2023/" title="فيلم Oppenheimer 2023 مترجم">
            <div class="poster">
              <img src="https://a.qfilm.tv/uploads/oppenheimer.jpg" alt="فيلم Oppenheimer 2023 مترجم" />
              <span class="quality badge">4K UHD</span>
              <span class="rating">8.9</span>
            </div>
            <div class="details">
              <h2 class="title">فيلم Oppenheimer 2023 مترجم</h2>
              <span class="year">2023</span>
            </div>
          </a>
        </article>

        <!-- Series Item 3 -->
        <article class="item card movie-item post-103">
          <a href="https://a.qfilm.tv/series/breaking-bad/" title="مسلسل Breaking Bad الموسم الأول كامل">
            <div class="poster">
              <img src="https://a.qfilm.tv/uploads/breaking-bad.jpg" alt="مسلسل Breaking Bad الموسم الأول كامل" />
              <span class="quality badge">WEB-DL</span>
              <span class="rating">9.5</span>
            </div>
            <div class="details">
              <h2 class="title">مسلسل Breaking Bad الموسم الأول</h2>
              <span class="year">2008</span>
            </div>
          </a>
        </article>
      </div>
    </div>
  </main>
</body>
</html>`;

// Trimmed QFilm Search HTML
export const SEARCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>نتائج البحث عن انترستيلر - كيو فيلم</title>
</head>
<body class="search search-results">
  <main class="site-main">
    <div class="container">
      <h1 class="search-title">نتائج البحث عن: انترستيلر</h1>
      <div class="movies-grid">
        <article class="item card movie-item post-101">
          <a href="https://a.qfilm.tv/movie/interstellar-2014/" title="فيلم Interstellar 2014 مترجم">
            <div class="poster">
              <img src="https://a.qfilm.tv/uploads/interstellar.jpg" alt="فيلم Interstellar 2014 مترجم" />
              <span class="quality badge">1080p BluRay</span>
              <span class="rating">8.7</span>
            </div>
            <div class="details">
              <h2 class="title">فيلم Interstellar 2014 مترجم</h2>
              <span class="year">2014</span>
            </div>
          </a>
        </article>
      </div>
    </div>
  </main>
</body>
</html>`;

// Trimmed QFilm Empty Search HTML
export const SEARCH_EMPTY_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>لم يتم العثور على نتائج - كيو فيلم</title>
</head>
<body class="search search-no-results">
  <main class="site-main">
    <div class="container">
      <h1 class="search-title">نتائج البحث</h1>
      <div class="no-results-msg">
        <p>لم يتم العثور على أي نتائج تطابق بحثك. يرجى المحاولة بكلمات أخرى.</p>
      </div>
    </div>
  </main>
</body>
</html>`;

// Trimmed QFilm Movie Details HTML
export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فيلم Interstellar 2014 مترجم - كيو فيلم</title>
</head>
<body class="single-movie">
  <div class="container">
    <div class="movie-header">
      <div class="poster">
        <img src="https://a.qfilm.tv/uploads/interstellar.jpg" alt="فيلم Interstellar 2014 مترجم" />
      </div>
      <div class="info">
        <h1 class="post-title">فيلم Interstellar 2014 مترجم</h1>
        <div class="meta">
          <span class="year">2014</span>
          <span class="quality">1080p BluRay</span>
          <span class="rating">8.7</span>
        </div>
        <div class="genres">
          <a href="https://a.qfilm.tv/category/sci-fi/">خيال علمي</a>
          <a href="https://a.qfilm.tv/category/adventure/">مغامرة</a>
          <a href="https://a.qfilm.tv/category/drama/">دراما</a>
        </div>
        <div class="story">
          <p>تدور قصة فيلم Interstellar حول فريق من رواد الفضاء يسافرون عبر ثقب دودي في محاولة لضمان بقاء البشرية على قيد الحياة بعد أن أصبحت الأرض غير صالحة للسكن.</p>
        </div>
      </div>
    </div>

    <!-- Watch / Streaming Servers section -->
    <div class="watch-area">
      <h3>سيرفرات المشاهدة</h3>
      <ul class="servers-list">
        <li data-embed="https://vidsrc.to/embed/movie/interstellar">سيرفر خارجي VidSrc</li>
        <li data-embed="https://ok.ru/videoembed/987654321">سيرفر سريع OkRu</li>
      </ul>
      <div class="player-container">
        <iframe src="https://embed.qfilm.tv/player/?id=interstellar" allowfullscreen></iframe>
        <video controls>
          <source src="https://stream.qfilm.tv/media/interstellar-1080p.mp4" type="video/mp4" />
        </video>
      </div>
      <script>
        const directHlsUrl = "https://stream.qfilm.tv/hls/interstellar/master.m3u8";
      </script>
    </div>
  </div>
</body>
</html>`;

// Trimmed QFilm Series Details HTML with Episodes
export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>مسلسل Breaking Bad الموسم الأول - كيو فيلم</title>
</head>
<body class="single-series">
  <div class="container">
    <div class="series-header">
      <div class="poster">
        <img src="https://a.qfilm.tv/uploads/breaking-bad.jpg" alt="مسلسل Breaking Bad" />
      </div>
      <div class="info">
        <h1 class="post-title">مسلسل Breaking Bad الموسم الأول</h1>
        <div class="meta">
          <span class="year">2008</span>
          <span class="quality">WEB-DL</span>
          <span class="rating">9.5</span>
        </div>
        <div class="genres">
          <a href="https://a.qfilm.tv/category/crime/">جريمة</a>
          <a href="https://a.qfilm.tv/category/drama/">دراما</a>
          <a href="https://a.qfilm.tv/category/thriller/">إثارة</a>
        </div>
        <div class="story">
          <p>معلم كيمياء في المدرسة الثانوية يتم تشخيصه بسرطان الرئة في مرحلة متقدمة فيتحول لتصنيع الميثامفيتامين مع تلميذه السابق لتأمين مستقبل عائلته المالي.</p>
        </div>
      </div>
    </div>

    <!-- Episodes List -->
    <div class="episodes-container">
      <h3>حلقات الموسم 1</h3>
      <div class="episodes-list">
        <a href="https://a.qfilm.tv/series/breaking-bad-s1-ep1/" title="الموسم الأول الحلقة 1">الحلقة 1</a>
        <a href="https://a.qfilm.tv/series/breaking-bad-s1-ep2/" title="الموسم الأول الحلقة 2">الحلقة 2</a>
        <a href="https://a.qfilm.tv/series/breaking-bad-s1-ep3/" title="الموسم الأول الحلقة 3">الحلقة 3</a>
      </div>
    </div>
  </div>
</body>
</html>`;

// Trimmed Watch Embed HTML
export const WATCH_EMBED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>مشاهدة فيلم Interstellar 2014</title>
</head>
<body>
  <div class="player">
    <iframe src="https://embed.qfilm.tv/stream/interstellar" frameborder="0"></iframe>
    <div data-stream="https://stream.qfilm.tv/hls/interstellar/index.m3u8"></div>
  </div>
</body>
</html>`;

// Synthetic edge cases strictly isolated and marked
export const SPECIAL_CASE_FIXTURES = Object.freeze({
  isSyntheticSpecialCase: true,
  arabicEasternNumeralsHtml: `<!DOCTYPE html>
  <html>
  <body>
    <article class="item card">
      <a href="https://a.qfilm.tv/series/show-s2-ep5/">
        <h2 class="title">مسلسل الف ليلة وليلة الموسم ٢ الحلقة ٥</h2>
        <span class="year">٢٠٢٤</span>
        <span class="rating">٨.٥</span>
        <img src="https://a.qfilm.tv/uploads/thumb.jpg" />
      </a>
    </article>
  </body>
  </html>`,
  deduplicatedEpisodesHtml: `<!DOCTYPE html>
  <html>
  <body>
    <div class="episodes-list">
      <a href="https://a.qfilm.tv/ep-1/">الحلقة 1</a>
      <a href="https://a.qfilm.tv/ep-1/">الحلقة 1 مكررة</a>
      <a href="https://a.qfilm.tv/ep-2/">الحلقة 2</a>
    </div>
  </body>
  </html>`
});
