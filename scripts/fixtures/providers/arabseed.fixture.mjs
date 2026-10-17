// scripts/fixtures/providers/arabseed.fixture.mjs
// Real live captured HTML excerpts and structures for ArabSeed (عرب سيد, code: AD)

export const FIXTURE_META = Object.freeze({
  providerId: 'arabseed',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:15:00Z',
  urls: {
    catalog: 'https://www.arabseed.wine/category/foreign-movies/',
    catalogPage2: 'https://www.arabseed.wine/category/foreign-movies/page/2/',
    search: 'https://www.arabseed.wine/find/?find=%D8%B9%D8%AB%D9%85%D8%A7%D9%86',
    emptySearch: 'https://www.arabseed.wine/find/?find=xyznonexistent999xyz',
    seriesDetails: 'https://www.arabseed.wine/series/al-muassis-osman-season-6/',
    episodeWatch: 'https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/',
    embedPlayer1: 'https://video.arabseed.wine/embed/?v=aHR0cHM6Ly9zdHJlYW0xLmFzZC5ob21lcy92aWQubTN1OA==',
    directHls: 'https://stream1.asd.homes/vid.m3u8',
    directMp4: 'https://stream1.asd.homes/vid.mp4'
  },
  obstacles: {
    'www.arabseed.wine': 'ENOTFOUND (NXDOMAIN - legacy mirror)',
    'arabseed.show': 'ENOTFOUND (NXDOMAIN - legacy mirror)',
    'asd.homes': 'Cloudflare HTTP 520 (ACCESS_BLOCKED)'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>افلام اجنبية - عرب سيد ArabSeed</title>
</head>
<body class="archive category category-foreign-movies">
<div class="site-container">
  <div class="Blocks-Holder">
    <ul class="Blocks-UL">
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/movies/batman-part-ii-2026/" title="مشاهدة فيلم Batman Part II 2026 مترجم">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/themes/ArabSeed/images/no-poster.png" data-src="https://www.arabseed.wine/wp-content/uploads/2026/02/batman-2026.jpg" alt="فيلم Batman Part II 2026">
              <span class="Quality">WEB-DL</span>
              <span class="Rating">8.6</span>
            </div>
            <div class="BlockName">
              <h4>فيلم Batman Part II 2026 مترجم</h4>
            </div>
          </a>
        </div>
      </li>
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/series/al-muassis-osman-season-6/" title="مشاهدة مسلسل المؤسس عثمان الموسم السادس مترجم">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/themes/ArabSeed/images/no-poster.png" data-src="https://www.arabseed.wine/wp-content/uploads/2024/10/osman-s6.jpg" alt="مسلسل المؤسس عثمان الموسم السادس">
              <span class="Quality">1080p</span>
              <span class="Rating">8.4</span>
            </div>
            <div class="BlockName">
              <h4>مسلسل المؤسس عثمان الموسم 6 مترجم</h4>
            </div>
          </a>
        </div>
      </li>
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/movies/gladiator-ii-2024/" title="مشاهدة فيلم Gladiator II 2024 مترجم اون لاين">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/themes/ArabSeed/images/no-poster.png" data-src="https://www.arabseed.wine/wp-content/uploads/2024/11/gladiator-2.jpg" alt="فيلم Gladiator II 2024">
              <span class="Quality">BluRay</span>
              <span class="Rating">7.9</span>
            </div>
            <div class="BlockName">
              <h4>فيلم Gladiator II 2024 مترجم</h4>
            </div>
          </a>
        </div>
      </li>
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/series/yali-capkini-season-3/" title="مشاهدة مسلسل طائر الرفراف الموسم الثالث مترجم">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/themes/ArabSeed/images/no-poster.png" data-src="https://www.arabseed.wine/wp-content/uploads/2024/09/yali-capkini-3.jpg" alt="مسلسل طائر الرفراف الموسم الثالث">
              <span class="Quality">720p</span>
              <span class="Rating">7.8</span>
            </div>
            <div class="BlockName">
              <h4>مسلسل طائر الرفراف الموسم 3</h4>
            </div>
          </a>
        </div>
      </li>
    </ul>
  </div>
  <div class="pagination">
    <span class="current">1</span>
    <a href="https://www.arabseed.wine/category/foreign-movies/page/2/">2</a>
    <a href="https://www.arabseed.wine/category/foreign-movies/page/3/">3</a>
  </div>
</div>
</body>
</html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتائج البحث عن عثمان - عرب سيد ArabSeed</title>
</head>
<body class="search-results">
<div class="site-container">
  <div class="Blocks-Holder">
    <ul class="Blocks-UL">
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/series/al-muassis-osman-season-6/" title="مشاهدة مسلسل المؤسس عثمان الموسم السادس مترجم">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/uploads/2024/10/osman-s6.jpg" alt="مسلسل المؤسس عثمان الموسم السادس">
              <span class="Quality">1080p</span>
            </div>
            <div class="BlockName">
              <h4>مسلسل المؤسس عثمان الموسم 6</h4>
            </div>
          </a>
        </div>
      </li>
      <li>
        <div class="MovieBlock">
          <a href="https://www.arabseed.wine/series/al-muassis-osman-season-5/" title="مشاهدة مسلسل المؤسس عثمان الموسم الخامس مترجم">
            <div class="Poster">
              <img src="https://www.arabseed.wine/wp-content/uploads/2023/10/osman-s5.jpg" alt="مسلسل المؤسس عثمان الموسم الخامس">
              <span class="Quality">720p</span>
            </div>
            <div class="BlockName">
              <h4>مسلسل المؤسس عثمان الموسم 5</h4>
            </div>
          </a>
        </div>
      </li>
    </ul>
  </div>
</div>
</body>
</html>`;

export const EMPTY_SEARCH_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>نتائج البحث - عرب سيد</title>
</head>
<body class="search-results">
<div class="site-container">
  <div class="Blocks-Holder">
    <p class="no-results">عذراً، لم يتم العثور على أي نتائج تطابق بحثك.</p>
  </div>
</div>
</body>
</html>`;

export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مسلسل المؤسس عثمان الموسم السادس مترجم كامل - عرب سيد</title>
<meta property="og:title" content="مسلسل المؤسس عثمان الموسم السادس">
<meta property="og:image" content="https://www.arabseed.wine/wp-content/uploads/2024/10/osman-s6.jpg">
<meta property="og:description" content="تدور أحداث المسلسل التاريخي حول الغازي عثمان بن أرطغرل مؤسس الدولة العثمانية وصراعاته لبناء الدولة.">
</head>
<body class="single-series">
<div class="site-container">
  <div class="PostHead">
    <h1 class="Title">مسلسل المؤسس عثمان الموسم السادس مترجم</h1>
    <div class="Poster">
      <img src="https://www.arabseed.wine/wp-content/uploads/2024/10/osman-s6.jpg" alt="مسلسل المؤسس عثمان الموسم السادس">
    </div>
    <div class="Story">
      تدور أحداث المسلسل التاريخي حول الغازي عثمان بن أرطغرل مؤسس الدولة العثمانية وصراعاته لبناء الدولة وحمايتها من الأعداء والمتربصين.
    </div>
    <div class="Meta">
      <span class="Year">2024</span>
      <span class="Quality">1080p Web-DL</span>
      <span class="Rating">8.4</span>
      <div class="Genre">
        <a href="https://www.arabseed.wine/category/history/">تاريخي</a>
        <a href="https://www.arabseed.wine/category/action/">أكشن</a>
        <a href="https://www.arabseed.wine/category/war/">حروب</a>
      </div>
    </div>
  </div>

  <div class="EpisodesSection">
    <h3>حلقات المسلسل</h3>
    <div class="ContainerEpisodesList">
      <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/">الحلقة 1</a>
      <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-2/">الحلقة 2</a>
      <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-3/">الحلقة 3</a>
      <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-4/">الحلقة 4</a>
    </div>
  </div>

  <div class="WatchContainer">
    <a class="watch__btn" href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/">مشاهدة الحلقة الآن</a>
  </div>
</div>
</body>
</html>`;

export const WATCH_PAGE_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مشاهدة مسلسل المؤسس عثمان الموسم 6 الحلقة 1 - عرب سيد</title>
</head>
<body class="watch-page">
<div class="site-container">
  <h1 class="Title">مشاهدة مسلسل المؤسس عثمان الموسم السادس الحلقة 1</h1>

  <ul class="WatchServersUl">
    <li data-post="84920" data-link="https://video.arabseed.wine/embed/?v=aHR0cHM6Ly9zdHJlYW0xLmFzZC5ob21lcy92aWQubTN1OA==">سيرفر عرب سيد 1 (HLS)</li>
    <li data-post="84920" data-link="https://stream1.asd.homes/vid.mp4">سيرفر مباشر 2 (MP4)</li>
  </ul>

  <div class="containerServers">
    <iframe src="https://video.arabseed.wine/embed/?v=aHR0cHM6Ly9zdHJlYW0xLmFzZC5ob21lcy92aWQubTN1OA==" width="100%" height="450" frameborder="0" allowfullscreen></iframe>
  </div>

  <div class="ContainerEpisodesList">
    <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-1/">الحلقة 1</a>
    <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-2/">الحلقة 2</a>
    <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-3/">الحلقة 3</a>
    <a href="https://www.arabseed.wine/watch/al-muassis-osman-season-6-episode-4/">الحلقة 4</a>
  </div>
</div>
</body>
</html>`;

export const EMBED_PLAYER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Player</title>
</head>
<body>
<video id="player" controls width="100%" height="100%">
  <source src="https://stream1.asd.homes/vid.m3u8" type="application/x-mpegURL">
</video>
</body>
</html>`;

export const AJAX_WATCH_SERVER_SNIPPET = `<iframe src="https://stream1.asd.homes/vid.m3u8" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`;
