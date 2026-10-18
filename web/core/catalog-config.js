// =====================================================================
// MA TV SUPREME CATEGORIES CONFIGURATION (Clean & Standardized)
// =====================================================================

export const CinemaCategories = Object.freeze({
  movies: Object.freeze([
    { title: "الكل", url: "browse-movies" },
    { title: "أجنبي", url: "movie-foreign" },
    { title: "عربي", url: "movie-arabic" },
    { title: "هندي", url: "movie-indian" },
    { title: "آسيوي", url: "movie-asian" },
    { title: "تركي", url: "3isk-movies" },
  ]),
  series: Object.freeze([
    { title: "الكل", url: "browse-series" },
    { title: "أجنبية", url: "series-foreign" },
    { title: "عربية", url: "series-arabic" },
    { title: "تركية", url: "series-turkish" },
    { title: "آسيوية", url: "series-asian" },
    { title: "رمضان", url: "series-ramadan" },
  ]),
  turkish: Object.freeze([
    { title: "الكل", url: "3isk-latest" },
    { title: "أحدث الحلقات (تركي)", url: "3isk-latest" },
    { title: "مسلسلات تركية مترجمة", url: "3isk-turkish" },
    { title: "مسلسلات تركية مدبلجة", url: "3isk-dubbed" },
    { title: "أفلام تركية", url: "3isk-movies" },
  ]),
  anime: Object.freeze([
    { title: "الكل", url: "browse-anime" },
    { title: "أفلام أنمي", url: "movie-anime" },
    { title: "مسلسلات أنمي", url: "series-anime" },
  ]),
});
