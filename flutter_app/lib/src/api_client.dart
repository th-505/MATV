import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';
import 'media_repository.dart';
import 'miravd_resolver.dart';
import 'alooy_policy.dart';

class AlQahtaniApi implements MediaRepository {
  final sourceRouter = SourceRouter();
  AlQahtaniApi({http.Client? client, Uri? baseUri, Uri? edgeUri, bool? useEdge})
      : _client = client ?? http.Client(),
        _useEdge = useEdge ?? (edgeUri != null || client == null),
        _edgeUri = edgeUri ??
            Uri.parse(const String.fromEnvironment('MATV_EDGE_BASE',
                defaultValue:
                    'https://matv-edge-resolver.dada1000100.workers.dev')),
        _baseUri = baseUri ??
            Uri.parse(const String.fromEnvironment('MATV_API_BASE',
                defaultValue: 'https://matv.onrender.com'));

  final http.Client _client;
  final Uri _baseUri;
  final Uri _edgeUri;
  final bool _useEdge;
  final _edgeStreams = <String, DateTime>{};
  final _metadata = <String, ({DateTime expires, TitleDetails details})>{};
  final _metadataPending = <String, Future<void>>{};
  TitleDetails? cachedMetadata(String ref) {
    final row = _metadata[ref];
    if (row == null || row.expires.isBefore(DateTime.now())) return null;
    return row.details;
  }

  @override
  Future<void> prefetchMetadata(String ref) {
    if (cachedMetadata(ref) != null || _metadataPending.length >= 2) {
      return Future.value();
    }
    return _metadataPending.putIfAbsent(ref, () async {
      try {
        final json = await _getJson(
            '/api/cinema/metadata', {'ref': ref}, const Duration(seconds: 12));
        _metadata[ref] = (
          expires: DateTime.now().add(const Duration(minutes: 2)),
          details: TitleDetails.fromJson(json)
        );
        if (_metadata.length > 64) _metadata.remove(_metadata.keys.first);
      } catch (_) {
        /* Optional browsing prefetch must not interrupt navigation. */
      } finally {
        _metadataPending.remove(ref);
      }
    });
  }

  MatchItem _matchItem(Map<String, dynamic> json) {
    final item = MatchItem.fromJson(json);
    String proxyLogo(String raw) {
      final value = raw.trim();
      if (value.isEmpty) return '';
      if (value.startsWith('/')) return _baseUri.resolve(value).toString();
      final parsed = Uri.tryParse(value);
      if (parsed == null || parsed.scheme != 'https') return '';
      return _baseUri.replace(
          path: '/api/matches/logo',
          queryParameters: {'url': value}).toString();
    }

    return MatchItem(
      home: item.home,
      away: item.away,
      time: item.time,
      status: item.status,
      ref: item.ref,
      homeLogo: proxyLogo(item.homeLogo),
      awayLogo: proxyLogo(item.awayLogo),
      homeGoals: item.homeGoals,
      awayGoals: item.awayGoals,
      competition: item.competition,
    );
  }

  Future<List<MatchItem>> matches() async {
    final json = await _getJson('/api/v1/matches');
    return _list(json['data']).map(_matchItem).toList(growable: false);
  }

  Future<List<MatchServer>> matchServers(String ref) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_MATCH_REFERENCE');
    final json = await _getJson('/api/v1/matches/servers', {'ref': ref});
    return _list(json['data'])
        .map(MatchServer.fromJson)
        .where((server) => server.ref.isNotEmpty)
        .toList(growable: false);
  }

  Future<MatchPlayback> resolveMatchPlayback(String serverRef) async {
    if (serverRef.trim().isEmpty) {
      throw const ApiException('MISSING_MATCH_SERVER_REFERENCE');
    }
    final json = await _getJson('/api/v1/matches/playback', {'ref': serverRef});
    final data = json['data'];
    if (data is! Map) throw const ApiException('INVALID_MATCH_PLAYBACK');
    final playback = MatchPlayback.fromJson(data.cast<String, dynamic>());
    if (playback.mediaPath.isEmpty) throw const ApiException('NO_MATCH_MEDIA');
    return playback;
  }

  CatalogItem _catalogItem(Map<String, dynamic> json) {
    final item = CatalogItem.fromJson(json);
    final rawPoster = item.poster.trim();
    final poster = rawPoster.startsWith('/')
        ? _baseUri.resolve(rawPoster).toString()
        : rawPoster;
    return CatalogItem(
      id: item.id,
      title: item.title,
      poster: poster,
      type: item.type,
      ref: item.ref,
      year: item.year,
      rating: item.rating,
      source: item.source,
    );
  }

  Future<List<NewsItem>> news() async {
    final json = await _getJson('/api/v1/news');
    return _list(json['data'])
        .map(NewsItem.fromJson)
        .where((item) => item.ref.isNotEmpty)
        .toList(growable: false);
  }

  Future<NewsArticle> newsArticle(String ref) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_NEWS_REFERENCE');
    final json = await _getJson('/api/v1/news/article', {'ref': ref});
    final data = json['data'];
    if (data is! Map) throw const ApiException('INVALID_NEWS_ARTICLE');
    return NewsArticle.fromJson(data.cast<String, dynamic>());
  }

  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    final json =
        await _getJson('/api/v1/category', {'ref': categoryId, 'p': '$page'});
    return _list(json['data']).map(_catalogItem).toList(growable: false);
  }

  @override
  Future<List<CatalogItem>> search(String query) async {
    final json = await _getJson('/api/v1/search', {'q': query.trim()});
    return _dedupeCatalog(_list(json['data']).map(_catalogItem));
  }

  Future<bool> tmdbAvailable() async {
    final json = await _getJson('/api/v1/tmdb/status');
    return json['configured'] == true;
  }

  Future<List<CatalogItem>> searchTmdb(String query) async {
    final value = query.trim();
    if (value.length < 2) return const [];
    final json = await _getJson('/api/v1/tmdb/search', {'q': value});
    return _dedupeCatalog(_list(json['data']).map(_catalogItem));
  }

  List<CatalogItem> _dedupeCatalog(Iterable<CatalogItem> values) {
    final seenRefs = <String>{};
    final seenFallback = <String>{};
    final out = <CatalogItem>[];
    for (final item in values) {
      final ref = item.ref.trim();
      final fallback =
          '${item.source}|${item.type}|${item.title.trim().toLowerCase()}|${item.year ?? ''}';
      if (ref.isNotEmpty) {
        if (!seenRefs.add(ref)) continue;
      } else if (!seenFallback.add(fallback)) {
        continue;
      }
      out.add(item);
    }
    return out;
  }

  @override
  Future<TitleDetails> details(String ref) {
    final cached = cachedMetadata(ref);
    return cached?.hasEpisodes == true ? Future.value(cached!) : _details(ref);
  }

  Future<TitleDetails> _details(String ref, {bool refresh = false}) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_TITLE_REFERENCE');
    final json = await _getJson(
        '/api/cinema/details',
        {
          'ref': ref,
          if (refresh) 'refresh': '1',
          if (const bool.fromEnvironment('dart.library.js_interop'))
            'platform': 'web'
        },
        const Duration(seconds: 60));
    return TitleDetails.fromJson(json);
  }

  @override
  Future<TitleDetails> resolvePlayback(String ref,
      {bool refresh = false}) async {
    if (_useEdge && ['3isk:', 'alooy:', 'legacy:'].any(ref.startsWith)) {
      return _resolveEdge(ref, refresh: refresh);
    }
    // Metadata prefetch never substitutes for a playable, token-aware response.
    final resolved = await _details(ref, refresh: refresh);
    if (resolved.needsClientResolution) return _resolveClientPlayer(resolved);
    if (resolved.hasDirectMedia) return resolved;
    if (resolved.playbackUnavailable) {
      throw ApiException(resolved.playbackReason.isEmpty
          ? 'PLAYBACK_UNAVAILABLE'
          : resolved.playbackReason);
    }
    throw const ApiException('NO_PLAYABLE_MEDIA');
  }

  Future<TitleDetails> _resolveEdge(String ref, {required bool refresh}) async {
    if (_edgeUri.scheme != 'https' ||
        _edgeUri.userInfo.isNotEmpty ||
        _edgeUri.hasQuery ||
        _edgeUri.hasFragment ||
        _edgeUri.hasPort) {
      throw const ApiException('INVALID_EDGE_ENDPOINT');
    }
    final response = await _client.get(
        _edgeUri.replace(
            path: '/v1/resolve',
            queryParameters: {'ref': ref, if (refresh) 'refresh': '1'}),
        headers: const {
          'accept': 'application/json'
        }).timeout(const Duration(seconds: 30));
    if (response.bodyBytes.length > 12288) {
      throw const ApiException('EDGE_RESPONSE_TOO_LARGE');
    }
    final data = jsonDecode(response.body);
    if (response.statusCode != 200 ||
        data is! Map ||
        data['schema_version'] != 1 ||
        data['status'] != 'success' ||
        data['sources'] is! List) {
      throw const ApiException('EDGE_NO_HEALTHY_SOURCES');
    }
    final sources = <PlaybackSource>[];
    for (final raw in (data['sources'] as List).take(8)) {
      if (raw is! Map ||
          (const bool.fromEnvironment('dart.library.js_interop') &&
              raw['web_playable'] != true) ||
          !['3isk', 'akoam', 'alooy'].contains(raw['provider_id'])) {
        continue;
      }
      final source = PlaybackSource.fromJson(raw.cast<String, dynamic>());
      final expiry = source.expiresAt;
      final uri = Uri.tryParse(source.mediaPath);
      if (expiry == null ||
          !expiry.isAfter(DateTime.now().add(const Duration(seconds: 30))) ||
          uri == null ||
          !isPublicMediaUri(uri) ||
          !['edge_direct', 'edge_local_proxy'].contains(source.playbackMode)) {
        continue;
      }
      if (source.playbackMode == 'edge_local_proxy') {
        validateEdgeStream(uri, source.headers);
      }
      _edgeStreams[source.mediaPath] = expiry;
      sources.add(source);
    }
    _edgeStreams.removeWhere((_, expiry) => expiry.isBefore(DateTime.now()));
    while (_edgeStreams.length > 64) {
      _edgeStreams.remove(_edgeStreams.keys.first);
    }
    if (sources.isEmpty) throw const ApiException('EDGE_NO_HEALTHY_SOURCES');
    final first = sourceRouter.rank(sources).first;
    return TitleDetails(
        title: '',
        poster: '',
        episodes: const [],
        mediaPath: first.mediaPath,
        mediaType: first.mediaType,
        playbackMode: first.playbackMode,
        playbackHeaders: first.headers,
        mediaSources: sources,
        expiresAt: first.expiresAt,
        downloadAvailable: false,
        playbackUnavailable: false,
        playbackReason: '');
  }

  Future<TitleDetails> _resolveClientPlayer(TitleDetails details) async {
    var uri = Uri.parse(details.resolverUrl);
    for (var redirects = 0; redirects <= 3; redirects++) {
      if (uri.scheme != 'https' ||
          uri.host != 'miravd.com' ||
          uri.userInfo.isNotEmpty ||
          uri.hasPort ||
          uri.hasQuery ||
          uri.hasFragment ||
          !RegExp(r'^/embed-[a-zA-Z0-9]+\.html$').hasMatch(uri.path)) {
        throw const ApiException('INVALID_PLAYER_METADATA');
      }
      final request = http.Request('GET', uri)..followRedirects = false;
      request.headers.addAll(details.resolverHeaders);
      final response =
          await _client.send(request).timeout(const Duration(seconds: 20));
      if ([301, 302, 303, 307, 308].contains(response.statusCode)) {
        final location = response.headers['location'];
        await response.stream.listen((_) {}).cancel();
        if (location == null) {
          throw const ApiException('INVALID_PLAYER_REDIRECT');
        }
        uri = uri.resolve(location);
        continue;
      }
      if (response.statusCode != 200) {
        await response.stream.listen((_) {}).cancel();
        throw ApiException('PLAYER_HTTP_${response.statusCode}');
      }
      final bytes = <int>[];
      await for (final chunk
          in response.stream.timeout(const Duration(seconds: 20))) {
        if (bytes.length + chunk.length > 2 * 1024 * 1024) {
          throw const ApiException('PLAYER_METADATA_TOO_LARGE');
        }
        bytes.addAll(chunk);
      }
      final media = miravdMediaUrl(utf8.decode(bytes));
      final expiry = DateTime.now().toUtc().add(const Duration(minutes: 5));
      mediaUri(media, playbackMode: 'direct', expiresAt: expiry);
      return TitleDetails(
          title: details.title,
          poster: details.poster,
          episodes: const [],
          mediaPath: media,
          mediaType: Uri.parse(media).path.endsWith('.mp4') ? 'mp4' : 'm3u8',
          playbackMode: 'direct',
          playbackHeaders: {
            'Referer': 'https://miravd.com/',
            if (details.resolverHeaders['User-Agent'] != null)
              'User-Agent': details.resolverHeaders['User-Agent']!
          },
          expiresAt: expiry,
          downloadAvailable: false,
          playbackUnavailable: false,
          playbackReason: '');
    }
    throw const ApiException('PLAYER_REDIRECT_LIMIT');
  }

  Uri mediaUri(String mediaPath,
      {bool download = false,
      String playbackMode = 'proxy',
      DateTime? expiresAt}) {
    if (playbackMode == 'edge_direct') {
      final expiry = _edgeStreams[mediaPath];
      final uri = Uri.tryParse(mediaPath);
      if (download ||
          uri == null ||
          !isPublicMediaUri(uri) ||
          expiry == null ||
          !expiry.isAfter(DateTime.now())) {
        throw const ApiException('INVALID_EDGE_MEDIA');
      }
      return uri;
    }
    if (playbackMode == 'direct') {
      final uri = Uri.tryParse(mediaPath);
      final miravd = RegExp(r'^s\d+\.grzcdn\.com$').hasMatch(uri?.host ?? '');
      final akoam = RegExp(r'^[a-z0-9-]+\.downet\.net$', caseSensitive: false)
          .hasMatch(uri?.host ?? '');
      final expires = (miravd || akoam)
          ? expiresAt?.millisecondsSinceEpoch
          : int.tryParse(uri?.queryParameters['expires'] ?? '');
      if (uri == null ||
          uri.scheme != 'https' ||
          uri.userInfo.isNotEmpty ||
          uri.hasPort ||
          !(akoam ||
              miravd ||
              RegExp(r'^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$', caseSensitive: false)
                  .hasMatch(uri.host)) ||
          (!akoam && !uri.path.startsWith('/hls/')) ||
          !(akoam
                  ? RegExp(r'\.(m3u8|mp4|mkv|webm|mpd|ts|m2ts)$',
                      caseSensitive: false)
                  : RegExp(r'\.(m3u8|mp4)$'))
              .hasMatch(uri.path) ||
          (!miravd && !akoam && (uri.queryParameters['token'] ?? '').isEmpty) ||
          expires == null) {
        throw const ApiException('INVALID_DIRECT_MEDIA');
      }
      if (download) throw const ApiException('DIRECT_HLS_DOWNLOAD_UNAVAILABLE');
      if (((miravd || akoam) ? expires : expires * 1000) <=
          DateTime.now().millisecondsSinceEpoch) {
        throw const ApiException('DIRECT_MEDIA_EXPIRED');
      }
      return uri;
    }
    final cinema = mediaPath.startsWith('/api/cinema/media?') ||
        mediaPath.startsWith('/api/alooy/media?');
    final matches = mediaPath.startsWith('/api/matches/media?');
    if (!cinema && !matches) {
      throw const ApiException('INVALID_MEDIA_REFERENCE');
    }
    final uri = _baseUri.resolve(mediaPath);
    if (!download) return uri;
    final params = Map<String, String>.from(uri.queryParameters)
      ..['download'] = '1';
    return uri.replace(queryParameters: params);
  }

  Future<Map<String, dynamic>> _getJson(String path,
      [Map<String, String>? query,
      Duration timeout = const Duration(seconds: 30)]) async {
    final uri = _baseUri.replace(path: path, queryParameters: query);
    final response = await _client.get(uri,
        headers: const {'accept': 'application/json'}).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('HTTP ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const ApiException('INVALID_JSON');
    }
    if (decoded['status'] != 'success') {
      throw ApiException('${decoded['message'] ?? 'RUNTIME_ERROR'}');
    }
    return decoded;
  }

  static List<Map<String, dynamic>> _list(dynamic value) => value is List
      ? value
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList(growable: false)
      : const <Map<String, dynamic>>[];

  void close() => _client.close();
}

class ApiException implements Exception {
  const ApiException(this.code);
  final String code;
  @override
  String toString() => 'ApiException($code)';
}
