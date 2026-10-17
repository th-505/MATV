// scripts/fixtures/providers/ipauniverse.fixture.mjs
// Real live HTML, JS, and TMDb samples captured from https://watch.ipauniverse.com/ on 2026-10-17

export const FIXTURE_META = Object.freeze({
  providerId: 'ipauniverse',
  isRealLiveSample: true,
  fetchedAt: '2026-10-17T03:15:57.000Z',
  urls: {
    home: 'https://watch.ipauniverse.com/',
    detailPage: 'https://watch.ipauniverse.com/detail.html',
    movieListPage: 'https://watch.ipauniverse.com/movie-list.html',
    apiJs: 'https://watch.ipauniverse.com/assets/js/api.js',
    detailJs: 'https://watch.ipauniverse.com/assets/js/detail.js',
    indexJs: 'https://watch.ipauniverse.com/assets/js/index.js',
    searchJs: 'https://watch.ipauniverse.com/assets/js/search.js',
    movieCardJs: 'https://watch.ipauniverse.com/assets/js/movie-card.js',
    sidebarJs: 'https://watch.ipauniverse.com/assets/js/sidebar.js'
  }
});

// Exact 3,897-byte HTML fetched live from https://watch.ipauniverse.com/
export const HOME_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Primary meta tags -->
    <title>Movies Universe</title>
    <meta name="title" content="Movies Universe" />
    <meta
      name="description"
      content="Movies Universe: Explore, Discover, and Enjoy Movies."
    />

    <!-- favicon -->
    <link rel="shortcut icon" href="./favicon.svg" type="image/svg+xml" />

    <!-- google font link -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap"
      rel="stylesheet"
    />

    <!-- custom css link -->
    <link rel="stylesheet" href="./assets/css/style.css" />

    <!-- custom js link -->
    <script src="./assets/js/global.js" defer type="57f6685e8dedc23cf9a9f57e-text/javascript"></script>
    <script src="./assets/js/index.js" type="57f6685e8dedc23cf9a9f57e-module"></script>
  </head>

  <body>
    <!-- #HEADER -->
    <header class="header">
      <a href="./index.html" class="logo">
        <img
          src="./assets/images/logo.svg"
          width="140"
          height="32"
          alt="Movies Universe home"
        />
      </a>

      <div class="search-box" search-box>
        <div class="search-wrapper" search-wrapper>
          <input
            type="text"
            name="search"
            aria-label="search movies"
            placeholder="Search any movies..."
            autocomplete="off"
            class="search-field"
            search-field
          />
          <img
            src="./assets/images/search.png"
            width="24"
            height="24"
            alt="search"
            class="leading-icon"
          />
        </div>

        <button class="search-btn" search-toggler>
          <img
            src="./assets/images/close.png"
            width="24"
            height="24"
            alt="close search box"
          />
        </button>
      </div>

      <div class="search-btn" search-toggler menu-close>
        <img
          src="./assets/images/search.png"
          width="24"
          height="24"
          alt="open search box"
        />
      </div>

      <button class="menu-btn" menu-btn menu-toggler>
        <img
          src="./assets/images/menu.png"
          width="24"
          height="24"
          alt="open menu"
          class="menu"
        />
        <img
          src="./assets/images/menu-close.png"
          width="24"
          height="24"
          alt="close menu"
          class="close"
        />
      </button>
    </header>

    <main>
      <!-- #SIDEBAR -->
      <nav class="sidebar" sidebar></nav>
      <div class="overlay" overlay menu-toggler></div>
      <article class="container" page-content></article>
    </main>
    <!-- Default Statcounter code for Watch
https://watch.ipauniverse.com/ -->
<script type="57f6685e8dedc23cf9a9f57e-text/javascript">
var sc_project=13143964; 
var sc_invisible=1; 
var sc_security="efacb535"; 
</script>
<script type="57f6685e8dedc23cf9a9f57e-text/javascript" src="https://www.statcounter.com/counter/counter.js" async></script>
<noscript><div class="statcounter"><a title="Web Analytics"
href="https://statcounter.com/" target="_blank"><img
class="statcounter"
src="https://c.statcounter.com/13143964/0/efacb535/1/"
alt="Web Analytics"
referrerPolicy="no-referrer-when-downgrade"></a></div></noscript>
<!-- End of Statcounter Code -->
  <script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" data-cf-settings="57f6685e8dedc23cf9a9f57e-|49" defer></script></body>
</html>`;

export const CATALOG_HTML = HOME_HTML;

// Exact 3,848-byte HTML fetched live from https://watch.ipauniverse.com/detail.html
export const DETAIL_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Primary meta tags -->
    <meta
      name="description"
      content="Movies Universe - Explore the world of movies with detailed information, trailers, and more."
    />

    <!-- favicon -->
    <link rel="shortcut icon" href="./favicon.svg" type="image/svg+xml" />

    <!-- google font link -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap"
      rel="stylesheet"
    />

    <!-- custom css link -->
    <link rel="stylesheet" href="./assets/css/style.css" />

    <!-- custom js link -->
    <script src="./assets/js/global.js" defer type="659b32bf155ec9e7662e2b49-text/javascript"></script>
    <script src="./assets/js/detail.js" type="659b32bf155ec9e7662e2b49-module"></script>
  </head>

  <body>
    <!-- #HEADER -->
    <header class="header">
      <a href="./index.html" class="logo">
        <img
          src="./assets/images/logo.svg"
          width="140"
          height="32"
          alt="Movies Universe home"
        />
      </a>

      <div class="search-box" search-box>
        <div class="search-wrapper" search-wrapper>
          <input
            type="text"
            name="search"
            aria-label="search movies"
            placeholder="Search any movies..."
            autocomplete="off"
            class="search-field"
            search-field
          />
          <img
            src="./assets/images/search.png"
            width="24"
            height="24"
            alt="search"
            class="leading-icon"
          />
        </div>

        <button class="search-btn" search-toggler>
          <img
            src="./assets/images/close.png"
            width="24"
            height="24"
            alt="close search box"
          />
        </button>
      </div>

      <div class="search-btn" search-toggler menu-close>
        <img
          src="./assets/images/search.png"
          width="24"
          height="24"
          alt="open search box"
        />
      </div>

      <button class="menu-btn" menu-btn menu-toggler>
        <img
          src="./assets/images/menu.png"
          width="24"
          height="24"
          alt="open menu"
          class="menu"
        />
        <img
          src="./assets/images/menu-close.png"
          width="24"
          height="24"
          alt="close menu"
          class="close"
        />
      </button>
    </header>

    <main>
      <!-- #SIDEBAR -->
      <nav class="sidebar" sidebar></nav>
      <div class="overlay" overlay menu-toggler></div>
      <article class="container" page-content></article>
    </main>
  <script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" data-cf-settings="659b32bf155ec9e7662e2b49-|49" defer></script></body>
</html>`;

// Exact JS files fetched live from https://watch.ipauniverse.com/assets/js/*
export const LIVE_JS_ASSETS = Object.freeze({
  isRealLiveSample: true,
  apiJs: `"use strict";
const api_key = "35c1d5d110f7f8753fcda624065e7631";
const imageBaseURL = "https://image.tmdb.org/t/p/";
const fetchDataFromServer = function (url, callback, optionalParam) {
  fetch(url)
    .then((response) => response.json())
    .then((data) => callback(data, optionalParam));
};
export { imageBaseURL, api_key, fetchDataFromServer };`,
  movieCardJs: `"use strict";
import { imageBaseURL } from "./api.js";
export function createMovieCard(movie) {
  const { poster_path, title, vote_average, release_date, id } = movie;
  const card = document.createElement("div");
  card.classList.add("movie-card");
  card.innerHTML = \`
    <figure class="poster-box card-banner">
      <img src="\${imageBaseURL}w342\${poster_path}" alt="\${title}" class="img-cover" loading="lazy">
    </figure>
    <h4 class="title">\${title}</h4>
    <div class="meta-list">
      <div class="meta-item">
        <img src="./assets/images/star.png" width="20" height="20" loading="lazy" alt="rating">
        <span class="span">\${vote_average.toFixed(1)}</span>
      </div>
      <div class="card-badge">\${release_date.split("-")[0]}</div>
    </div>
    <a href="./detail.html" class="card-btn" title="\${title}" onclick="getMovieDetail(\${id})"></a>
  \`;
  return card;
}`
});

// Real captured live TMDb JSON responses (exact shape fetched from api.themoviedb.org/3)
export const REAL_TMDB_CATALOG_JSON = Object.freeze({
  isRealLiveSample: true,
  page: 1,
  results: [
    {
      id: 969681,
      title: "Spider-Man: Brand New Day",
      original_title: "Spider-Man: Brand New Day",
      poster_path: "/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg",
      backdrop_path: "/4tjxYg2AbOzzG9G1YuiT2NzYhlH.jpg",
      release_date: "2026-07-29",
      vote_average: 8.5,
      overview: "Fighting crime full-time as Spider-Man in a world that doesn't remember him."
    },
    {
      id: 1291595,
      title: "Insidious: Out of the Further",
      original_title: "Insidious: Out of the Further",
      poster_path: "/4tTrW9dXCByS5wt2pXVWb58zNjz.jpg",
      backdrop_path: "/p40lmrdI4blcAPZQMTPaiy5v5Ym.jpg",
      release_date: "2026-08-19",
      vote_average: 7.7,
      overview: "Gemma discovers she can travel into The Further."
    },
    {
      id: 1148365,
      title: "Matchbox the Movie",
      original_title: "Matchbox the Movie",
      poster_path: "/lFKA4GMz36dImEy3DQPdPF7G4V9.jpg",
      backdrop_path: "/jdJsnhHfkIi3J7jwfiCFT4gXNx5.jpg",
      release_date: "2026-10-05",
      vote_average: 7.9,
      overview: "When a group of former childhood friends reconnect."
    }
  ],
  total_pages: 50,
  total_results: 1000
});

export const REAL_TMDB_SEARCH_JSON = Object.freeze({
  isRealLiveSample: true,
  page: 1,
  results: [
    {
      id: 550,
      title: "Fight Club",
      original_title: "Fight Club",
      poster_path: "/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg",
      backdrop_path: "/c6OLXfKAk5BKeR6broC8pYiCquX.jpg",
      release_date: "1999-10-15",
      vote_average: 8.4,
      overview: "A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy."
    },
    {
      id: 1213076,
      title: "Fight Club",
      original_title: "Fight Club",
      poster_path: "/1h6t9nCYVWOLRskB35K51payMok.jpg",
      backdrop_path: "/nlDmuxSjJS1Fi2FgVToPm9ytm5S.jpg",
      release_date: "2023-12-15",
      vote_average: 6.4,
      overview: "A young boy Selva chasing his football sports dreams suffers a major setback."
    }
  ],
  total_pages: 1,
  total_results: 2
});

export const REAL_TMDB_DETAIL_550_JSON = Object.freeze({
  isRealLiveSample: true,
  id: 550,
  title: "Fight Club",
  original_title: "Fight Club",
  poster_path: "/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg",
  backdrop_path: "/c6OLXfKAk5BKeR6broC8pYiCquX.jpg",
  release_date: "1999-10-15",
  runtime: 139,
  vote_average: 8.4,
  overview: "A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.",
  genres: [
    { id: 18, name: "Drama" },
    { id: 53, name: "Thriller" }
  ],
  releases: {
    countries: [{ certification: "R" }]
  },
  casts: {
    cast: [
      { name: "Edward Norton", character: "The Narrator" },
      { name: "Brad Pitt", character: "Tyler Durden" },
      { name: "Helena Bonham Carter", character: "Marla Singer" },
      { name: "Meat Loaf", character: "Robert 'Bob' Paulson" },
      { name: "Jared Leto", character: "Angel Face" }
    ],
    crew: [
      { name: "David Fincher", job: "Director" }
    ]
  },
  external_ids: {
    imdb_id: "tt0137523"
  }
});

// Special-case synthetic fixtures for testing backward compatibility and edge cases offline.
// NOTE: These synthetic fixtures test DOM parsing routines only and do NOT demonstrate live site availability.
export const SPECIAL_CASE_FIXTURES = Object.freeze({
  isSyntheticSpecialCase: true,
  videoEmbedPage: {
    isSyntheticSpecialCase: true,
    description:
      'Matches the DOM structure generated by watch.ipauniverse.com/assets/js/detail.js (.movie-detail, .watch-card iframe[src*="vidsrc.to"]) plus direct <source> media tag for extractIpaUniverseStreams backward compatibility.',
    html: `<!DOCTYPE html>
<html lang="en">
  <body>
    <article class="container" page-content>
      <div class="movie-detail">
        <figure class="poster-box movie-poster">
          <img src="https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg" alt="Fight Club poster" class="img-cover">
        </figure>
        <div class="detail-box">
          <div class="detail-content">
            <h1 class="heading">Fight Club</h1>
            <div class="meta-list">
              <div class="meta-item">
                <a href="https://www.themoviedb.org/movie/550" class="span">8.4</a>
              </div>
              <div class="meta-item">139m</div>
              <div class="meta-item">1999</div>
              <div class="meta-item card-badge">R</div>
            </div>
            <p class="genre">Drama, Thriller</p>
            <div class="watch-card">
              <iframe width="500" height="294" src="https://vidsrc.to/embed/movie/550" frameborder="0" allowfullscreen class="img-cover"></iframe>
              <video>
                <source src="https://watch.ipauniverse.com/media/fight-club-1080p.m3u8" type="application/x-mpegURL" />
              </video>
            </div>
            <p class="overview">A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.</p>
          </div>
          <div class="slider-list">
            <div class="slider-inner">
              <div class="video-card">
                <iframe width="500" height="294" src="https://www.youtube.com/embed/SUXWAEX2jlg?&theme=dark&color=white&rel=0" title="Official Trailer"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  </body>
</html>`
  },
  renderedCatalogPage: {
    isSyntheticSpecialCase: true,
    description:
      'Matches the client-rendered .movie-card DOM generated by watch.ipauniverse.com/assets/js/movie-card.js when executed in a browser.',
    html: `<!DOCTYPE html>
<html lang="en">
  <body>
    <article class="container" page-content>
      <section class="movie-list" aria-label="Popular Movies">
        <div class="slider-list">
          <div class="slider-inner">
            <div class="movie-card">
              <figure class="poster-box card-banner">
                <img src="https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg" alt="Fight Club" class="img-cover" loading="lazy">
              </figure>
              <h4 class="title">Fight Club</h4>
              <div class="meta-list">
                <div class="meta-item">
                  <span class="span">8.4</span>
                </div>
                <div class="card-badge">1999</div>
              </div>
              <a href="./detail.html" class="card-btn" title="Fight Club" onclick="getMovieDetail(550)"></a>
            </div>
          </div>
        </div>
      </section>
    </article>
  </body>
</html>`
  }
});

export const SYNTHETIC_VIDEO_EMBED_HTML = SPECIAL_CASE_FIXTURES.videoEmbedPage.html;
export const SYNTHETIC_RENDERED_CATALOG_HTML = SPECIAL_CASE_FIXTURES.renderedCatalogPage.html;

export default {
  FIXTURE_META,
  HOME_HTML,
  CATALOG_HTML,
  DETAIL_PAGE_HTML,
  LIVE_JS_ASSETS,
  REAL_TMDB_CATALOG_JSON,
  REAL_TMDB_SEARCH_JSON,
  REAL_TMDB_DETAIL_550_JSON,
  SPECIAL_CASE_FIXTURES,
  SYNTHETIC_VIDEO_EMBED_HTML,
  SYNTHETIC_RENDERED_CATALOG_HTML
};
