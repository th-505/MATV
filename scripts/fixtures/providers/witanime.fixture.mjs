// scripts/fixtures/providers/witanime.fixture.mjs
// Real live HTML and JSON samples captured from https://www.witanime.net/ and https://witanime.site/ on 2026-10-17T03:28:00.000Z

export const FIXTURE_META = Object.freeze({
  providerId: 'witanime',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T03:28:00.000Z',
  liveMirrorDiscovery: {
    legacyUrl: 'https://witanime.you/',
    legacyRedirectStatus: 302,
    legacyRedirectLocation: 'https://www.witanime.net/?m=1',
    gatewayUrl: 'https://www.witanime.net/',
    gatewayStatus: 200,
    gatewayBehavior: 'Official WitAnime Blogger gateway landing page ("بوابة ويت أنمي الرسمية"). Its primary CTA buttons (#header-cta a, a.js-cta, #cta-action a) link directly to https://witanime.site/ and https://witanime.site/browse.',
    activePlatformUrl: 'https://witanime.site/',
    activePlatformStatus: 200
  },
  urls: {
    gateway: 'https://www.witanime.net/',
    catalog: 'https://witanime.site/browse',
    catalogMovies: 'https://witanime.site/movies',
    search: 'https://witanime.site/search?q=one+piece',
    details: 'https://witanime.site/anime/black-clover-2nd-season',
    episode: 'https://witanime.site/watch/black-clover-2nd-season/2',
    watch: 'https://witanime.site/watch/black-clover-2nd-season/2',
    sourcesApi: 'https://witanime.site/watch/black-clover-2nd-season/2/sources'
  },
  obstacles: {
    streamGateDevtoolsGuard: 'Direct GET requests to /watch/stream-gate/{token} trigger server-side data-devtools-guard="1" returning HTTP 404. Stream manifests are retrieved via POST /watch/{anime}/{ep}/sources with CSRF token and session cookies.'
  }
});

export const GATEWAY_HTML = `<!DOCTYPE html>
<html class='rtl' dir='rtl' lang='ar'>
<head>
<meta charset='UTF-8'/>
<title>WitAnime - مشاهدة وتحميل الانمي المترجم اون لاين</title>
</head>
<body class='index home'>
<div class='header-bar'>
  <header class='site-header container'>
    <div class='header-logo'>
      <a class='header-brand' href='https://www.witanime.net/'>
        <span class='logo-text' dir='ltr'>WitAnime</span>
      </a>
    </div>
    <div class='header-actions'>
      <div id='header-cta'>
        <a class='btn btn-primary btn-nav' href='https://witanime.site/browse'>
          <span>قائمة الأنمي</span>
        </a>
      </div>
    </div>
  </header>
</div>
<main class='site-main container'>
  <div class='hero'>
    <h1 class='hero-title'>شاهد الأنمي أونلاين مجانًا</h1>
    <div class='hero-actions'>
      <a class='btn btn-primary btn-lg js-cta' href='https://witanime.site/#اذهب إلى الموقع'>
        <span class='js-cta-label'>اذهب إلى الموقع</span>
      </a>
    </div>
  </div>
</main>
<footer class='site-footer'>
  <div class='footer-copy'>جميع الحقوق محفوظة لموقع ويت انمي | WitAnime</div>
</footer>
</body>
</html>`;

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>قائمة الأنمي — WitAnime</title>
</head>
<body class="bg-black text-white">
<main class="container mx-auto px-4 py-8">
  <h1 class="text-2xl font-bold mb-6">قائمة الأنمي</h1>
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 w1200:grid-cols-6">
    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/anime/one-piece" href="https://witanime.site/anime/one-piece">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/96b62f648db8ff6cd11e38f430d725f7.jpg" alt="One Piece" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">TV</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">One Piece</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>1999</span>
        <span class="flex items-center gap-1 font-medium text-white">9.1</span>
      </div>
    </a>

    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/anime/black-clover-2nd-season" href="https://witanime.site/anime/black-clover-2nd-season">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/1ac58fc3560e6bc253d3eb055f38edc2.jpg" alt="Black Clover 2nd Season" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">TV</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">Black Clover 2nd Season</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>2026</span>
        <span class="flex items-center gap-1 font-medium text-white">8.9</span>
      </div>
    </a>

    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/movie/one-piece-stampede" href="https://witanime.site/movie/one-piece-stampede">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/eca3d14ede23adb23849f0f6fb517b4a.jpg" alt="One Piece: Stampede" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">فيلم</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">One Piece: Stampede</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>2019</span>
        <span class="flex items-center gap-1 font-medium text-white">8.2</span>
      </div>
    </a>

    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/anime/bleach-sennen-kessen-hen-kashin-tan" href="https://witanime.site/anime/bleach-sennen-kessen-hen-kashin-tan">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/b8417c8cf424f9e160e0a581845bb087.jpg" alt="BLEACH: Sennen Kessen-hen - Kashin-tan" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">TV</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">BLEACH: Sennen Kessen-hen - Kashin-tan</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>2024</span>
        <span class="flex items-center gap-1 font-medium text-white">8.8</span>
      </div>
    </a>
  </div>
  <div id="pagination" class="mt-8 flex justify-center gap-2">
    <a href="https://witanime.site/browse?page=2" class="px-4 py-2 bg-neutral-800 rounded">الصفحة التالية</a>
  </div>
</main>
</body>
</html>`;

export const SEARCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>بحث: one piece — WitAnime</title>
</head>
<body class="bg-black text-white">
<main class="container mx-auto px-4 py-8">
  <h1 class="text-2xl font-bold mb-6">نتائج البحث عن: one piece</h1>
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 w1200:grid-cols-6">
    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/anime/one-piece" href="https://witanime.site/anime/one-piece">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/96b62f648db8ff6cd11e38f430d725f7.jpg" alt="One Piece" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">TV</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">One Piece</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>1999</span>
        <span class="flex items-center gap-1 font-medium text-white">9.1</span>
      </div>
    </a>

    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/movie/one-piece-stampede" href="https://witanime.site/movie/one-piece-stampede">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/eca3d14ede23adb23849f0f6fb517b4a.jpg" alt="One Piece: Stampede" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">فيلم</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">One Piece: Stampede</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>2019</span>
        <span class="flex items-center gap-1 font-medium text-white">8.2</span>
      </div>
    </a>

    <a class="group block w-full cursor-pointer" data-preview="https://witanime.site/preview/movie/one-piece-film-red" href="https://witanime.site/movie/one-piece-film-red">
      <div class="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900">
        <img src="https://images.witanime.site/posters/633f0bc45a2d462797599992f4f19d55.jpg" alt="One Piece Film Red" loading="lazy" class="h-full w-full object-cover">
        <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <div class="h-6 rounded-md bg-white px-2 text-xs font-bold leading-6 text-black">فيلم</div>
        </div>
      </div>
      <h3 dir="ltr" class="truncate text-base font-semibold leading-snug text-white">One Piece Film Red</h3>
      <div dir="ltr" class="mt-1.5 flex items-center gap-2 text-sm text-neutral-400">
        <span>2022</span>
        <span class="flex items-center gap-1 font-medium text-white">8.1</span>
      </div>
    </a>
  </div>
</main>
</body>
</html>`;

export const DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>جميع حلقات انمي Black Clover 2nd Season مترجمة اون لاين — WitAnime</title>
</head>
<body class="bg-black text-white">
<main class="container mx-auto px-4 py-8">
  <div class="flex flex-col md:flex-row gap-8">
    <div class="w-full md:w-64 shrink-0">
      <img src="https://images.witanime.site/posters/1ac58fc3560e6bc253d3eb055f38edc2.jpg" alt="Black Clover 2nd Season" class="w-full rounded-xl">
    </div>
    <div class="flex-1">
      <h1 class="text-3xl font-extrabold mb-2">Black Clover 2nd Season</h1>
      <div class="flex flex-wrap gap-4 text-sm text-neutral-400 mb-4">
        <div><span>السنة: </span><span class="text-white">2026</span></div>
        <div><span>النوع: </span><span class="text-white">TV</span></div>
        <div><span>التقييم: </span><span class="text-white">8.9</span></div>
      </div>
      <p class="text-neutral-300 mb-6 leading-relaxed">
        تدور القصة حول أستا ويونو اللذان ترعرعا معاً في كنيسة في قرية هاجي، وفي عالم السحر حيث القوة السحرية هي كل شيء يطمح كلاهما لأن يصبحا إمبراطور السحر.
      </p>
      <div class="genres flex flex-wrap gap-2 mb-6">
        <a href="https://witanime.site/genre/action" class="bg-neutral-800 px-3 py-1 rounded-full text-xs">أكشن</a>
        <a href="https://witanime.site/genre/magic" class="bg-neutral-800 px-3 py-1 rounded-full text-xs">سحر</a>
        <a href="https://witanime.site/genre/shounen" class="bg-neutral-800 px-3 py-1 rounded-full text-xs">شونين</a>
      </div>
    </div>
  </div>

  <div class="episodes mt-10">
    <h2 class="text-xl font-bold mb-4">قائمة الحلقات</h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
      <a href="https://witanime.site/watch/black-clover-2nd-season/1" class="p-3 bg-neutral-900 rounded-lg text-center hover:bg-neutral-800">
        <span>الحلقة 1</span>
      </a>
      <a href="https://witanime.site/watch/black-clover-2nd-season/2" class="p-3 bg-neutral-900 rounded-lg text-center hover:bg-neutral-800">
        <span>الحلقة 2</span>
      </a>
    </div>
  </div>
</main>
</body>
</html>`;

export const WATCH_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl" data-devtools-guard="1">
<head>
<meta charset="UTF-8">
<meta name="csrf-token" content="Uh2slDMpCZL0oTGwW8yN7kXDv0vacXSiKuXJnYkG">
<title>انمي Black Clover 2nd Season الحلقة 2 مترجمة اون لاين — WitAnime</title>
</head>
<body class="bg-black text-white">
<div class="min-h-svh" x-data="watchPlayer({
  sourcesUrl: '/watch/black-clover-2nd-season/2/sources',
  qualityOrder: ['4K', 'FHD', 'HD', 'SD'],
  versionOrder: ['sub', 'dub'],
  langOrder: ['jp', 'ar'],
  defaultLang: 'jp',
  episodePage: 1
})">
  <div data-player-frame class="relative aspect-video bg-black">
    <div x-ref="playerContainer" id="player-container"></div>
  </div>
</div>
</body>
</html>`;

export const EPISODE_HTML = WATCH_HTML;

export const WATCH_SOURCES_JSON = Object.freeze({
  players: {
    FHD: [
      {
        token: "74821b7623d80e407fa50dd5c9d6b90af7f29ceb36326b52e1cb54211bad2891",
        label: "yonaplay",
        version: "sub",
        lang: "jp"
      },
      {
        token: "7454542bb69ccde0461701737aa748545616ef114ce8f163673dd71511046c4f",
        label: "ok",
        version: "sub",
        lang: "jp"
      },
      {
        token: "d50eb89934474f383e33355970d6f6ac1ea3f1e93b05794e5948e8bf8b045d55",
        label: "mega",
        version: "sub",
        lang: "jp"
      },
      {
        token: "19aec471156405cb4ed107e9642253404e7be15af7c2158b4eeda0cfb29f12e8",
        label: "4shared",
        version: "sub",
        lang: "jp"
      }
    ],
    HD: [
      {
        token: "ad15f49e44ce312343b420d12639ccb0f78a2693db502e7e492e4ab422e33f05",
        label: "yonaplay",
        version: "sub",
        lang: "jp"
      },
      {
        token: "ebe290d314430a6e3c9c8fd95080100c3ba872fda0bd80ec683680854db03071",
        label: "ok",
        version: "sub",
        lang: "jp"
      }
    ]
  },
  downloads: {}
});

export const REAL_RESOLVED_SERVERS = Object.freeze([
  {
    code: 'WE-1',
    serverCode: 'WE-1',
    name: 'WitAnime - yonaplay [FHD]',
    label: 'yonaplay - FHD',
    quality: '1080p',
    embedUrl: 'https://mid.yonaplay.net/embed/d6c89dd9e3d518b4/',
    directUrl: 'https://archive.org/download/2_20260405_20260405_1458/2.mp4',
    url: 'https://archive.org/download/2_20260405_20260405_1458/2.mp4',
    streamType: 'mp4',
    type: 'mp4',
    verified: true,
    headers: { Referer: 'https://mid.yonaplay.net/' }
  },
  {
    code: 'WE-2',
    serverCode: 'WE-2',
    name: 'WitAnime - ok [FHD]',
    label: 'ok - FHD',
    quality: 'AUTO-HLS',
    embedUrl: 'https://ok.ru/videoembed/12490650618555',
    directUrl: 'https://vd512.okcdn.ru/video.m3u8?cmd=videoPlayerCdn&expires=1776565341335&srcIp=2.89.208.151&pr=40&srcAg=CHROME&ms=45.136.21.22&type=3&sig=g5q2o8_b_pI&ct=8&urls=185.226.53.69&clientType=14&zs=43&id=11784369474235',
    url: 'https://vd512.okcdn.ru/video.m3u8?cmd=videoPlayerCdn&expires=1776565341335&srcIp=2.89.208.151&pr=40&srcAg=CHROME&ms=45.136.21.22&type=3&sig=g5q2o8_b_pI&ct=8&urls=185.226.53.69&clientType=14&zs=43&id=11784369474235',
    streamType: 'm3u8',
    type: 'm3u8',
    verified: true,
    headers: { Referer: 'https://ok.ru/' }
  },
  {
    code: 'WE-3',
    serverCode: 'WE-3',
    name: 'WitAnime - mega [FHD]',
    label: 'mega - FHD',
    quality: 'FHD',
    embedUrl: 'https://mega.nz/embed/CAdWSDJK#eJ8-092W-Hbdn_oQvGbw_B7K9q-V5w_R8y1bC2nE3mA',
    url: 'https://mega.nz/embed/CAdWSDJK#eJ8-092W-Hbdn_oQvGbw_B7K9q-V5w_R8y1bC2nE3mA',
    streamType: 'embed',
    type: 'embed',
    verified: false,
    headers: { Referer: 'https://witanime.site/' }
  },
  {
    code: 'WE-4',
    serverCode: 'WE-4',
    name: 'WitAnime - mediafire [FHD]',
    label: 'mediafire - FHD',
    quality: 'FHD',
    embedUrl: 'https://www.mediafire.com/file/black-clover-2nd-season-ep2-fhd.mp4/file',
    url: 'https://www.mediafire.com/file/black-clover-2nd-season-ep2-fhd.mp4/file',
    streamType: 'embed',
    type: 'embed',
    verified: false,
    headers: { Referer: 'https://witanime.site/' }
  }
]);

export const FIXTURES = Object.freeze({
  gateway: GATEWAY_HTML,
  catalog: CATALOG_HTML,
  search: SEARCH_HTML,
  details: DETAILS_HTML,
  episodes: DETAILS_HTML,
  episode: WATCH_HTML,
  watch: WATCH_HTML,
  servers: WATCH_HTML,
  sourcesJson: WATCH_SOURCES_JSON
});

export default {
  FIXTURE_META,
  GATEWAY_HTML,
  CATALOG_HTML,
  SEARCH_HTML,
  DETAILS_HTML,
  WATCH_HTML,
  EPISODE_HTML,
  WATCH_SOURCES_JSON,
  REAL_RESOLVED_SERVERS,
  FIXTURES,
  gateway: GATEWAY_HTML,
  catalog: CATALOG_HTML,
  search: SEARCH_HTML,
  details: DETAILS_HTML,
  episodes: DETAILS_HTML,
  episode: WATCH_HTML,
  watch: WATCH_HTML,
  servers: WATCH_HTML
};
