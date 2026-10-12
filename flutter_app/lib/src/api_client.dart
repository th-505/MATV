import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class AlQahtaniApi {
  AlQahtaniApi({http.Client? client, Uri? baseUri})
      : _client = client ?? http.Client(),
        _baseUri = baseUri ?? Uri.parse(const String.fromEnvironment('MATV_API_BASE', defaultValue: 'https://matv.onrender.com'));

  final http.Client _client;
  final Uri _baseUri;

  MatchItem _matchItem(Map<String, dynamic> json) {
    final item = MatchItem.fromJson(json);
    String proxyLogo(String raw) {
      final value = raw.trim();
      if (value.isEmpty) return '';
      if (value.startsWith('/')) return _baseUri.resolve(value).toString();
      final parsed = Uri.tryParse(value);
      if (parsed == null || parsed.scheme != 'https') return '';
      return _baseUri.replace(path: '/api/matches/logo', queryParameters: {'url': value}).toString();
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
    if (serverRef.trim().isEmpty) throw const ApiException('MISSING_MATCH_SERVER_REFERENCE');
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
    final poster = rawPoster.startsWith('/') ? _baseUri.resolve(rawPoster).toString() : rawPoster;
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
    return _list(json['data']).map(NewsItem.fromJson).where((item) => item.ref.isNotEmpty).toList(growable: false);
  }

  Future<NewsArticle> newsArticle(String ref) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_NEWS_REFERENCE');
    final json = await _getJson('/api/v1/news/article', {'ref': ref});
    final data = json['data'];
    if (data is! Map) throw const ApiException('INVALID_NEWS_ARTICLE');
    return NewsArticle.fromJson(data.cast<String, dynamic>());
  }

  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    final json = await _getJson('/api/v1/category', {'ref': categoryId, 'p': '$page'});
    return _list(json['data']).map(_catalogItem).toList(growable: false);
  }

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
      final fallback = '${item.source}|${item.type}|${item.title.trim().toLowerCase()}|${item.year ?? ''}';
      if (ref.isNotEmpty) {
        if (!seenRefs.add(ref)) continue;
      } else if (!seenFallback.add(fallback)) {
        continue;
      }
      out.add(item);
    }
    return out;
  }

  Future<TitleDetails> details(String ref) => _details(ref);

  Future<TitleDetails> _details(String ref, {bool refresh = false}) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_TITLE_REFERENCE');
    final json = await _getJson('/api/cinema/details', {'ref': ref, if (refresh) 'refresh': '1'}, const Duration(seconds: 60));
    return TitleDetails.fromJson(json);
  }

  Future<TitleDetails> resolvePlayback(String ref, {bool refresh = false}) async {
    final resolved = refresh ? await _details(ref, refresh: true) : await details(ref);
    if (resolved.hasDirectMedia) return resolved;
    if (resolved.playbackUnavailable) {
      throw ApiException(resolved.playbackReason.isEmpty ? 'PLAYBACK_UNAVAILABLE' : resolved.playbackReason);
    }
    throw const ApiException('NO_PLAYABLE_MEDIA');
  }

  Uri mediaUri(String mediaPath, {bool download = false, String playbackMode = 'proxy', DateTime? expiresAt}) {
    if (playbackMode == 'direct') {
      final uri = Uri.tryParse(mediaPath);
      final miravd = RegExp(r'^s\d+\.grzcdn\.com$').hasMatch(uri?.host ?? '');
      final expires = miravd ? expiresAt?.millisecondsSinceEpoch : int.tryParse(uri?.queryParameters['expires'] ?? '');
      if (uri == null || uri.scheme != 'https' || uri.userInfo.isNotEmpty || uri.hasPort ||
          !(miravd || RegExp(r'^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$', caseSensitive: false).hasMatch(uri.host)) ||
          !uri.path.startsWith('/hls/') || !RegExp(r'\.(m3u8|mp4)$').hasMatch(uri.path) ||
          (!miravd && (uri.queryParameters['token'] ?? '').isEmpty) || expires == null) {
        throw const ApiException('INVALID_DIRECT_MEDIA');
      }
      if (download) throw const ApiException('DIRECT_HLS_DOWNLOAD_UNAVAILABLE');
      if ((miravd ? expires : expires * 1000) <= DateTime.now().millisecondsSinceEpoch) throw const ApiException('DIRECT_MEDIA_EXPIRED');
      return uri;
    }
    final cinema = mediaPath.startsWith('/api/cinema/media?');
    final matches = mediaPath.startsWith('/api/matches/media?');
    if (!cinema && !matches) throw const ApiException('INVALID_MEDIA_REFERENCE');
    final uri = _baseUri.resolve(mediaPath);
    if (!download) return uri;
    final params = Map<String, String>.from(uri.queryParameters)..['download'] = '1';
    return uri.replace(queryParameters: params);
  }

  Future<Map<String, dynamic>> _getJson(String path, [Map<String, String>? query, Duration timeout = const Duration(seconds: 30)]) async {
    final uri = _baseUri.replace(path: path, queryParameters: query);
    final response = await _client.get(uri, headers: const {'accept': 'application/json'}).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('HTTP ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw const ApiException('INVALID_JSON');
    if (decoded['status'] != 'success') throw ApiException('${decoded['message'] ?? 'RUNTIME_ERROR'}');
    return decoded;
  }

  static List<Map<String, dynamic>> _list(dynamic value) => value is List
      ? value.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList(growable: false)
      : const <Map<String, dynamic>>[];

  void close() => _client.close();
}

class ApiException implements Exception {
  const ApiException(this.code);
  final String code;
  @override
  String toString() => 'ApiException($code)';
}
