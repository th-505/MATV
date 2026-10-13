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
  });
  final String id;
  final String title;
  final String poster;
  final String type;
  final String ref;
  final int? year;
  final double rating;
  final String source;

  factory MediaItem.fromJson(Map<String, dynamic> json) => CatalogItem(
        id: '${json['id'] ?? ''}',
        title: '${json['title'] ?? 'بدون عنوان'}',
        poster: '${json['poster'] ?? json['img'] ?? json['image'] ?? ''}',
        type: '${json['type'] ?? 'series'}',
        ref: '${json['ref'] ?? ''}',
        year: int.tryParse('${json['year'] ?? ''}'),
        rating: (json['rating'] as num?)?.toDouble() ?? 0,
        source: '${json['source'] ?? 'mitv'}',
      );
}

class EpisodeItem {
  const EpisodeItem({
    required this.id,
    required this.number,
    required this.title,
    required this.ref,
    required this.watchAvailable,
  });

  final String id;
  final int number;
  final String title;
  final String ref;
  final bool watchAvailable;

  factory EpisodeItem.fromJson(Map<String, dynamic> json) {
    final parsedNumber = int.tryParse(
        '${json['episode_number'] ?? json['num'] ?? json['number'] ?? ''}');
    return EpisodeItem(
      id: '${json['episode_id'] ?? json['id'] ?? ''}',
      number: parsedNumber == null || parsedNumber < 1 ? 1 : parsedNumber,
      title: '${json['title'] ?? json['name'] ?? ''}',
      ref: '${json['ref'] ?? json['link'] ?? json['href'] ?? ''}',
      watchAvailable: json['watch_available'] != false,
    );
  }
}

typedef PlaybackSource = StreamSource;

class StreamSource {
  const StreamSource(
      {required this.mediaPath,
      required this.mediaType,
      this.playbackMode = '',
      this.headers = const {},
      this.label = 'تلقائي',
      this.priority = 0,
      this.latencyMs,
      this.provider = '',
      this.expiresAt,
      this.resolution});
  final String mediaPath;
  final String mediaType;
  final String label;
  final String playbackMode;
  final Map<String, String> headers;
  final int priority;
  final int? latencyMs;
  final ResolutionOption? resolution;
  final String provider;
  final DateTime? expiresAt;
  String get displayLabel => provider.isEmpty ? label : '$provider • $label';
  factory StreamSource.fromJson(Map<String, dynamic> json) => PlaybackSource(
      provider: '${json['provider'] ?? ''}',
      expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}'),
      priority: int.tryParse('${json['priority'] ?? 0}') ?? 0,
      latencyMs: int.tryParse('${json['latency_ms'] ?? ''}'),
      resolution: ResolutionOption.fromLabel('${json['label'] ?? ''}'),
      mediaPath: '${json['url'] ?? json['media_path'] ?? ''}',
      mediaType:
          '${json['format'] == 'hls' ? 'm3u8' : json['format'] == 'dash' ? 'mpd' : json['format'] == 'matroska' ? 'mkv' : json['format'] ?? json['media_type'] ?? ''}',
      label: '${json['quality'] ?? json['label'] ?? 'تلقائي'}',
      playbackMode: '${json['playback_mode'] ?? ''}',
      headers: Map.unmodifiable({
        for (final key in ['Referer', 'User-Agent', 'Origin'])
          if (json['headers'] is Map &&
              json['headers'][key] is String &&
              !(json['headers'][key] as String).contains(RegExp(r'[\r\n]')))
            key: json['headers'][key] as String
      }));
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
  });

  final String title;
  final String poster;
  final List<EpisodeItem> episodes;
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
              !(json['resolver_headers'][key] as String)
                  .contains(RegExp(r'[\r\n]')))
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
    );
  }
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
    final team1 = (json['team1'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    final team2 = (json['team2'] as Map?)?.cast<String, dynamic>() ??
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
    final ended =
        RegExp(r'ended|finished|انته', caseSensitive: false).hasMatch(status);
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
  const MatchServer(
      {required this.ref, required this.name, required this.type});
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
  const MatchPlayback(
      {required this.mediaPath,
      required this.mediaType,
      required this.serverName,
      this.playbackMode = 'proxy',
      this.headers = const {},
      this.expiresAt});
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
  const NewsItem(
      {required this.id,
      required this.ref,
      required this.title,
      required this.date,
      required this.description});
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
  const NewsArticle(
      {required this.ref,
      required this.title,
      required this.date,
      required this.paragraphs});
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
  const RuntimeEnvelope(
      {required this.version, required this.kind, required this.data});
  final String version;
  final String kind;
  final T data;
}

class ResolutionOption {
  const ResolutionOption({required this.label, this.height});
  final String label;
  final int? height;
  static ResolutionOption? fromLabel(String label) {
    final height =
        int.tryParse(RegExp(r'(\d{3,4})p').firstMatch(label)?.group(1) ?? '');
    return label.isEmpty
        ? null
        : ResolutionOption(label: label, height: height);
  }
}
