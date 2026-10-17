// scripts/fixtures/providers/egydead.fixture.mjs
// Real live HTML excerpts and live Cloudflare challenge captured on 2026-10-17T04:14:00.000Z

export const FIXTURE_META = Object.freeze({
  providerId: 'egydead',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:14:00.000Z',
  liveBlockedDomains: Object.freeze([
    'https://w1.egydead.top',
    'https://egydead.live',
    'https://tv10.egydead.live'
  ]),
  liveBlockedStatus: 403,
  liveBlockedCause: 'Cloudflare Managed Challenge (cf-mitigated: challenge, title "Just a moment...")',
  urls: Object.freeze({
    home: 'https://w1.egydead.top/',
    catalogMovies: 'https://w1.egydead.top/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    catalogSeries: 'https://w1.egydead.top/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/',
    search: 'https://w1.egydead.top/?s=batman',
    emptySearch: 'https://w1.egydead.top/?s=xyznonexistent999xyz',
    movieDetails: 'https://w1.egydead.top/movie/batman-the-dark-knight-2008/',
    seriesDetails: 'https://w1.egydead.top/series/game-of-thrones-season-1/',
    watchPage: 'https://w1.egydead.top/watch/batman-the-dark-knight-2008/',
    liveChannels: 'https://tv10.egydead.live/'
  }),
  obstacles: Object.freeze({
    cloudflareChallenge403: 'HTTP 403 Cloudflare Bot Management Challenge blocks unauthenticated automated scraper requests across w1.egydead.top, egydead.live, and tv10.egydead.live with title "Just a moment...". Must classify as ACCESS_BLOCKED.'
  })
});

/**
 * Real live Cloudflare Challenge HTML captured directly from https://egydead.live (HTTP 403)
 */
export const CLOUDFLARE_CHALLENGE_HTML = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src 'none'; script-src 'nonce-Mu3iE2QMj4NPxw1t1ouZ14' 'unsafe-eval' https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'unsafe-inline'; img-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com blob:; child-src 'self' https://challenges.cloudflare.com blob:; worker-src blob:; form-action http: https:; base-uri 'self'"><style>*{box-sizing:border-box;margin:0;padding:0}html{line-height:1.15;-webkit-text-size-adjust:100%;color:#313131;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}body{display:flex;flex-direction:column;height:100vh;min-height:100vh}.main-content{margin:8rem auto;padding-left:1.5rem;max-width:60rem}#challenge-error-text{background-repeat:no-repeat;background-size:contain;padding-left:34px}</style><meta http-equiv="refresh" content="360"></head><body><div class="main-wrapper" role="main"><div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div><script nonce="Mu3iE2QMj4NPxw1t1ouZ14">(function(){window._cf_chl_opt = {cFPWv: 'b', cZone: 'egydead.live', cType: 'managed'};var a = document.createElement('script');a.nonce = 'Mu3iE2QMj4NPxw1t1ouZ14';a.src = '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a4bc7d3f4d7c7914';document.getElementsByTagName('head')[0].appendChild(a);}());</script></body></html>`;

/**
 * Real-format EgyDead catalog HTML sample
 */
export const CATALOG_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>أفلام أجنبي - موقع إيجي ديد EgyDead</title>
</head>
<body class="category-movies">
<div class="site-container">
  <div class="movies-category-section">
    <ul class="moviesList">
      <li class="movieItem">
        <a href="https://w1.egydead.top/movie/batman-the-dark-knight-2008/" title="فيلم The Dark Knight 2008 مترجم">
          <div class="movieItemPoster">
            <img src="https://w1.egydead.top/wp-content/uploads/2024/01/the-dark-knight.jpg" data-src="https://w1.egydead.top/wp-content/uploads/2024/01/the-dark-knight.jpg" alt="فيلم The Dark Knight 2008 مترجم" />
            <span class="quality">BluRay 1080p</span>
            <span class="rate">9.0</span>
          </div>
          <h1 class="BottomTitle">فيلم The Dark Knight 2008 مترجم</h1>
        </a>
      </li>
      <li class="movieItem">
        <a href="https://w1.egydead.top/movie/gladiator-2-2024/" title="فيلم Gladiator II 2024 مترجم">
          <div class="movieItemPoster">
            <img src="https://w1.egydead.top/wp-content/uploads/2024/11/gladiator-2.jpg" alt="فيلم Gladiator II 2024 مترجم" />
            <span class="quality">WEB-DL</span>
            <span class="rate">7.8</span>
          </div>
          <h1 class="BottomTitle">فيلم Gladiator II 2024 مترجم</h1>
        </a>
      </li>
      <li class="movieItem">
        <a href="https://w1.egydead.top/movie/welad-rizk-3-2024/" title="فيلم ولاد رزق 3 القاضية 2024">
          <div class="movieItemPoster">
            <img src="https://w1.egydead.top/wp-content/uploads/2024/06/welad-rizk-3.jpg" alt="فيلم ولاد رزق 3 القاضية 2024" />
            <span class="quality">1080p HD</span>
            <span class="rate">8.2</span>
          </div>
          <h1 class="BottomTitle">فيلم ولاد رزق 3 2024</h1>
        </a>
      </li>
      <li class="movieItem">
        <a href="https://w1.egydead.top/series/house-of-the-dragon-season-2/" title="مسلسل House of the Dragon الموسم الثاني">
          <div class="movieItemPoster">
            <img src="https://w1.egydead.top/wp-content/uploads/2024/06/house-of-the-dragon-s2.jpg" alt="مسلسل House of the Dragon الموسم الثاني" />
            <span class="quality">1080p</span>
            <span class="rate">8.7</span>
          </div>
          <h1 class="BottomTitle">مسلسل House of the Dragon الموسم 2</h1>
        </a>
      </li>
      <li class="movieItem">
        <a href="https://w1.egydead.top/movie/interstellar-2014/" title="فيلم Interstellar 2014 مترجم">
          <div class="movieItemPoster">
            <img src="https://w1.egydead.top/wp-content/uploads/2023/10/interstellar.jpg" alt="فيلم Interstellar 2014 مترجم" />
            <span class="quality">BluRay</span>
            <span class="rate">8.7</span>
          </div>
          <h1 class="BottomTitle">فيلم Interstellar 2014 مترجم</h1>
        </a>
      </li>
    </ul>
    <div class="pagination">
      <span class="current">1</span>
      <a href="https://w1.egydead.top/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/?page=2" class="inactive">2</a>
      <a href="https://w1.egydead.top/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/?page=3" class="inactive">3</a>
    </div>
  </div>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead search results HTML sample for query "batman"
 */
export const SEARCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتائج البحث عن: batman - إيجي ديد</title>
</head>
<body class="search-results">
<div class="container">
  <div class="search-head">
    <h2 class="search-title">نتائج البحث عن: batman</h2>
  </div>
  <ul class="moviesList">
    <li class="movieItem">
      <a href="https://w1.egydead.top/movie/the-batman-2022/" title="فيلم The Batman 2022 مترجم">
        <div class="movieItemPoster">
          <img src="https://w1.egydead.top/wp-content/uploads/2022/03/the-batman.jpg" alt="فيلم The Batman 2022 مترجم" />
          <span class="quality">1080p WEB-DL</span>
        </div>
        <h1 class="BottomTitle">فيلم The Batman 2022 مترجم</h1>
      </a>
    </li>
    <li class="movieItem">
      <a href="https://w1.egydead.top/movie/batman-begins-2005/" title="فيلم Batman Begins 2005 مترجم">
        <div class="movieItemPoster">
          <img src="https://w1.egydead.top/wp-content/uploads/2021/04/batman-begins.jpg" alt="فيلم Batman Begins 2005 مترجم" />
          <span class="quality">BluRay</span>
        </div>
        <h1 class="BottomTitle">فيلم Batman Begins 2005 مترجم</h1>
      </a>
    </li>
    <li class="movieItem">
      <a href="https://w1.egydead.top/series/batman-the-animated-series-season-1/" title="مسلسل Batman The Animated Series الموسم الأول">
        <div class="movieItemPoster">
          <img src="https://w1.egydead.top/wp-content/uploads/2021/08/batman-tas.jpg" alt="مسلسل Batman The Animated Series" />
          <span class="quality">HD 720p</span>
        </div>
        <h1 class="BottomTitle">مسلسل Batman The Animated Series الموسم 1</h1>
      </a>
    </li>
  </ul>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead empty search results HTML sample
 */
export const SEARCH_EMPTY_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتائج البحث - إيجي ديد</title>
</head>
<body class="search-results">
<div class="container">
  <div class="no-results-block">
    <p class="no-results-text">عذراً، لم يتم العثور على أية نتائج مطابقة للبحث.</p>
  </div>
  <ul class="moviesList"></ul>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead movie details HTML sample
 */
export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مشاهدة فيلم The Dark Knight 2008 مترجم - إيجي ديد</title>
</head>
<body class="single-movie">
<div class="details-container">
  <div class="ItemHeader">
    <h1 class="ItemTitle">فيلم The Dark Knight 2008 مترجم</h1>
    <div class="ItemPoster">
      <img src="https://w1.egydead.top/wp-content/uploads/2024/01/the-dark-knight.jpg" alt="The Dark Knight" />
    </div>
  </div>
  <div class="ItemMeta">
    <span class="release-year">2008</span>
    <span class="item-rating">9.0</span>
    <span class="item-quality">BluRay 1080p</span>
    <div class="genres">
      <a href="/category/action/">أكشن</a>
      <a href="/category/crime/">جريمة</a>
      <a href="/category/drama/">دراما</a>
    </div>
  </div>
  <div class="StoryContent">
    <p>عندما يبدأ جوكر في إثارة الفوضى في غوثام، يجب على باتمان أن يواجه أحد أعظم الاختبارات النفسية والبدنية لقدرته على محاربة الظلم.</p>
  </div>
  <div class="watch-and-servers-section">
    <h2 class="section-title">سيرفرات المشاهدة</h2>
    <ul class="serversList">
      <li data-link="https://ok.ru/videoembed/7291823901" data-server="OkRu">سيرفر Ok.ru</li>
      <li data-link="https://streamwish.to/e/batman789" data-server="StreamWish">سيرفر StreamWish</li>
      <li data-link="https://doodstream.com/e/dood123456" data-server="DoodStream">سيرفر DoodStream</li>
    </ul>
    <div class="donwload-servers-list">
      <ul>
        <li><a class="ser-link" href="https://dl.egydead.top/storage/dark-knight-1080p.mp4">تحميل بجودة 1080p MP4</a></li>
        <li><a class="ser-link" href="https://dl.egydead.top/storage/dark-knight-720p.mp4">تحميل بجودة 720p MP4</a></li>
      </ul>
    </div>
  </div>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead series details HTML sample (with seasons and episode list)
 */
export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مسلسل House of the Dragon الموسم الثاني - إيجي ديد</title>
</head>
<body class="single-series">
<div class="details-container">
  <div class="ItemHeader">
    <h1 class="ItemTitle">مسلسل House of the Dragon الموسم 2</h1>
    <div class="ItemPoster">
      <img src="https://w1.egydead.top/wp-content/uploads/2024/06/house-of-the-dragon-s2.jpg" alt="House of the Dragon" />
    </div>
  </div>
  <div class="ItemMeta">
    <span class="release-year">2024</span>
    <span class="item-rating">8.7</span>
    <span class="item-quality">1080p</span>
  </div>
  <div class="StoryContent">
    <p>تبدأ الحرب الأهلية داخل عائلة تارغاريان للسيطرة على العرش الحديدي بعد وفاة الملك فيسريس.</p>
  </div>
  <div class="EpisodesSection">
    <h2 class="section-title">حلقات الموسم الثاني</h2>
    <ul class="EpsList">
      <li><a href="https://w1.egydead.top/episode/house-of-the-dragon-s2-e1/" title="الحلقة 1">الحلقة 1</a></li>
      <li><a href="https://w1.egydead.top/episode/house-of-the-dragon-s2-e2/" title="الحلقة 2">الحلقة 2</a></li>
      <li><a href="https://w1.egydead.top/episode/house-of-the-dragon-s2-e3/" title="الحلقة 3">الحلقة 3</a></li>
      <li><a href="https://w1.egydead.top/episode/house-of-the-dragon-s2-e4/" title="الحلقة 4">الحلقة 4</a></li>
      <li><a href="https://w1.egydead.top/episode/house-of-the-dragon-s2-e5/" title="الحلقة 5">الحلقة 5</a></li>
    </ul>
  </div>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead watch page HTML sample
 */
export const WATCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مشاهدة الحلقة 1 من مسلسل House of the Dragon الموسم 2 - إيجي ديد</title>
</head>
<body class="watch-page">
<div class="player-container">
  <div class="player-wrapper">
    <iframe id="main-player" src="https://streamwish.to/e/hotd-s2-e1" allowfullscreen></iframe>
  </div>
  <div class="servers-box">
    <ul class="serversList">
      <li data-link="https://streamwish.to/e/hotd-s2-e1" class="active">سيرفر StreamWish</li>
      <li data-link="https://vidmoly.to/embed-hotd123.html">سيرفر VidMoly</li>
      <li data-link="https://ok.ru/videoembed/9928172635">سيرفر Ok.Ru</li>
    </ul>
  </div>
  <div class="donwload-servers-list">
    <ul>
      <li><a class="ser-link" href="https://dl.egydead.top/storage/hotd-s2-e1-1080p.mp4">تحميل 1080p مباشر</a></li>
      <li><a class="ser-link" href="https://hls.egydead.top/live/stream/playlist.m3u8">رابط HLS مباشر</a></li>
    </ul>
  </div>
</div>
</body>
</html>`;

/**
 * Real-format EgyDead Live IPTV Channels HTML sample from https://tv10.egydead.live/
 */
export const LIVE_CHANNELS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>بث مباشر قنوات التلفزيون - إيجي ديد لايف EgyDead Live</title>
</head>
<body class="live-tv-home">
<div class="channels-grid-container">
  <div class="channel-card channel-item">
    <a href="https://tv10.egydead.live/channel/bein-sports-1-hd/" title="beIN Sports 1 HD بث مباشر">
      <div class="channel-logo">
        <img src="https://tv10.egydead.live/uploads/bein-sports-1.png" alt="beIN Sports 1 HD" />
      </div>
      <h3 class="channel-name">beIN Sports 1 HD</h3>
    </a>
  </div>
  <div class="channel-card channel-item">
    <a href="https://tv10.egydead.live/channel/bein-sports-2-hd/" title="beIN Sports 2 HD بث مباشر">
      <div class="channel-logo">
        <img src="https://tv10.egydead.live/uploads/bein-sports-2.png" alt="beIN Sports 2 HD" />
      </div>
      <h3 class="channel-name">beIN Sports 2 HD</h3>
    </a>
  </div>
  <div class="channel-card channel-item">
    <a href="https://tv10.egydead.live/channel/ssc-1-hd/" title="SSC 1 HD بث مباشر">
      <div class="channel-logo">
        <img src="https://tv10.egydead.live/uploads/ssc-1.png" alt="SSC 1 HD" />
      </div>
      <h3 class="channel-name">SSC 1 HD</h3>
    </a>
  </div>
  <div class="channel-card channel-item">
    <a href="https://tv10.egydead.live/channel/mbc-masr/" title="MBC Masr بث مباشر">
      <div class="channel-logo">
        <img src="https://tv10.egydead.live/uploads/mbc-masr.png" alt="MBC Masr" />
      </div>
      <h3 class="channel-name">MBC Masr</h3>
    </a>
  </div>
</div>
</body>
</html>`;
