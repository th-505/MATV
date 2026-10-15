import 'dart:convert';

import 'models.dart';

/// Content classification uses descriptive metadata, never the provider name.
class MediaTaxonomy {
  static String classify(MediaItem item) {
    final type = _words(item.type);
    final genres = item.genres.map(_words).toSet();
    final title = _words(item.title);
    if (_animeTypes.contains(type) ||
        genres.any(
          (genre) =>
              _animeTypes.contains(genre) ||
              RegExp(r'(^|\s)(anime|انمي|انيمي)(\s|$)').hasMatch(genre),
        )) {
      return 'anime';
    }
    if (_programTypes.contains(type) ||
        genres.any((genre) => _programTypes.contains(genre)) ||
        RegExp(r'^برنامج(?:\s|$)').hasMatch(title)) {
      return 'program';
    }
    if (_movieTypes.contains(type)) return 'movie';
    if (_seriesTypes.contains(type) ||
        genres.any((genre) => _seriesTypes.contains(genre)) ||
        _episodeMarker.hasMatch(title) ||
        RegExp(r'^مسلسل(?:\s|$)').hasMatch(title)) {
      return 'series';
    }
    if (genres.any((genre) => _movieTypes.contains(genre))) return 'movie';
    return 'unknown';
  }

  /// Remove presentation suffixes while preserving years and episode numbers.
  /// Arabic/Latin transliteration is deliberately not guessed.
  static String normalizeTitle(String title) {
    var value = _fold(title).trim();
    for (var i = 0; i < 4; i++) {
      final previous = value;
      value = value.replaceFirst(_qualitySuffix, '').trim();
      value = value.replaceFirst(_translationSuffix, '').trim();
      if (value == previous) break;
    }
    value = value.replaceFirst(RegExp(r'^(?:فيلم|مسلسل|انمي)\s+'), '');
    return _words(value);
  }

  static const _movieTypes = {
    'movie',
    'movies',
    'film',
    'films',
    'فيلم',
    'افلام',
    'الافلام',
  };
  static const _seriesTypes = {
    'series',
    'serie',
    'tv series',
    'tv',
    'episode',
    'episodes',
    'مسلسل',
    'مسلسلات',
    'المسلسلات',
    'حلقة',
    'حلقات',
  };
  static const _programTypes = {
    'program',
    'programs',
    'programme',
    'show',
    'shows',
    'tv show',
    'tvshow',
    'tvshows',
    'tv shows',
    'tv program',
    'talk show',
    'reality tv',
    'game show',
    'variety show',
    'برنامج',
    'برامج',
    'البرامج',
  };
  static const _animeTypes = {'anime', 'انمي', 'انيمي', 'الانمي', 'انميات'};
}

final _episodeMarker = RegExp(
  r'(?:^|\s)(?:s\s*\d+\s*e\s*\d+(?:\s|$)|(?:episode|ep)(?:\s*\d+|\s|$)|(?:الحلقة|الحلقه|حلقة|حلقه|الموسم)(?:\s*\d+|\s|$))',
  caseSensitive: false,
);
final _qualitySuffix = RegExp(
  r'(?:\s|[\[\(\-–—|:])+(?:(?:بجودة|جودة)\s+)?(?:\d{3,4}p|[248]k|full[\s-]?hd|hd|sd|web[\s-]?dl|web[\s-]?rip|blu[\s-]?ray|brrip|hdtv|dvdrip|hdrip|hdr|10bit|[xh]26[45])\s*[\]\)]*$',
  caseSensitive: false,
);
final _translationSuffix = RegExp(
  r'(?:\s|[\[\(\-–—|:])+(?:مترجم|مترجمة|مدبلج|مدبلجة|dubbed|subbed|subtitled)\s*[\]\)]*$',
  caseSensitive: false,
);

String _fold(String value) {
  var result = value
      .toLowerCase()
      .replaceAll(RegExp(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]'), '')
      .replaceAll(RegExp(r'[أإآٱ]'), 'ا')
      .replaceAll('ى', 'ي');
  const digits = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  for (var i = 0; i < digits.length; i++) {
    result = result.replaceAll(digits[i], '${i % 10}');
  }
  return result;
}

String _words(String value) => _fold(value)
    .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ')
    .trim()
    .replaceAll(RegExp(r'\s+'), ' ');

/// Merge only proven same-work, same-edition references. Missing metadata is a
/// reason to retain separate cards, rather than guess a playback identity.
class UnifiedMedia {
  /// Compare descriptive identity even when references are identical. This is
  /// the stricter check needed before pairing episodes from fetched metadata.
  static bool sameIdentity(MediaItem a, MediaItem b) =>
      _MediaIdentity(a).matches(_MediaIdentity(b));

  static List<MediaItem> mergeSources(Iterable<MediaItem> items) {
    final groups = <_MediaGroup>[];
    final byReference = <String, _MediaGroup>{};
    final byIdentity = <String, List<_MediaGroup>>{};
    for (final item in items) {
      final normalized = item.copyWith(sourceRefs: _references(item));
      final identity = _MediaIdentity(normalized);
      var group = item.ref.isEmpty ? null : byReference[item.ref];
      if (group == null) {
        final candidates = <_MediaGroup>{
          for (final key in identity.keys) ...?byIdentity[key],
        };
        for (final candidate in candidates) {
          if (candidate.canMerge(normalized, identity)) {
            group = candidate;
            break;
          }
        }
      }
      if (group == null) {
        group = _MediaGroup(normalized, identity);
        groups.add(group);
      } else {
        group.add(normalized, identity);
      }
      if (item.ref.isNotEmpty) byReference[item.ref] = group;
      for (final key in identity.keys) {
        final bucket = byIdentity.putIfAbsent(key, () => []);
        if (!bucket.contains(group)) bucket.add(group);
      }
    }
    return List.unmodifiable(groups.map((group) => group.item));
  }

  static String providerId(MediaItem item) {
    final prefix = item.ref.split(':').first.toLowerCase();
    final fromReference = _providerAliases[prefix];
    if (fromReference != null) return fromReference;
    final source = item.source.trim().toLowerCase();
    return _providerAliases[source] ?? (source == 'mitv' ? prefix : source);
  }

  static Map<String, String> _references(MediaItem item) => {
    for (final entry in item.sourceRefs.entries)
      if (entry.key.trim().isNotEmpty && entry.value.isNotEmpty)
        _providerAliases[entry.key.trim().toLowerCase()] ??
                entry.key.trim().toLowerCase():
            entry.value,
    if (item.ref.isNotEmpty && providerId(item).isNotEmpty)
      providerId(item): item.ref,
  };

  static const _providerAliases = {
    '3isk': '3isk',
    'isk': '3isk',
    'eshq': '3isk',
    'قصة عشق': '3isk',
    'legacy': 'akoam',
    'akoam': 'akoam',
    'akwam': 'akoam',
    'أكوام': 'akoam',
    'اكوام': 'akoam',
    'alooy': 'alooy',
    'alooy tv': 'alooy',
    'alooytv': 'alooy',
    'laroza': 'laroza',
    'larozatv': 'laroza',
    'لاروزا': 'laroza',
  };
}

class _MediaGroup {
  _MediaGroup(this.item, _MediaIdentity identity) : identities = [identity];
  MediaItem item;
  final List<_MediaIdentity> identities;

  bool canMerge(MediaItem incoming, _MediaIdentity identity) {
    // A provider-keyed map cannot retain two distinct references for the same
    // provider. Do not silently discard an alternate work/cut reference.
    for (final entry in incoming.sourceRefs.entries) {
      final current = item.sourceRefs[entry.key];
      if (current != null && current != entry.value) return false;
    }
    // Check every member to prevent transitive merges through incomplete rows.
    return identities.every((existing) => existing.matches(identity));
  }

  void add(MediaItem incoming, _MediaIdentity identity) {
    identities.add(identity);
    final currentVerifiedId = _verifiedImdb(item);
    final incomingVerifiedId = _verifiedImdb(incoming);
    final verifiedId = currentVerifiedId.isNotEmpty
        ? currentVerifiedId
        : incomingVerifiedId;
    item = item.copyWith(
      title: item.title.isNotEmpty ? item.title : incoming.title,
      poster: item.poster.isNotEmpty ? item.poster : incoming.poster,
      year: item.year ?? incoming.year,
      rating: item.rating >= incoming.rating ? item.rating : incoming.rating,
      genres: {...item.genres, ...incoming.genres}.toList(),
      season: item.season ?? incoming.season,
      episode: item.episode ?? incoming.episode,
      audioLanguage: item.audioLanguage.isNotEmpty
          ? item.audioLanguage
          : incoming.audioLanguage,
      edition: item.edition.isNotEmpty ? item.edition : incoming.edition,
      imdbId: verifiedId.isNotEmpty ? verifiedId : item.imdbId,
      identityVerified: verifiedId.isNotEmpty,
      sourceRefs: {...item.sourceRefs, ...incoming.sourceRefs},
    );
  }
}

class _MediaIdentity {
  _MediaIdentity(MediaItem item)
    : title = MediaTaxonomy.normalizeTitle(item.title),
      year = item.year != null && item.year! > 0 ? item.year : null,
      imdb = _verifiedImdb(item),
      kind = _underlyingKind(item),
      scope = _scope(item),
      audio = _knownAudio(item.audioLanguage),
      edition = _knownEdition(item.edition);
  final String title;
  final int? year;
  final String imdb;
  final String kind;
  final String scope;
  final String audio;
  final String edition;

  bool get complete =>
      kind.isNotEmpty &&
      scope.isNotEmpty &&
      audio.isNotEmpty &&
      edition.isNotEmpty;
  Iterable<String> get keys sync* {
    if (!complete) return;
    final compatibility = [kind, scope, audio, edition];
    if (imdb.isNotEmpty) yield jsonEncode([...compatibility, 'imdb', imdb]);
    if (title.isNotEmpty && year != null) {
      yield jsonEncode([...compatibility, 'title-year', title, year]);
    }
  }

  bool matches(_MediaIdentity other) {
    if (!complete ||
        !other.complete ||
        kind != other.kind ||
        scope != other.scope ||
        audio != other.audio ||
        edition != other.edition) {
      return false;
    }
    if (year != null && other.year != null && year != other.year) return false;
    if (imdb.isNotEmpty && other.imdb.isNotEmpty && imdb != other.imdb) {
      return false;
    }
    return imdb.isNotEmpty && imdb == other.imdb ||
        title.isNotEmpty &&
            title == other.title &&
            year != null &&
            year == other.year;
  }
}

String _verifiedImdb(MediaItem item) {
  final id = item.imdbId.trim().toLowerCase();
  return (item.identityVerified || item.workIdentityVerified) &&
          RegExp(r'^tt\d{7,10}$').hasMatch(id)
      ? id
      : '';
}

String _underlyingKind(MediaItem item) {
  final type = _words(item.type);
  if (MediaTaxonomy.classify(item) == 'program') return 'program';
  if (MediaTaxonomy._movieTypes.contains(type)) return 'movie';
  if (MediaTaxonomy._programTypes.contains(type)) return 'program';
  if (MediaTaxonomy._seriesTypes.contains(type)) {
    return MediaTaxonomy.classify(item) == 'program' ? 'program' : 'series';
  }
  // Anime alone describes a category, not whether this is a film or a series.
  return '';
}

String _scope(MediaItem item) {
  final kind = _underlyingKind(item);
  if (kind == 'movie') {
    return item.season == null && item.episode == null ? 'work' : '';
  }
  if (kind != 'series' && kind != 'program') return '';
  if (item.season == null &&
      item.episode == null &&
      !_episodeMarker.hasMatch(_words(item.title)) &&
      !{'episode', 'episodes', 'حلقة', 'حلقات'}.contains(_words(item.type))) {
    return 'work';
  }
  final season = item.season;
  final episode = item.episode;
  return season != null && season > 0 && episode != null && episode > 0
      ? 'season:$season/episode:$episode'
      : '';
}

String _knownAudio(String value) {
  final trimmed = value.trim().toLowerCase().replaceAll('_', '-');
  const aliases = {
    'ara': 'ar',
    'arabic': 'ar',
    'العربية': 'ar',
    'عربي': 'ar',
    'eng': 'en',
    'english': 'en',
    'الإنجليزية': 'en',
    'انجليزي': 'en',
    'tur': 'tr',
    'turkish': 'tr',
    'التركية': 'tr',
    'تركي': 'tr',
    'jpn': 'ja',
    'japanese': 'ja',
    'اليابانية': 'ja',
    'kor': 'ko',
    'korean': 'ko',
    'الكورية': 'ko',
    'fra': 'fr',
    'fre': 'fr',
    'french': 'fr',
    'spa': 'es',
    'spanish': 'es',
    'deu': 'de',
    'ger': 'de',
    'hin': 'hi',
    'rus': 'ru',
    'zho': 'zh',
    'chi': 'zh',
    'por': 'pt',
    'ita': 'it',
    'fas': 'fa',
    'per': 'fa',
    'urd': 'ur',
    'ben': 'bn',
    'nld': 'nl',
    'dut': 'nl',
    'ind': 'id',
    'tha': 'th',
    'vie': 'vi',
    'pol': 'pl',
    'swe': 'sv',
    'nor': 'no',
    'dan': 'da',
    'fin': 'fi',
    'heb': 'he',
    'ell': 'el',
    'gre': 'el',
    'ron': 'ro',
    'rum': 'ro',
    'hun': 'hu',
    'ces': 'cs',
    'cze': 'cs',
    'الانجليزية': 'en',
    'انجليزية': 'en',
    'العربيه': 'ar',
  };
  if (aliases.containsKey(trimmed)) return aliases[trimmed]!;
  if ({
    'und',
    'unk',
    'unknown',
    'original',
    'dubbed',
    'subbed',
  }.contains(trimmed)) {
    return '';
  }
  const knownCodes = {
    'ar',
    'en',
    'tr',
    'ja',
    'ko',
    'fr',
    'es',
    'de',
    'hi',
    'ru',
    'zh',
    'pt',
    'it',
    'fa',
    'ur',
    'bn',
    'nl',
    'id',
    'th',
    'vi',
    'pl',
    'sv',
    'no',
    'da',
    'fi',
    'he',
    'el',
    'ro',
    'hu',
    'cs',
    'uk',
    'ms',
    'ta',
    'te',
    'ml',
    'kn',
    'pa',
    'gu',
    'mr',
    'ne',
    'si',
    'fil',
    'tl',
    'sw',
  };
  return knownCodes.contains(trimmed.split('-').first) &&
          RegExp(r'^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$').hasMatch(trimmed)
      ? trimmed
      : '';
}

String _knownEdition(String value) {
  final edition = _words(value);
  if ({
    '',
    'unknown',
    'unk',
    'unspecified',
    'null',
    'none',
    'undefined',
    'n a',
    'غير معروف',
    'غير محدد',
    'source original',
  }.contains(edition)) {
    return '';
  }
  return edition;
}
