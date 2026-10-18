// =====================================================================
// MA TV SUPREME CATEGORIES CONFIGURATION (Clean & Standardized)
// =====================================================================

export const CinemaCategories = Object.freeze({
  movies: Object.freeze([
    { title: "الكل", url: "browse-movies" },
    { title: "أجنبي", url: "browse-movie-foreign" },
    { title: "عربي", url: "browse-movie-arabic" },
    { title: "هندي", url: "browse-movie-indian" },
    { title: "آسيوي", url: "browse-movie-asian" },
    { title: "تركي", url: "browse-movie-turkish" },
  ]),
  series: Object.freeze([
    { title: "الكل", url: "browse-series" },
    { title: "أجنبية", url: "browse-series-foreign" },
    { title: "عربية", url: "browse-series-arabic" },
    { title: "تركية", url: "browse-series-turkish" },
    { title: "آسيوية", url: "browse-series-asian" },
    { title: "رمضان", url: "browse-series-ramadan" },
  ]),
  turkish: Object.freeze([
    { title: "الكل", url: "3isk-latest" },
    { title: "أحدث الحلقات (تركي)", url: "3isk-latest" },
    { title: "مسلسلات تركية مترجمة", url: "3isk-turkish" },
    { title: "مسلسلات تركية مدبلجة", url: "3isk-dubbed" },
    { title: "أفلام تركية", url: "browse-movie-turkish" },
  ]),
  anime: Object.freeze([
    { title: "الكل", url: "browse-anime" },
    { title: "أفلام أنمي", url: "browse-anime-movies" },
    { title: "مسلسلات أنمي", url: "browse-anime-series" },
  ]),
});
