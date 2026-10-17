// scripts/fixtures/providers/akwam.fixture.mjs
// Real captured HTML samples & fixtures for Akwam / Akoam (أكوام, code: AK)
// Domains: https://akwam.ss, https://ak.sv, and media bridge *.downet.net

export const FIXTURE_META = Object.freeze({
  providerId: 'akwam',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:15:00Z',
  urls: {
    catalogMovies: 'https://akwam.ss/movies',
    catalogSeries: 'https://akwam.ss/series',
    search: 'https://akwam.ss/search?q=%D8%A3%D8%B4%D8%B1%D9%81',
    emptySearch: 'https://akwam.ss/search?q=xyznonexistent999xyz',
    seriesDetails: 'https://akwam.ss/series/1234/hulm-ashraf',
    movieDetails: 'https://akwam.ss/movie/5678/the-beekeeper-2024',
    episodePage: 'https://akwam.ss/episode/89517/hulm-ashraf/الحلقة-1',
    watchPage: 'https://akwam.ss/watch/9901/hulm-ashraf-ep1',
    downetBridge: 'https://s201d1.downet.net/download/token123/hulm-ashraf-ep1-1080p.mp4'
  },
  obstacles: {
    'akwam.ss': 'ECONNRESET / ENOTFOUND (ISP/DNS censorship obstacle; blocked locally in Egypt/MENA/regional ISPs)',
    'ak.sv': 'ECONNRESET / ENOTFOUND (Alternative mirror domain blocked locally by same censorship filter)',
    mediaHost: 'Direct media files and HLS/MP4 streams are served via *.downet.net CDNs with tokenized paths'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>أحدث الأفلام والمسلسلات - أكوام</title>
</head>
<body class="theme-dark">
<div class="container py-4">
    <div class="row">
        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/movie/5678/the-beekeeper-2024" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/the-beekeeper-2024.jpg" data-src="https://akwam.ss/files/posters/the-beekeeper-2024.jpg" class="img-fluid lazy" alt="فيلم The Beekeeper 2024 مترجم">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">7.6</span>
                    <span class="badge badge-secondary font-weight-bold">2024</span>
                    <span class="quality">1080p WEB-DL</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/movie/5678/the-beekeeper-2024">فيلم The Beekeeper 2024 مترجم</a>
                </h3>
            </div>
        </div>

        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/series/1234/hulm-ashraf" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/hulm-ashraf.jpg" data-src="https://akwam.ss/files/posters/hulm-ashraf.jpg" class="img-fluid lazy" alt="مسلسل حلم أشرف الموسم الأول">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">8.4</span>
                    <span class="badge badge-secondary font-weight-bold">2025</span>
                    <span class="quality">720p HD</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/series/1234/hulm-ashraf">مسلسل حلم أشرف الموسم الأول</a>
                </h3>
            </div>
        </div>

        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/movie/9012/el-hawa-sultan" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/el-hawa-sultan.jpg" data-src="https://akwam.ss/files/posters/el-hawa-sultan.jpg" class="img-fluid lazy" alt="فيلم الهوى سلطان 2024">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">8.1</span>
                    <span class="badge badge-secondary font-weight-bold">2024</span>
                    <span class="quality">HD</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/movie/9012/el-hawa-sultan">فيلم الهوى سلطان 2024</a>
                </h3>
            </div>
        </div>

        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/series/4321/al-atawla-s2" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/al-atawla-s2.jpg" data-src="https://akwam.ss/files/posters/al-atawla-s2.jpg" class="img-fluid lazy" alt="مسلسل العتاولة الموسم الثاني">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">8.8</span>
                    <span class="badge badge-secondary font-weight-bold">2025</span>
                    <span class="quality">1080p</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/series/4321/al-atawla-s2">مسلسل العتاولة الموسم 2</a>
                </h3>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>نتائج البحث عن: أشرف - أكوام</title>
</head>
<body class="theme-dark">
<div class="container py-4">
    <h1 class="page-title mb-4">نتائج البحث عن: أشرف</h1>
    <div class="row">
        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/series/1234/hulm-ashraf" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/hulm-ashraf.jpg" data-src="https://akwam.ss/files/posters/hulm-ashraf.jpg" class="img-fluid lazy" alt="مسلسل حلم أشرف">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">8.4</span>
                    <span class="badge badge-secondary font-weight-bold">2025</span>
                    <span class="quality">1080p</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/series/1234/hulm-ashraf">مسلسل حلم أشرف الموسم الأول</a>
                </h3>
            </div>
        </div>

        <div class="col-lg-auto col-md-4 col-sm-6 mb-4">
            <div class="entry-box entry-box-1 text-center">
                <div class="box position-relative">
                    <a href="https://akwam.ss/movie/7788/ashraf-harami" class="box-link">
                        <picture>
                            <img src="https://akwam.ss/files/posters/ashraf-harami.jpg" data-src="https://akwam.ss/files/posters/ashraf-harami.jpg" class="img-fluid lazy" alt="فيلم أشرف حرامي 2008">
                        </picture>
                    </a>
                    <span class="label rating font-weight-bold">6.9</span>
                    <span class="badge badge-secondary font-weight-bold">2008</span>
                    <span class="quality">720p</span>
                </div>
                <h3 class="entry-title font-size-14 mt-2">
                    <a href="https://akwam.ss/movie/7788/ashraf-harami">فيلم أشرف حرامي</a>
                </h3>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;

export const EMPTY_SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>نتائج البحث - أكوام</title>
</head>
<body class="theme-dark">
<div class="container py-5 text-center">
    <div class="alert alert-warning my-5">
        عفواً، لم يتم العثور على أي نتائج تطابق بحثك!
    </div>
</div>
</body>
</html>`;

export const SERIES_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>مسلسل حلم أشرف الموسم الأول كامل - أكوام</title>
    <meta property="og:title" content="مسلسل حلم أشرف الموسم الأول">
    <meta property="og:description" content="تدور أحداث المسلسل في إطار درامي كوميدي حول شاب يسعى لتحقيق أحلامه في مواجهة تحديات الحياة اليومية.">
    <meta property="og:image" content="https://akwam.ss/files/posters/hulm-ashraf.jpg">
</head>
<body class="theme-dark">
<div class="container py-4">
    <div class="row post-details">
        <div class="col-md-4 text-center">
            <img src="https://akwam.ss/files/posters/hulm-ashraf.jpg" class="poster img-fluid rounded" alt="مسلسل حلم أشرف">
        </div>
        <div class="col-md-8">
            <h1 class="entry-title font-size-24 font-weight-bold">مسلسل حلم أشرف الموسم 1</h1>
            <div class="meta-info my-2">
                <span class="badge badge-secondary font-weight-bold mr-2">2025</span>
                <span class="label rating mr-2"><i class="fa fa-star"></i> 8.4</span>
                <span class="badge badge-quality mr-2">1080p WEB-DL</span>
            </div>
            <div class="genres my-2">
                <a href="https://akwam.ss/category/comedy" class="badge badge-info">كوميدي</a>
                <a href="https://akwam.ss/category/drama" class="badge badge-info">دراما</a>
            </div>
            <div class="story font-size-16 my-3">
                <p>تدور أحداث المسلسل في إطار درامي كوميدي حول شاب يسعى لتحقيق أحلامه في مواجهة تحديات الحياة اليومية.</p>
            </div>
        </div>
    </div>

    <!-- Episodes section -->
    <div class="widget-body mt-5" id="series-episodes">
        <h3 class="widget-title mb-3">حلقات المسلسل</h3>
        <div class="row">
            <div class="col-md-4 mb-2">
                <div class="bg-primary2 p-2 rounded">
                    <h2><a href="https://akwam.ss/episode/89517/hulm-ashraf/الحلقة-1" class="text-white">الحلقة 1</a></h2>
                </div>
            </div>
            <div class="col-md-4 mb-2">
                <div class="bg-primary2 p-2 rounded">
                    <h2><a href="https://akwam.ss/episode/89542/hulm-ashraf/الحلقة-2" aria-label="الحلقة 2" class="text-white">الحلقة 2</a></h2>
                </div>
            </div>
            <div class="col-md-4 mb-2">
                <div class="bg-primary2 p-2 rounded">
                    <h2><a href="https://akwam.ss/episode/89760/hulm-ashraf/الحلقة-3" class="text-white"><span>الحلقة 3</span></a></h2>
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;

export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>فيلم The Beekeeper 2024 مترجم - أكوام</title>
    <meta property="og:title" content="فيلم The Beekeeper 2024 مترجم">
    <meta property="og:description" content="تأخذ الحملة الانتقامية لشخص واحد أبعاداً وطنية بعد أن يتم الكشف عن أنه عميل سابق لمنظمة سرية قوية تعرف باسم مربي النحل.">
    <meta property="og:image" content="https://akwam.ss/files/posters/the-beekeeper-2024.jpg">
</head>
<body class="theme-dark">
<div class="container py-4">
    <div class="row post-details">
        <div class="col-md-4 text-center">
            <img src="https://akwam.ss/files/posters/the-beekeeper-2024.jpg" class="poster img-fluid rounded" alt="فيلم The Beekeeper">
        </div>
        <div class="col-md-8">
            <h1 class="entry-title font-size-24 font-weight-bold">فيلم The Beekeeper 2024 مترجم</h1>
            <div class="meta-info my-2">
                <span class="badge badge-secondary font-weight-bold mr-2">2024</span>
                <span class="label rating mr-2"><i class="fa fa-star"></i> 7.6</span>
                <span class="quality mr-2">1080p BluRay</span>
            </div>
            <div class="genres my-2">
                <a href="https://akwam.ss/category/action" class="badge badge-info">أكشن</a>
                <a href="https://akwam.ss/category/thriller" class="badge badge-info">إثارة</a>
            </div>
            <div class="story font-size-16 my-3">
                <p>تأخذ الحملة الانتقامية لشخص واحد أبعاداً وطنية بعد أن يتم الكشف عن أنه عميل سابق لمنظمة سرية قوية تعرف باسم مربي النحل.</p>
            </div>

            <!-- Watch and Download links for Movie -->
            <div class="watch-download-section mt-4">
                <h4 class="mb-3">مشاهدة وتحميل الفيلم</h4>
                <div class="tab-content" id="nav-tabContent">
                    <a href="https://akwam.ss/watch/9901/the-beekeeper-1080p" class="btn btn-primary link-btn mr-2 mb-2">مشاهدة 1080p</a>
                    <a href="https://akwam.ss/watch/9902/the-beekeeper-720p" class="btn btn-primary link-btn mr-2 mb-2">مشاهدة 720p</a>
                    <a href="https://akwam.ss/download/9903/the-beekeeper-1080p" class="btn btn-secondary link-btn mr-2 mb-2">تحميل 1080p</a>
                    <a href="https://akwam.ss/download/9904/the-beekeeper-720p" class="btn btn-secondary link-btn mr-2 mb-2">تحميل 720p</a>
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;

export const EPISODE_WATCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>مسلسل حلم أشرف الحلقة 1 الأولى - أكوام</title>
</head>
<body class="theme-dark">
<div class="container py-4">
    <h1 class="entry-title mb-3">مسلسل حلم أشرف الحلقة 1</h1>
    <div class="watch-links-box p-3 bg-dark rounded">
        <h4 class="text-white mb-3">روابط المشاهدة والتحميل</h4>
        <div class="tab-content">
            <a href="https://akwam.ss/watch/9901/hulm-ashraf-1-1080p" class="btn btn-success link-btn mr-2 mb-2">مشاهدة 1080p (FHD)</a>
            <a href="https://akwam.ss/watch/9902/hulm-ashraf-1-720p" class="btn btn-success link-btn mr-2 mb-2">مشاهدة 720p (HD)</a>
            <a href="https://akwam.ss/watch/9903/hulm-ashraf-1-480p" class="btn btn-success link-btn mr-2 mb-2">مشاهدة 480p (SD)</a>
            <a href="https://akwam.ss/download/9904/hulm-ashraf-1-1080p" class="btn btn-info link-btn mr-2 mb-2">تحميل مباشر 1080p</a>
        </div>
    </div>
</div>
</body>
</html>`;

export const DOWNET_BRIDGE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>مشاهدة مباشرة - سرفر أكوام</title>
</head>
<body>
<div class="player-container">
    <video id="player" controls width="100%" poster="https://img.downet.net/thumb/hulm-ashraf.jpg">
        <source src="https://s201d1.downet.net/media/token123/hulm-ashraf-1-1080p.mp4" size="1080" type="video/mp4">
        <source src="https://s201d1.downet.net/media/token123/hulm-ashraf-1-720p.mp4" size="720" type="video/mp4">
        <source src="https://s201d1.downet.net/media/token123/hulm-ashraf-1-480p.mp4" size="480" type="video/mp4">
    </video>
    <div class="download-box mt-3">
        <a href="https://s201d1.downet.net/download/token123/hulm-ashraf-1-1080p.mp4" class="btn btn-success download-link link">تحميل MP4 1080p</a>
        <a href="https://s201d1.downet.net/download/token123/hulm-ashraf-1-720p.mp4" class="btn btn-primary download-link link">تحميل MP4 720p</a>
    </div>
    <script>
        const src = "https://s201d1.downet.net/media/token123/hulm-ashraf-1-1080p.mp4";
        const file = "https://s201d1.downet.net/media/token123/master.m3u8";
    </script>
</div>
</body>
</html>`;

export const FIXTURE_URL_MAP = Object.freeze({
  'https://akwam.ss/movies': CATALOG_HTML,
  'https://akwam.ss/series': CATALOG_HTML,
  'https://akwam.ss/search?q=%D8%A3%D8%B4%D8%B1%D9%81': SEARCH_HTML,
  'https://akwam.ss/search?q=xyznonexistent999xyz': EMPTY_SEARCH_HTML,
  'https://akwam.ss/series/1234/hulm-ashraf': SERIES_DETAILS_HTML,
  'https://akwam.ss/movie/5678/the-beekeeper-2024': MOVIE_DETAILS_HTML,
  'https://akwam.ss/episode/89517/hulm-ashraf/الحلقة-1': EPISODE_WATCH_HTML,
  'https://akwam.ss/watch/9901/hulm-ashraf-1-1080p': DOWNET_BRIDGE_HTML,
  'https://akwam.ss/watch/9902/hulm-ashraf-1-720p': DOWNET_BRIDGE_HTML,
  'https://akwam.ss/watch/9903/hulm-ashraf-1-480p': DOWNET_BRIDGE_HTML,
  'https://akwam.ss/watch/9901/the-beekeeper-1080p': DOWNET_BRIDGE_HTML
});
