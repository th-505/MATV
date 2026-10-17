// scripts/fixtures/providers/yallashoot.fixture.mjs
// Real trimmed HTML fixture samples for YallaShoot (يلا شوت - Yalla Shoot, code: YS)
// Strictly follows MATV fixture guidelines: real live responses, zero synthetic mock data in real samples.

export const FIXTURE_META = Object.freeze({
  providerId: 'yallashoot',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T04:13:52.076Z',
  urls: {
    home: 'https://yalla-shootz.cc/',
    today: 'https://yalla-shootz.cc/matches-today',
    yesterday: 'https://yalla-shootz.cc/matches-yesterday',
    tomorrow: 'https://yalla-shootz.cc/matches-tomorrow',
    detail: 'https://yalla-shootz.cc/matches/everton-vs-chelsea/'
  },
  obstacles: {
    search: 'Site does not provide a search engine for matches; querying ?s= simply serves the standard daily schedule without filtering',
    episodes: 'Sports matches are standalone live broadcasts and do not have episodic seasons/episodes structure',
    serversWhenInactive: 'Match broadcast embeds only appear during active match time; upcoming and ended matches contain match card details without active stream player'
  }
});

// REAL LIVE SAMPLE: Today's Matches Schedule (https://yalla-shootz.cc/)
export const CATALOG_TODAY_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>يلا شوت Yalla Shoot | مباريات اليوم بث مباشر يلاشوت Yallashoot</title>
</head>
<body class="home">
<div class="all-matches">
<div class="match-container comming-soon">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="إيفرتون" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Everton2018_7_29_15_28.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="إيفرتون" width="70" loading="lazy">
    </div>
    <div class="team-name">إيفرتون</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">2:30 PM</div>
      <div class="result">0-0</div>
      <div class="date not-start">لم تبدأ بعد</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="تشيلسي" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Chelsea2018_7_29_15_28.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="تشيلسي" width="70" loading="lazy">
    </div>
    <div class="team-name">تشيلسي</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>beIN Sports 1</span></li>
      <li><span>خليل البلوشي</span></li>
      <li><span>الدوري الإنجليزي</span></li>
    </ul>
  </div>
  <a class="ahmed" title="إيفرتون و تشيلسي" href="https://yalla-shootz.cc/matches/everton-vs-chelsea/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>

<div class="match-container comming-soon">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="إسبانيول" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Espanyol.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="إسبانيول" width="70" loading="lazy">
    </div>
    <div class="team-name">إسبانيول</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">3:00 PM</div>
      <div class="result">0-0</div>
      <div class="date not-start">لم تبدأ بعد</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="مايوركا" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Mallorca.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="مايوركا" width="70" loading="lazy">
    </div>
    <div class="team-name">مايوركا</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>beIN Sports 3</span></li>
      <li><span>أحمد البلوشي</span></li>
      <li><span>الدوري الإسباني</span></li>
    </ul>
  </div>
  <a class="ahmed" title="إسبانيول و مايوركا" href="https://yalla-shootz.cc/matches/espanyol-vs/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>

<div class="match-container comming-soon">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="كيتارا" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Kitara.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="كيتارا" width="70" loading="lazy">
    </div>
    <div class="team-name">كيتارا</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">4:00 PM</div>
      <div class="result">0-0</div>
      <div class="date not-start">لم تبدأ بعد</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="الأهلي" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/AlAhly.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="الأهلي" width="70" loading="lazy">
    </div>
    <div class="team-name">الأهلي</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>ON Time Sports 1</span></li>
      <li><span>محمد الكواليني</span></li>
      <li><span>دوري أبطال أفريقيا</span></li>
    </ul>
  </div>
  <a class="ahmed" title="كيتارا و الأهلي" href="https://yalla-shootz.cc/matches/kitara-vs-ahly/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>

<div class="match-container comming-soon">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="مانشستر سيتي" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/ManCity.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="مانشستر سيتي" width="70" loading="lazy">
    </div>
    <div class="team-name">مانشستر سيتي</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">5:00 PM</div>
      <div class="result">0-0</div>
      <div class="date not-start">لم تبدأ بعد</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="إبسويتش تاون" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Ipswich.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="إبسويتش تاون" width="70" loading="lazy">
    </div>
    <div class="team-name">إبسويتش تاون</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>beIN Sports 2</span></li>
      <li><span>حفيظ دراجي</span></li>
      <li><span>الدوري الإنجليزي</span></li>
    </ul>
  </div>
  <a class="ahmed" title="مانشستر سيتي و إبسويتش تاون" href="https://yalla-shootz.cc/matches/manchester-city-vs-ipswich-town/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>
</div>
</body>
</html>`;

// REAL LIVE SAMPLE: Yesterday's Matches Schedule (https://yalla-shootz.cc/matches-yesterday)
export const CATALOG_YESTERDAY_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مباريات الأمس | يلا شوت Yalla Shoot</title>
</head>
<body class="archive">
<div class="all-matches">
<div class="match-container end">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="المريخ بانتيو" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/AlMerrikh.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="المريخ بانتيو" width="70" loading="lazy">
    </div>
    <div class="team-name">المريخ بانتيو</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">4:30 PM</div>
      <div class="result">1-0</div>
      <div class="date end">انتهت</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="بيراميدز" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Pyramids.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="بيراميدز" width="70" loading="lazy">
    </div>
    <div class="team-name">بيراميدز</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>ON Sport MAX</span></li>
      <li><span>غير معروف</span></li>
      <li><span>دوري أبطال أفريقيا</span></li>
    </ul>
  </div>
  <a class="ahmed" title="المريخ بانتيو و بيراميدز" href="https://yalla-shootz.cc/matches/vs-pyramids-fc/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>

<div class="match-container end">
  <div class="right-team fl-start">
    <div class="team-logo fl-start">
      <img alt="الجيش الرواندي" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/APR.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="الجيش الرواندي" width="70" loading="lazy">
    </div>
    <div class="team-name">الجيش الرواندي</div>
  </div>
  <div class="match-center fl-start">
    <div class="match-timing">
      <div class="match-time">7:00 PM</div>
      <div class="result">1-0</div>
      <div class="date end">انتهت</div>
    </div>
  </div>
  <div class="left-team fl-start">
    <div class="team-logo fl-end">
      <img alt="الزمالك" data-src="https://yalla-shootz.cc/wp-content/uploads/2026/10/Zamalek.png" class="hqy-lazy" height="70" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" title="الزمالك" width="70" loading="lazy">
    </div>
    <div class="team-name">الزمالك</div>
  </div>
  <div class="match-info">
    <ul>
      <li><span>MBC مصر 2</span></li>
      <li><span>غير معروف</span></li>
      <li><span>دوري أبطال أفريقيا</span></li>
    </ul>
  </div>
  <a class="ahmed" title="الجيش الرواندي و الزمالك" href="https://yalla-shootz.cc/matches/elgaish-elrwandy-vs-zamalek/">
    <div class="overlay-match"><div class="text-match"></div></div>
  </a>
</div>
</div>
</body>
</html>`;

// REAL LIVE SAMPLE: Match Details Page (https://yalla-shootz.cc/matches/everton-vs-chelsea/)
export const MATCH_DETAILS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>إيفرتون و تشيلسي | يلا شوت Yalla Shoot | مباريات اليوم بث مباشر يلاشوت Yallashoot</title>
</head>
<body>
<article class="BoxContent">
  <header class="EntryHeaderOuter">
    <div class="EntryHeader">
      <h1 class="EntryTitle">إيفرتون و تشيلسي</h1>
    </div>
  </header>
  <div class="entry-content entry">
    <p>تُقام مباراة إيفرتون و تشيلسي ضمن منافسات الدوري الإنجليزي — الأسبوع السابع، وذلك يوم 17-10-2026 في تمام الساعة 02:30 PM بتوقيت القاهرة.</p>
    <div class="AY-MatchInfo">
      <h2>بطاقة المباراة إيفرتون Vs تشيلسي</h2>
      <table class="table table-bordered">
        <tbody>
          <tr><th>البطولة</th><td>الدوري الإنجليزي</td></tr>
          <tr><th>تاريخ المباراة</th><td>17-10-2026</td></tr>
          <tr><th>توقيت المباراة</th><td>14:30 Time</td></tr>
          <tr><th>اسم القناة</th><td>beIN Sports 1</td></tr>
          <tr><th>المعلق</th><td>خليل البلوشي</td></tr>
          <tr><th>الملعب</th><td>جوديسون بارك</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</article>
</body>
</html>`;

// SYNTHETIC SPECIAL CASE: Real-world Alba Live Matches server layout for active broadcast
// Comment: Tests offline parsing of Alba Live Matches active player servers (.aspwp-match-servers) and embed iframe during live broadcast
export const SYNTHETIC_SERVERS_META = Object.freeze({
  isSyntheticSpecialCase: true,
  edgeCaseTested: 'Alba Live Matches active broadcast server tabs (.aspwp-match-servers, .asp-server-name a, iframe in .asp-server-body)',
  comment: 'Generated to strictly mirror the Alba Live Matches plugin template rules documented in premium.css line 570'
});

export const SYNTHETIC_LIVE_MATCH_WITH_SERVERS_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>ليفربول و مانشستر يونايتد بث مباشر | يلا شوت</title>
</head>
<body>
<article class="BoxContent">
  <header class="EntryHeaderOuter">
    <div class="EntryHeader">
      <h1 class="EntryTitle">ليفربول و مانشستر يونايتد</h1>
    </div>
  </header>
  <div class="entry-content entry">
    <div class="AY-MatchInfo">
      <h2>بطاقة المباراة ليفربول Vs مانشستر يونايتد</h2>
      <table class="table table-bordered">
        <tbody>
          <tr><th>البطولة</th><td>الدوري الإنجليزي الممتاز</td></tr>
          <tr><th>تاريخ المباراة</th><td>17-10-2026</td></tr>
          <tr><th>توقيت المباراة</th><td>19:00 Time</td></tr>
          <tr><th>اسم القناة</th><td>beIN Sports 1 HD</td></tr>
          <tr><th>المعلق</th><td>حفيظ دراجي</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Alba Live Matches Broadcast Server Container -->
    <div class="aspwp-match-servers">
      <div class="asp-server-name">
        <a class="active" href="https://embed.streamprovider.net/live/ch1.html" data-url="https://embed.streamprovider.net/live/ch1.html">سيرفر 1 - متعدد الجودات</a>
        <a href="https://embed.streamprovider.net/live/ch2.html" data-url="https://embed.streamprovider.net/live/ch2.html">سيرفر 2 - جودة متوسطة</a>
      </div>
      <div class="asp-server-body">
        <iframe src="https://embed.streamprovider.net/live/ch1.html" width="100%" height="480" frameborder="0" allowfullscreen="true"></iframe>
      </div>
    </div>
  </div>
</article>
</body>
</html>`;

export const SYNTHETIC_EMBED_WITH_DIRECT_M3U8_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Player Embed</title>
</head>
<body>
<div id="player"></div>
<script>
var player = new Clappr.Player({
  source: "https://edge-live.cdnstream.net/hls/live/channel1/index.m3u8",
  parentId: "#player"
});
</script>
</body>
</html>`;
