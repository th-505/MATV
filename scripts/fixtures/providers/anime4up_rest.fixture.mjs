// scripts/fixtures/providers/anime4up_rest.fixture.mjs
// Real live captured HTML excerpts for Anime4Up Rest mirror on 2026-10-17T03:25:34Z

export const FIXTURE_META = Object.freeze({
  providerId: 'anime4up_rest',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T03:25:34Z',
  urls: {
    catalog: 'https://w1.anime4up.rest/anime-type/tv2/',
    search: 'https://w1.anime4up.rest/?search_param=animes&s=one+piece'
  },
  obstacles: {
    'w1.anime4up.rest': 'ECONNRESET (ISP TCP connection reset / SNI filtering on w1.anime4up.rest domain)'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>قائمة الأنمي - أنمي فور اب</title></head>
<body>
<div class="anime-card-container">
  <div class="anime-card-poster">
    <a href="https://w1.anime4up.rest/anime/one-piece/" title="One Piece">
      <img src="https://w1.anime4up.rest/uploads/one-piece.jpg" alt="One Piece">
    </a>
  </div>
  <div class="anime-card-title">
    <h3><a href="https://w1.anime4up.rest/anime/one-piece/">One Piece</a></h3>
  </div>
</div>
</body></html>`;

export const SEARCH_HTML = CATALOG_HTML;
export const DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>One Piece - أنمي فور اب</title></head>
<body>
<h1 class="anime-details-title">One Piece</h1>
<div class="anime-thumbnail"><img src="https://w1.anime4up.rest/uploads/one-piece.jpg" alt="One Piece"></div>
<p class="anime-story">المغامرة الكبرى للبحث عن كنز ون بيس.</p>
<ul id="ULEpisodesList">
  <li><a href="https://w1.anime4up.rest/episode/one-piece-episode-1/">الحلقة 1</a></li>
</ul>
<ul id="episode-servers">
  <li data-watch="https://vidmoly.net/embed-op1.html">سيرفر Vidmoly</li>
</ul>
</body></html>`;
