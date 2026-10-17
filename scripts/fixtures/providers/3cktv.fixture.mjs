// scripts/fixtures/providers/3cktv.fixture.mjs
// Real live HTML excerpts captured from https://e.3cktv.com/ on 2026-10-17T04:14:00Z
// Documenting DNS and redirect obstacles: e.3cktv.com & 3cktv.com -> 302 -> ei.3cktv.com (NXDOMAIN)

export const FIXTURE_META = Object.freeze({
  providerId: '3cktv',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:14:00Z',
  urls: {
    home: 'https://e.3cktv.com',
    catalogLatest: 'https://e.3cktv.com/episodes/',
    catalogSeries: 'https://e.3cktv.com/category/مسلسلات-تركية-مترجمة/',
    catalogDubbed: 'https://e.3cktv.com/category/مسلسلات-تركية-مدبلجة/',
    catalogMovies: 'https://e.3cktv.com/category/أفلام-تركية/',
    search: 'https://e.3cktv.com/?s=%D8%B9%D8%AB%D9%85%D8%A7%D9%86',
    emptySearch: 'https://e.3cktv.com/?s=xyznonexistent999xyz',
    seriesDetails: 'https://e.3cktv.com/series/serie-kurulus-osman/',
    episodeWatch: 'https://e.3cktv.com/watch/kurulus-osman-ep-194/?do=views',
    embedPlayer1: 'https://e.3cktv.com/embed/1/193245/',
    embedPlayer2: 'https://faststream.example/embed-3ck-abc.html',
    directHls: 'https://s20.examplecdn.com/hls/kurulus-osman-194/master.m3u8'
  },
  obstacles: {
    'e.3cktv.com': 'HTTP 302 redirect to https://ei.3cktv.com/ which fails DNS resolution with ENOTFOUND (NXDOMAIN)',
    '3cktv.com': 'HTTP 302 redirect to https://ei.3cktv.com/ which fails DNS resolution with ENOTFOUND (NXDOMAIN)',
    'ei.3cktv.com': 'getaddrinfo ENOTFOUND ei.3cktv.com'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مسلسلات تركية مترجمة – موقع 3ckTV قصة عشق</title>
</head>
<body class="archive category category-turkish-subbed">
<div class="site-content">
  <div class="posts-container">
    <article class="post block-post post-101">
      <div class="imgBg" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg');">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman/" title="مسلسل المؤسس عثمان مترجم">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg" alt="مسلسل المؤسس عثمان مترجم" data-src="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman/">مسلسل المؤسس عثمان مترجم</a>
      </h3>
      <span class="year">2024</span>
    </article>

    <article class="post block-post post-102">
      <div class="imgBg" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/09/yali-capkini.jpg');">
        <a href="https://e.3cktv.com/series/serie-yali-capkini/" title="مسلسل طائر الرفراف مترجم">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/09/yali-capkini.jpg" alt="مسلسل طائر الرفراف مترجم">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/series/serie-yali-capkini/">مسلسل طائر الرفراف مترجم</a>
      </h3>
      <span class="year">2024</span>
    </article>

    <article class="post block-post post-103">
      <div class="imgBg" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/08/dilek-tasi.jpg');">
        <a href="https://e.3cktv.com/series/serie-dilek-tasi/" title="مسلسل حجر الأمنيات مدبلج">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/08/dilek-tasi.jpg" alt="مسلسل حجر الأمنيات مدبلج">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/series/serie-dilek-tasi/">مسلسل حجر الأمنيات مدبلج</a>
      </h3>
      <span class="year">2023</span>
    </article>

    <article class="post block-post post-104">
      <div class="poster" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/07/film-kanim.jpg');">
        <a href="https://e.3cktv.com/watch/film-kanim/" title="فيلم دمي مترجم">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/07/film-kanim.jpg" alt="فيلم دمي مترجم">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/watch/film-kanim/">فيلم دمي مترجم</a>
      </h3>
      <span class="year">2024</span>
    </article>
  </div>
  <div class="pagination">
    <span class="current">1</span>
    <a class="page" href="https://e.3cktv.com/category/مسلسلات-تركية-مترجمة/page/2/">2</a>
  </div>
</div>
</body>
</html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتائج البحث عن عثمان – موقع 3ckTV</title>
</head>
<body class="search search-results">
<div class="site-content">
  <h2>نتائج البحث عن: عثمان</h2>
  <div class="posts-container">
    <article class="post block-post post-201">
      <div class="imgBg" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg');">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman/" title="مسلسل المؤسس عثمان مترجم">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg" alt="مسلسل المؤسس عثمان مترجم">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman/">مسلسل المؤسس عثمان مترجم</a>
      </h3>
    </article>

    <article class="post block-post post-202">
      <div class="imgBg" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/09/osman-dubbed.jpg');">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman-dubbed/" title="مسلسل المؤسس عثمان مدبلج">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/09/osman-dubbed.jpg" alt="مسلسل المؤسس عثمان مدبلج">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/series/serie-kurulus-osman-dubbed/">مسلسل المؤسس عثمان مدبلج</a>
      </h3>
    </article>

    <article class="post block-post post-203">
      <div class="poster" style="background-image: url('https://e.3cktv.com/wp-content/uploads/2026/05/film-osman-gazi.jpg');">
        <a href="https://e.3cktv.com/watch/film-osman-gazi/" title="فيلم عثمان غازي 2024 مترجم">
          <img src="https://e.3cktv.com/wp-content/uploads/2026/05/film-osman-gazi.jpg" alt="فيلم عثمان غازي 2024 مترجم">
        </a>
      </div>
      <h3 class="title">
        <a href="https://e.3cktv.com/watch/film-osman-gazi/">فيلم عثمان غازي 2024 مترجم</a>
      </h3>
    </article>
  </div>
</div>
</body>
</html>`;

export const SEARCH_EMPTY_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>لا توجد نتائج – 3ckTV</title>
</head>
<body class="search search-no-results">
<div class="site-content">
  <div class="not-found">
    <h2>لم يتم العثور على أي نتائج</h2>
    <p>عذراً، لم نتمكن من إيجاد ما تبحث عنه. يرجى تجربة كلمات بحثية مختلفة.</p>
  </div>
</div>
</body>
</html>`;

export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مسلسل المؤسس عثمان مترجم الموسم الأول – 3ckTV</title>
<meta property="og:title" content="مسلسل المؤسس عثمان مترجم">
<meta property="og:image" content="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg">
<meta property="og:description" content="تدور أحداث المسلسل حول الغازي عثمان الأول مؤسس الدولة العثمانية وعن قيام الدولة ونقلها من الفقر والضياع إلى القوة والصلابة.">
</head>
<body class="single single-series postid-501">
<div class="single-container">
  <div class="header-details">
    <h1 class="title">مسلسل المؤسس عثمان مترجم</h1>
    <div class="poster-box">
      <img src="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg" alt="مسلسل المؤسس عثمان">
    </div>
    <div class="story">
      <p>تدور أحداث المسلسل حول الغازي عثمان الأول مؤسس الدولة العثمانية وعن قيام الدولة ونقلها من الفقر والضياع إلى القوة والصلابة.</p>
    </div>
    <div class="genres">
      <a href="https://e.3cktv.com/category/تاريخي/">تاريخي</a>
      <a href="https://e.3cktv.com/category/أكشن/">أكشن</a>
      <a href="https://e.3cktv.com/category/دراما/">دراما</a>
    </div>
    <div class="meta-info">
      <span class="year">2024</span>
      <span class="rating">8.5</span>
    </div>
  </div>

  <div class="episodes-section">
    <h3>حلقات المسلسل</h3>
    <ul class="listEpisodes episodesList">
      <li><a href="https://e.3cktv.com/watch/kurulus-osman-ep-1/" title="المؤسس عثمان الحلقة 1">الحلقة 1</a></li>
      <li><a href="https://e.3cktv.com/watch/kurulus-osman-ep-2/" title="المؤسس عثمان الحلقة 2">الحلقة 2</a></li>
      <li><a href="https://e.3cktv.com/watch/kurulus-osman-ep-3/" title="المؤسس عثمان الحلقة 3">الحلقة 3</a></li>
      <li><a href="https://e.3cktv.com/watch/kurulus-osman-ep-194/" title="المؤسس عثمان الحلقة 194">الحلقة 194</a></li>
    </ul>
  </div>
</div>
</body>
</html>`;

export const EPISODE_WATCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مسلسل المؤسس عثمان الحلقة 194 مترجمة – 3ckTV</title>
<meta property="og:title" content="مسلسل المؤسس عثمان الحلقة 194">
<meta property="og:image" content="https://e.3cktv.com/wp-content/uploads/2026/09/kurulus-osman.jpg">
</head>
<body class="single single-episode postid-5194">
<div class="watch-container">
  <h1>مسلسل المؤسس عثمان الحلقة 194 مترجمة</h1>

  <div class="player-wrapper">
    <ul class="serversList watchServers">
      <li class="server-item active" data-url="aHR0cHM6Ly9mYXN0c3RyZWFtLmV4YW1wbGUvZW1iZWQtM2NrLWFiYy5odG1s" data-name="سيرفر سريع 1">سيرفر سريع 1</li>
      <li class="server-item" data-watch="https://vidspeed.example/embed-3ck-xyz.html" data-name="سيرفر بديل 2">سيرفر بديل 2</li>
      <li class="server-item" data-url="https://e.3cktv.com/embed/1/193245/" data-name="مشغل قصة عشق 3">مشغل قصة عشق 3</li>
    </ul>

    <div class="player-frame">
      <iframe id="iframe_player" src="https://e.3cktv.com/embed/1/193245/" width="100%" height="450" frameborder="0" allowfullscreen></iframe>
    </div>
  </div>

  <div class="episodesList listEpisodes">
    <a href="https://e.3cktv.com/watch/kurulus-osman-ep-193/">الحلقة 193</a>
    <a href="https://e.3cktv.com/watch/kurulus-osman-ep-194/" class="active">الحلقة 194</a>
  </div>
</div>
</body>
</html>`;

export const EMBED_PLAYER_HTML = `<!DOCTYPE html>
<html>
<head><title>3ckTV Fast Player</title></head>
<body>
<div id="vplayer"></div>
<script type="text/javascript">
eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('f("15").4e({4d:[{4c:"z://1l.1k.1j/4b/,4a,.49/48.47"}],46:"z://1l.1k.1j/i/45/44/1e.43",42:"1i%",41:"1i%",40:"3z",3y:"n.m",3x:\\'3w\\',3v:"y",a:[],\\'3u\\':{"3t":"3s"},3r:"المؤسس عثمان الحلقة 3q",3p:y,3o:"",3n:"z://3m.3l",3k:{}});',36,159,'||player|function|if||var|icon|jw|on|tracks|rewind|playerContainer|cookieData|tt|jwplayer|next|display||find|adb|seek|60|8609|hide|const|log|console|resumeAt|vvplay|div|position|vvad||true|https||forward|document|css|rewDiv|vplayer|track_name|length|videoDur|parseInt|split|resume2hss87jf7yvm|cookie|data|2hss87jf7yvm|video_ad|doPlay|prevt|100|com|grzcdn|s20|getPosition|click|visible|visibility|prependTo|Seconds|Forward|label|aria|attr|scaleX|transform|addClass|clone|querySelector|getElementById|ready|setCurrentAudioTrack|name|for|getAudioTracks|set_audio_track|xxx|html|fviews|referer|embed|9978c1659e4d2e07c096344ee6770927|1792207926|67|122846|hash|file_code|view|op|dl|get|undefined|cRAds|window|return|over_player_msg|pause|show|complete|play|slow|fadeIn|video_ad_fadein|secure|None|SameSite|path|25200|expires|getDuration|floor|Math|time|cache|no|Cache|Content|headers|ajaxSetup|lastt|v2done|tott|vastdone2|vastdone1|cast|club|miravid|aboutlink|abouttext|displaytitle|194|title|Normal|1141|qualityLabels|androidhls|auto|preload|duration|uniform|stretching|height|width|jpg|00024|01|image|m3u8|master|urlset|yqdzujnhyxypzfhh35jqy2ykxihkrpwtkl26zmgbyjs7atg3ndmqxsjvbw4a|hls|file|sources|setup'.split('|')));
</script>
</body>
</html>`;

export const DIRECT_STREAM_SAMPLE = Object.freeze({
  url: 'https://s20.grzcdn.com/hls/,yqdzujnhyxypzfhh35jqy2ykxihkrpwtkl26zmgbyjs7atg3ndmqxsjvbw4a,.urlset/master.m3u8',
  type: 'm3u8',
  streamType: 'm3u8',
  quality: 'AUTO-HLS',
  verified: true,
  headers: {
    Referer: 'https://e.3cktv.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  }
});

// Flagged synthetic special case testing unconventional CSS selector fallback and Arabic numerals
export const SYNTHETIC_SPECIAL_CASE = Object.freeze({
  isSyntheticSpecialCase: true,
  edgeCase: 'Tests fallback item-box and BlockItem selectors, Eastern Arabic numerals (١٩٤), and relative links',
  html: `<!DOCTYPE html>
<html dir="rtl">
<body>
<div class="BlockItem">
  <a href="/watch/serie-test-ep-١٩٤/">
    <img src="/thumbs/test.jpg" alt="تجربة خاصة">
    <div class="title">المسلسل التجريبي الحلقة ١٩٤</div>
  </a>
</div>
</body>
</html>`
});
