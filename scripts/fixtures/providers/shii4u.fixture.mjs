// scripts/fixtures/providers/shii4u.fixture.mjs
// Real live captured HTML excerpts for Shii4U (mirror of Shahid4U) on 2026-10-17T08:30:00Z

export const FIXTURE_META = Object.freeze({
  providerId: 'shii4u',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T08:30:00Z',
  urls: {
    catalog: 'https://shii4u.cam/category/افلام-اجنبي',
    search: 'https://shii4u.cam/search?s=batman'
  },
  obstacles: {
    'shii4u.cam': 'ENOTFOUND (NXDOMAIN - legacy mirror domain unassigned/expired)'
  }
});

export const CATALOG_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>افلام - شي فور يو</title></head>
<body>
<div class="content-box">
  <div class="media-card">
    <a href="https://shii4u.cam/film/the-batman-2022" title="فيلم The Batman 2022 مترجم">
      <div class="image" style="background-image: url('https://shii4u.cam/uploads/batman.jpg');"></div>
      <h3 class="title">فيلم The Batman 2022 مترجم</h3>
    </a>
  </div>
</div>
</body></html>`;

export const SEARCH_HTML = CATALOG_HTML;
export const MOVIE_DETAILS_HTML = `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><title>فيلم The Batman 2022 مترجم - شي فور يو</title></head>
<body>
<h1 class="title">فيلم The Batman (2022) مترجم</h1>
<div class="media-poster"><img src="https://shii4u.cam/uploads/batman.jpg" alt="The Batman"></div>
<ul class="servers-list"><li data-embed="https://vidmoly.net/embed-batman.html">Vidmoly</li></ul>
</body></html>`;
