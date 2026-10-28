typedef CatalogItem = MediaItem;

class MediaItem {
  const MediaItem({
    required this.id,
    required this.title,
    required this.poster,
    required this.type,
    required this.ref,
    this.year,
    this.rating = 0,
    this.source = 'mitv',
    this.genres = const [],
    this.season,
    this.episode,
    this.audioLanguage = '',
    this.edition = '',
    this.imdbId = '',
    this.identityVerified = false,
    this.workIdentityVerified = false,
    this.sourceRefs = const {},
  });
  final String id;
  final String title;
  final String poster;
  final String type;
  final String ref;
  final int? year;
  final double rating;
  final String source;
  final List<String> genres;
  final int? season;
  final int? episode;
  final String audioLanguage;
  final String edition;
  final String imdbId;
  final bool identityVerified;
  final bool workIdentityVerified;
  final Map<String, String> sourceRefs;

  MediaItem copyWith({
    String? id,
    String? title,
    String? poster,
    String? type,
    String? ref,
    int? year,
    double? rating,
    String? source,
    List<String>? genres,
    int? season,
    int? episode,
    String? audioLanguage,
    String? edition,
    String? imdbId,
    bool? identityVerified,
    bool? workIdentityVerified,
    Map<String, String>? sourceRefs,
  }) => MediaItem(
    id: id ?? this.id,
    title: title ?? this.title,
    poster: poster ?? this.poster,
    type: type ?? this.type,
    ref: ref ?? this.ref,
    year: year ?? this.year,
    rating: rating ?? this.rating,
    source: source ?? this.source,
    genres: List.unmodifiable(genres ?? this.genres),
    season: season ?? this.season,
    episode: episode ?? this.episode,
    audioLanguage: audioLanguage ?? this.audioLanguage,
    edition: edition ?? this.edition,
    imdbId: imdbId ?? this.imdbId,
    identityVerified: identityVerified ?? this.identityVerified,
    workIdentityVerified: workIdentityVerified ?? this.workIdentityVerified,
    sourceRefs: Map.unmodifiable(sourceRefs ?? this.sourceRefs),
  );

  /// Persist only descriptive identity and provider references. Resolved media
  /// URLs, request headers and expiring tokens are not part of this model.
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'poster': poster,
    'type': type,
    'ref': ref,
    'year': year,
    'rating': rating,
    'source': source,
    'genres': genres,
    if (season != null) 'season_number': season,
    if (episode != null) 'episode_number': episode,
    if (audioLanguage.isNotEmpty) 'audio_language': audioLanguage,
    if (edition.isNotEmpty) 'edition': edition,
    if (imdbId.isNotEmpty) 'imdb_id': imdbId,
    'identity_verified': identityVerified,
    'work_identity_verified': workIdentityVerified,
    if (sourceRefs.isNotEmpty) 'source_refs': sourceRefs,
  };

  factory MediaItem.fromJson(Map<String, dynamic> json) => CatalogItem(
    id: '${json['id'] ?? ''}',
    title: '${json['title'] ?? 'بدون عنوان'}',
    poster: '${json['poster'] ?? json['img'] ?? json['image'] ?? ''}',
    type: '${json['type'] ?? 'series'}',
    ref: '${json['ref'] ?? ''}',
    year: int.tryParse('${json['year'] ?? ''}'),
    rating: (json['rating'] as num?)?.toDouble() ?? 0,
    source: '${json['source'] ?? 'mitv'}',
    genres: _descriptiveGenres(json),
    season: _positiveIdentityNumber(json['season_number'] ?? json['season']),
    episode: _positiveIdentityNumber(json['episode_number'] ?? json['episode']),
    audioLanguage: '${json['audio_language'] ?? ''}',
    edition: '${json['edition'] ?? ''}',
    imdbId: '${json['imdb_id'] ?? ''}',
    identityVerified: json['identity_verified'] == true,
    workIdentityVerified: json['work_identity_verified'] == true,
    sourceRefs: _sourceReferenceMap(json['source_refs']),
  );
}

class EpisodeItem {
  const EpisodeItem({
    required this.id,
    required this.number,
    required this.title,
    required this.ref,
    required this.watchAvailable,
    this.season,
    this.hasEpisodeNumber = true,
  });

  final String id;
  final int number;
  final String title;
  final String ref;
  final bool watchAvailable;
  final int? season;
  final bool hasEpisodeNumber;

  factory EpisodeItem.fromJson(Map<String, dynamic> json) {
    final parsedNumber = int.tryParse(
      '${json['episode_number'] ?? json['num'] ?? json['number'] ?? ''}',
    );
    return EpisodeItem(
      id: '${json['episode_id'] ?? json['id'] ?? ''}',
      number: parsedNumber == null || parsedNumber < 1 ? 1 : parsedNumber,
      title: '${json['title'] ?? json['name'] ?? ''}',
      ref: '${json['ref'] ?? json['link'] ?? json['href'] ?? ''}',
      watchAvailable: json['watch_available'] != false,
      hasEpisodeNumber: parsedNumber != null && parsedNumber > 0,
      season: _positiveIdentityNumber(json['season_number'] ?? json['season']),
    );
  }
}

typedef PlaybackSource = StreamSource;

bool isPublicSubtitleUri(Uri uri) =>
    uri.scheme == 'https' &&
    !uri.hasPort &&
    uri.userInfo.isEmpty &&
    !uri.hasFragment &&
    uri.toString().length <= 4096 &&
    RegExp(r'^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$').hasMatch(uri.host) &&
    !RegExp(r'^[\d.]+$').hasMatch(uri.host) &&
    !uri.host.endsWith('.localhost') &&
    !uri.host.endsWith('.local') &&
    !uri.host.endsWith('.internal');

class SubtitleDescriptor {
  const SubtitleDescriptor({
    required this.id,
    required this.url,
    required this.format,
    this.label = 'ترجمة',
    this.language = 'und',
    this.provider = '',
    this.origin = 'attached',
    this.headers = const {},
    this.encodingHint,
  });
  final String id, url, format, label, language, provider, origin;
  final Map<String, String> headers;
  final String? encodingHint;
  factory SubtitleDescriptor.fromJson(Map<String, dynamic> json) {
    final raw = '${json['url'] ?? ''}', uri = Uri.tryParse(raw);
    final format = '${json['format'] ?? ''}'.toLowerCase();
    if (uri == null ||
        !isPublicSubtitleUri(uri) ||
        !['srt', 'vtt', 'ass'].contains(format) ||
        !['subtitles', 'captions'].contains('${json['kind'] ?? 'subtitles'}')) {
      throw const FormatException('INVALID_SUBTITLE_DESCRIPTOR');
    }
    return SubtitleDescriptor(
      id: '${json['id'] ?? raw}'.substring(
        0,
        '${json['id'] ?? raw}'.length.clamp(0, 4096),
      ),
      url: raw,
      format: format,
      label: '${json['label'] ?? 'ترجمة'}'.substring(
        0,
        '${json['label'] ?? 'ترجمة'}'.length.clamp(0, 120),
      ),
      language: '${json['language'] ?? 'und'}'.substring(
        0,
        '${json['language'] ?? 'und'}'.length.clamp(0, 12),
      ),
      provider: '${json['provider'] ?? ''}',
      origin: '${json['origin'] ?? 'attached'}',
      encodingHint: json['encoding_hint'] is String
          ? json['encoding_hint']
          : null,
      headers: Map.unmodifiable({
        for (final key in ['Referer', 'Origin', 'User-Agent'])
          if (json['headers'] is Map &&
              json['headers'][key] is String &&
              (json['headers'][key] as String).length <= 2048 &&
              !(json['headers'][key] as String).contains(RegExp(r'[\r\n]')))
            key: json['headers'][key] as String,
      }),
    );
  }
}

List<SubtitleDescriptor> subtitleDescriptorsFromJson(dynamic raw) {
  final out = <SubtitleDescriptor>[];
  if (raw is! List) return out;
  for (final value in raw.whereType<Map>().take(8)) {
    try {
      out.add(SubtitleDescriptor.fromJson(value.cast<String, dynamic>()));
    } catch (_) {
      /* Malformed optional captions never break playback. */
    }
  }
  return List.unmodifiable(out);
}

class StreamSource {
  const StreamSource({
    required this.mediaPath,
    required this.mediaType,
    this.playbackMode = '',
    this.headers = const {},
    this.label = 'تلقائي',
    this.priority = 0,
    this.latencyMs,
    this.provider = '',
    this.providerId = '',
    this.edition = '',
    this.timelineVerified = false,
    this.timelineOffsetMs,
    this.sourceRef = '',
    this.attachedSubtitles = const [],
    this.expiresAt,
    this.resolution,
  });
  final String mediaPath;
  final String mediaType;
  final String label;
  final String playbackMode;
  final Map<String, String> headers;
  final int priority;
  final int? latencyMs;
  final ResolutionOption? resolution;
  final String provider;
  final String providerId;
  final String edition;
  final bool timelineVerified;
  final int? timelineOffsetMs;
  final String sourceRef;
  final List<SubtitleDescriptor> attachedSubtitles;
  final DateTime? expiresAt;
  String get displayLabel => provider.isEmpty ? label : '$provider • $label';
  factory StreamSource.fromJson(Map<String, dynamic> json) => PlaybackSource(
    provider: '${json['provider'] ?? ''}',
    providerId: '${json['provider_id'] ?? ''}',
    edition: '${json['edition'] ?? ''}',
    timelineVerified: json['timeline_verified'] == true,
    timelineOffsetMs: int.tryParse('${json['timeline_offset_ms'] ?? ''}'),
    sourceRef: '${json['source_ref'] ?? ''}',
    attachedSubtitles: subtitleDescriptorsFromJson(json['subtitles']),
    expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}'),
    priority: int.tryParse('${json['priority'] ?? 0}') ?? 0,
    latencyMs: int.tryParse('${json['latency_ms'] ?? ''}'),
    resolution: ResolutionOption.fromLabel('${json['label'] ?? ''}'),
    mediaPath: '${json['url'] ?? json['media_path'] ?? ''}',
    mediaType:
        '${json['format'] == 'hls'
            ? 'm3u8'
            : json['format'] == 'dash'
            ? 'mpd'
            : json['format'] == 'matroska'
            ? 'mkv'
            : json['format'] ?? json['media_type'] ?? ''}',
    label: '${json['quality'] ?? json['label'] ?? 'تلقائي'}',
    playbackMode: '${json['playback_mode'] ?? ''}',
    headers: Map.unmodifiable({
      for (final key in ['Referer', 'User-Agent', 'Origin'])
        if (json['headers'] is Map &&
            json['headers'][key] is String &&
            !(json['headers'][key] as String).contains(RegExp(r'[\r\n]')))
          key: json['headers'][key] as String,
    }),
  );
}

class TitleDetails {
  const TitleDetails({
    required this.title,
    required this.poster,
    required this.episodes,
    required this.mediaPath,
    required this.mediaType,
    required this.playbackUnavailable,
    required this.playbackReason,
    this.mediaSources = const [],
    this.playbackMode = 'proxy',
    this.playbackHeaders = const {},
    this.resolverUrl = '',
    this.resolverHeaders = const {},
    this.expiresAt,
    this.downloadAvailable = true,
    this.year,
    this.plot = '',
    this.cast = const [],
    this.directors = const [],
    this.genres = const [],
    this.season,
    this.episode,
    this.audioLanguage = '',
    this.edition = '',
    this.imdbId = '',
    this.identityVerified = false,
    this.workIdentityVerified = false,
    this.attachedSubtitles = const [],
    this.sourceRefs = const {},
    this.availableSeasons = const [],
    this.sourceIndexAuthoritative = false,
    this.sourceEdition = 'unknown',
    this.sourceProvider = '',
    this.sourceWorkRef = '',
    this.episodeNextOffset,
  });

  final String title;
  final String poster;
  final List<EpisodeItem> episodes;
  final List<int> availableSeasons;
  final bool sourceIndexAuthoritative;
  final String sourceEdition;
  final String sourceProvider;
  final String sourceWorkRef;
  final int? episodeNextOffset;
  final String mediaPath;
  final String mediaType;
  final bool playbackUnavailable;
  final String playbackReason;
  final String playbackMode;
  final Map<String, String> playbackHeaders;
  final List<PlaybackSource> mediaSources;
  final String resolverUrl;
  final Map<String, String> resolverHeaders;
  final DateTime? expiresAt;
  final bool downloadAvailable;
  final int? year;
  final String plot;
  final List<Map<String, dynamic>> cast;
  final List<String> directors;
  final List<String> genres;
  final int? season;
  final int? episode;
  final String audioLanguage;
  final String edition;
  final String imdbId;
  final bool identityVerified;
  final bool workIdentityVerified;
  final List<SubtitleDescriptor> attachedSubtitles;
  final Map<String, String> sourceRefs;

  TitleDetails copyWith({
    String? title,
    String? poster,
    List<EpisodeItem>? episodes,
    List<int>? availableSeasons,
    bool? sourceIndexAuthoritative,
    String? sourceEdition,
    String? sourceProvider,
    String? sourceWorkRef,
    int? episodeNextOffset,
    bool clearEpisodePagination = false,
    String? mediaPath,
    String? mediaType,
    bool? playbackUnavailable,
    String? playbackReason,
    String? playbackMode,
    Map<String, String>? playbackHeaders,
    List<PlaybackSource>? mediaSources,
    String? resolverUrl,
    Map<String, String>? resolverHeaders,
    DateTime? expiresAt,
    bool? downloadAvailable,
    int? year,
    String? plot,
    List<Map<String, dynamic>>? cast,
    List<String>? directors,
    List<String>? genres,
    int? season,
    int? episode,
    String? audioLanguage,
    String? edition,
    String? imdbId,
    bool? identityVerified,
    bool? workIdentityVerified,
    List<SubtitleDescriptor>? attachedSubtitles,
    Map<String, String>? sourceRefs,
  }) => TitleDetails(
    title: title ?? this.title,
    poster: poster ?? this.poster,
    sourceIndexAuthoritative:
        sourceIndexAuthoritative ?? this.sourceIndexAuthoritative,
    sourceEdition: sourceEdition ?? this.sourceEdition,
    sourceProvider: sourceProvider ?? this.sourceProvider,
    sourceWorkRef: sourceWorkRef ?? this.sourceWorkRef,
    episodeNextOffset: clearEpisodePagination
        ? null
        : episodeNextOffset ?? this.episodeNextOffset,
    episodes: List.unmodifiable(episodes ?? this.episodes),
    availableSeasons: List.unmodifiable(
      availableSeasons ?? this.availableSeasons,
    ),
    mediaPath: mediaPath ?? this.mediaPath,
    mediaType: mediaType ?? this.mediaType,
    playbackUnavailable: playbackUnavailable ?? this.playbackUnavailable,
    playbackReason: playbackReason ?? this.playbackReason,
    playbackMode: playbackMode ?? this.playbackMode,
    playbackHeaders: Map.unmodifiable(playbackHeaders ?? this.playbackHeaders),
    mediaSources: List.unmodifiable(mediaSources ?? this.mediaSources),
    resolverUrl: resolverUrl ?? this.resolverUrl,
    resolverHeaders: Map.unmodifiable(resolverHeaders ?? this.resolverHeaders),
    expiresAt: expiresAt ?? this.expiresAt,
    downloadAvailable: downloadAvailable ?? this.downloadAvailable,
    year: year ?? this.year,
    plot: plot ?? this.plot,
    cast: List.unmodifiable(cast ?? this.cast),
    directors: List.unmodifiable(directors ?? this.directors),
    genres: List.unmodifiable(genres ?? this.genres),
    season: season ?? this.season,
    episode: episode ?? this.episode,
    audioLanguage: audioLanguage ?? this.audioLanguage,
    edition: edition ?? this.edition,
    imdbId: imdbId ?? this.imdbId,
    identityVerified: identityVerified ?? this.identityVerified,
    workIdentityVerified: workIdentityVerified ?? this.workIdentityVerified,
    attachedSubtitles: List.unmodifiable(
      attachedSubtitles ?? this.attachedSubtitles,
    ),
    sourceRefs: Map.unmodifiable(sourceRefs ?? this.sourceRefs),
  );

  bool get hasEpisodes => episodes.isNotEmpty;
  bool get hasDirectMedia => mediaPath.isNotEmpty;
  bool get needsClientResolution =>
      playbackMode == 'client_resolve' && resolverUrl.isNotEmpty;
  bool get canPlay => hasDirectMedia || needsClientResolution;

  factory TitleDetails.fromJson(Map<String, dynamic> json) {
    final rawEpisodes = json['episodes'];
    final episodes = rawEpisodes is List
        ? rawEpisodes
              .whereType<Map>()
              .map((item) => EpisodeItem.fromJson(item.cast<String, dynamic>()))
              .toList(growable: false)
        : const <EpisodeItem>[];
    return TitleDetails(
      sourceIndexAuthoritative: json['source_index_authoritative'] == true,
      sourceEdition: '${json['source_edition'] ?? 'unknown'}',
      sourceProvider: '${json['provider'] ?? ''}',
      sourceWorkRef:
          RegExp(r'^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$')
              .hasMatch('${json['ref'] ?? ''}')
          ? '${json['ref']}'
          : '',
      episodeNextOffset:
          json['episode_pagination'] is Map &&
              json['episode_pagination']['has_more'] == true
          ? int.tryParse('${json['episode_pagination']['next_offset']}')
          : null,
      availableSeasons: (json['available_seasons'] is List
          ? (json['available_seasons'] as List)
                .whereType<int>()
                .where((n) => n > 0)
                .toList()
          : const []),
      title: '${json['movie_title'] ?? json['title'] ?? 'التفاصيل'}',
      poster: '${json['poster'] ?? ''}',
      episodes: episodes,
      mediaPath:
          '${json['playback_mode'] == 'direct' ? (json['stream_url'] ?? json['media_url'] ?? json['media_path'] ?? '') : (json['media_path'] ?? '')}',
      mediaType: '${json['media_type'] ?? ''}',
      playbackUnavailable: json['playback_unavailable'] == true,
      playbackReason: '${json['playback_reason'] ?? ''}',
      mediaSources: (json['media_sources'] is List
          ? (json['media_sources'] as List)
                .whereType<Map>()
                .map((e) => PlaybackSource.fromJson(e.cast<String, dynamic>()))
                .where((e) => e.mediaPath.isNotEmpty)
                .take(8)
                .toList(growable: false)
          : const []),
      playbackMode: '${json['playback_mode'] ?? 'proxy'}',
      resolverUrl: '${json['iframe_url'] ?? json['resolver_url'] ?? ''}',
      resolverHeaders: Map.unmodifiable({
        for (final key in const ['Referer', 'User-Agent', 'Origin'])
          if (json['resolver_headers'] is Map &&
              json['resolver_headers'][key] is String &&
              !(json['resolver_headers'][key] as String).contains(
                RegExp(r'[\r\n]'),
              ))
            key: json['resolver_headers'][key] as String,
      }),
      playbackHeaders: Map.unmodifiable({
        for (final key in const ['Referer', 'User-Agent', 'Origin'])
          if ((json['headers'] ?? json['playback_headers']) is Map &&
              (json['headers'] ?? json['playback_headers'])[key] is String &&
              !((json['headers'] ?? json['playback_headers'])[key] as String)
                  .contains(RegExp(r'[\r\n]')))
            key: (json['headers'] ?? json['playback_headers'])[key] as String,
      }),
      expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}'),
      downloadAvailable: json['download_available'] != false,
      year: int.tryParse('${json['year'] ?? ''}'),
      plot:
          '${json['plot'] ?? json['overview'] ?? json['description'] ?? json['story'] ?? ''}',
      cast: json['cast'] is List
          ? (json['cast'] as List)
                .whereType<Map>()
                .map(
                  (row) => Map<String, dynamic>.unmodifiable(
                    row.cast<String, dynamic>(),
                  ),
                )
                .toList(growable: false)
          : const [],
      directors: json['directors'] is List
          ? (json['directors'] as List).whereType<String>().toList(
              growable: false,
            )
          : const [],
      genres: _descriptiveGenres(json),
      season: _positiveIdentityNumber(json['season_number'] ?? json['season']),
      episode: _positiveIdentityNumber(
        json['episode_number'] ?? json['episode'],
      ),
      audioLanguage: '${json['audio_language'] ?? ''}',
      edition: '${json['edition'] ?? ''}',
      imdbId: '${json['imdb_id'] ?? ''}',
      identityVerified: json['identity_verified'] == true,
      workIdentityVerified: json['work_identity_verified'] == true,
      attachedSubtitles: subtitleDescriptorsFromJson(json['subtitles']),
      sourceRefs: _sourceReferenceMap(json['source_refs']),
    );
  }
}

int? _positiveIdentityNumber(dynamic raw) {
  final value = int.tryParse('$raw');
  return value != null && value > 0 ? value : null;
}

List<String> _descriptiveGenres(Map<String, dynamic> json) => List.unmodifiable(
  {..._genreList(json['genres']), ..._genreList(json['category'])},
);

List<String> _genreList(dynamic raw) {
  final values = raw is List
      ? raw.map((item) => item is Map ? item['name'] ?? '' : item)
      : raw is String
      ? raw.split(RegExp(r'[,،|/]'))
      : const <dynamic>[];
  return List.unmodifiable(
    values
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toSet(),
  );
}

Map<String, String> _sourceReferenceMap(dynamic raw) {
  if (raw is! Map) return const {};
  return Map.unmodifiable({
    for (final entry in raw.entries.take(16))
      if (entry.key is String &&
          entry.value is String &&
          (entry.key as String).isNotEmpty &&
          (entry.value as String).isNotEmpty)
        entry.key as String: entry.value as String,
  });
}

int? _nullableScore(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  if (text.isEmpty) return null;
  return int.tryParse(text);
}

int? _firstScore(Iterable<dynamic> values) {
  for (final value in values) {
    final score = _nullableScore(value);
    if (score != null) return score < 0 ? 0 : score;
  }
  return null;
}

class MatchItem {
  const MatchItem({
    required this.home,
    required this.away,
    required this.time,
    required this.status,
    required this.ref,
    this.homeLogo = '',
    this.awayLogo = '',
    this.homeGoals,
    this.awayGoals,
    this.competition = '',
  });
  final String home;
  final String away;
  final String time;
  final String status;
  final String ref;
  final String homeLogo;
  final String awayLogo;
  final int? homeGoals;
  final int? awayGoals;
  final String competition;

  bool get hasScore => homeGoals != null && awayGoals != null;

  factory MatchItem.fromJson(Map<String, dynamic> json) {
    final team1 =
        (json['team1'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    final team2 =
        (json['team2'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    final homeTopLevel = _firstScore([
      json['home_score'],
      json['homeScore'],
      json['team1_goals'],
      json['team1Goals'],
      json['score1'],
    ]);
    final awayTopLevel = _firstScore([
      json['away_score'],
      json['awayScore'],
      json['team2_goals'],
      json['team2Goals'],
      json['score2'],
    ]);
    var homeGoals =
        homeTopLevel ?? _firstScore([team1['goals'], team1['score']]);
    var awayGoals =
        awayTopLevel ?? _firstScore([team2['goals'], team2['score']]);
    final status = '${json['status'] ?? 'scheduled'}';
    final ended = RegExp(
      r'ended|finished|انته',
      caseSensitive: false,
    ).hasMatch(status);
    final hasAuthoritativeTopLevelScore =
        homeTopLevel != null || awayTopLevel != null;
    if (ended &&
        !hasAuthoritativeTopLevelScore &&
        homeGoals == 0 &&
        awayGoals == 0) {
      homeGoals = null;
      awayGoals = null;
    }
    return MatchItem(
      home: '${team1['name'] ?? ''}',
      away: '${team2['name'] ?? ''}',
      time: '${json['time'] ?? ''}',
      status: status,
      ref: '${json['ref'] ?? ''}',
      homeLogo: '${team1['logo'] ?? team1['image'] ?? team1['img'] ?? ''}',
      awayLogo: '${team2['logo'] ?? team2['image'] ?? team2['img'] ?? ''}',
      homeGoals: homeGoals,
      awayGoals: awayGoals,
      competition: '${json['competition'] ?? json['league'] ?? ''}',
    );
  }
}

class MatchServer {
  const MatchServer({
    required this.ref,
    required this.name,
    required this.type,
  });
  final String ref;
  final String name;
  final String type;

  factory MatchServer.fromJson(Map<String, dynamic> json) => MatchServer(
    ref: '${json['ref'] ?? ''}',
    name: '${json['name'] ?? 'سيرفر'}',
    type: '${json['type'] ?? 'auto'}',
  );
}

class MatchPlayback {
  const MatchPlayback({
    required this.mediaPath,
    required this.mediaType,
    required this.serverName,
    this.playbackMode = 'proxy',
    this.headers = const {},
    this.expiresAt,
  });
  final String mediaPath;
  final String mediaType;
  final String serverName;
  final String playbackMode;
  final Map<String, String> headers;
  final DateTime? expiresAt;

  factory MatchPlayback.fromJson(Map<String, dynamic> json) => MatchPlayback(
    mediaPath: '${json['media_path'] ?? ''}',
    mediaType: '${json['media_type'] ?? 'stream'}',
    serverName: '${json['server_name'] ?? 'سيرفر'}',
    playbackMode: '${json['playback_mode'] ?? 'proxy'}',
    headers: StreamSource.fromJson(json).headers,
    expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}'),
  );
}

class NewsItem {
  const NewsItem({
    required this.id,
    required this.ref,
    required this.title,
    required this.date,
    required this.description,
  });
  final String id;
  final String ref;
  final String title;
  final String date;
  final String description;

  factory NewsItem.fromJson(Map<String, dynamic> json) => NewsItem(
    id: '${json['id'] ?? ''}',
    ref: '${json['ref'] ?? ''}',
    title: '${json['title'] ?? 'بدون عنوان'}',
    date: '${json['date'] ?? ''}',
    description: '${json['description'] ?? ''}',
  );
}

class NewsArticle {
  const NewsArticle({
    required this.ref,
    required this.title,
    required this.date,
    required this.paragraphs,
  });
  final String ref;
  final String title;
  final String date;
  final List<String> paragraphs;

  factory NewsArticle.fromJson(Map<String, dynamic> json) {
    final raw = json['paragraphs'];
    return NewsArticle(
      ref: '${json['ref'] ?? ''}',
      title: '${json['title'] ?? ''}',
      date: '${json['date'] ?? ''}',
      paragraphs: raw is List
          ? raw
                .map((e) => '$e')
                .where((e) => e.trim().isNotEmpty)
                .toList(growable: false)
          : const [],
    );
  }
}

class RuntimeEnvelope<T> {
  const RuntimeEnvelope({
    required this.version,
    required this.kind,
    required this.data,
  });
  final String version;
  final String kind;
  final T data;
}

class ResolutionOption {
  const ResolutionOption({required this.label, this.height});
  final String label;
  final int? height;
  static ResolutionOption? fromLabel(String label) {
    final height = int.tryParse(
      RegExp(r'(\d{3,4})p').firstMatch(label)?.group(1) ?? '',
    );
    return label.isEmpty
        ? null
        : ResolutionOption(label: label, height: height);
  }
}
