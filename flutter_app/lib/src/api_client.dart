import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'models.dart';
import 'media_repository.dart';
import 'alooy_policy.dart';
import 'unified_media.dart';

class MitvApi implements MediaRepository {
  final sourceRouter = SourceRouter();
  MitvApi({http.Client? client, Uri? baseUri, Uri? edgeUri, bool? useEdge})
    : _client = client ?? http.Client(),
      _useEdge = useEdge ?? (edgeUri != null || client == null),
      _edgeUri =
          edgeUri ??
          Uri.parse(
            const String.fromEnvironment(
              'MITV_EDGE_BASE',
              defaultValue:
                  'https://matv-edge-resolver.dada1000100.workers.dev',
            ),
          ),
      _baseUri =
          baseUri ??
          Uri.parse(
            const String.fromEnvironment(
              'MITV_API_BASE',
              defaultValue: 'https://matv.onrender.com',
            ),
          );

  final http.Client _client;
  final Uri _baseUri;
  final Uri _edgeUri;
  final bool _useEdge;
  bool get usesEdge => _useEdge;
  int _cacheGeneration = 0;
  bool _closed = false;
  final _edgeStreams = <String, DateTime>{};
  final _playbackCache = <String, TitleDetails>{};
  final _catalogGroups = <String, CatalogItem>{};
  final _pagination = <String, bool>{};
  final _metadataWarmAttempts = <String, DateTime>{};
  final _metadataWarmPending = <String>{};

  /// Clear browsing data without touching user preferences, authentication, or
  /// the bounded expiry registry needed by an already open direct stream.
  void clearBrowsingCache() {
    _cacheGeneration++;
    _metadata.clear();
    _playbackCache.clear();
    _catalogGroups.clear();
    _pagination.clear();
    _metadataWarmAttempts.clear();
    _edgeStreams.removeWhere((_, expiry) => !expiry.isAfter(DateTime.now()));
    // Keep pending slots until they settle, so clearing cannot increase the
    // prefetch concurrency cap. Their old-generation results are discarded.
  }

  void _ensureGeneration(int generation) {
    if (_closed) throw const ApiException('API_CLOSED');
    if (generation != _cacheGeneration) {
      throw const ApiException('CACHE_INVALIDATED');
    }
  }

  bool? categoryHasMore(String categoryId, int page) =>
      _pagination['$categoryId:$page'];

  void rememberIdentity(CatalogItem item) {
    final normalized = UnifiedMedia.mergeSources([item]).single;
    for (final ref in normalized.sourceRefs.values.take(4)) {
      _catalogGroups[ref] = normalized;
    }
    while (_catalogGroups.length > 256) {
      _catalogGroups.remove(_catalogGroups.keys.first);
    }
  }

  Future<Map<String, dynamic>> _metadataJson(
    String ref, {
    bool refresh = false,
    bool metadataOnly = false,
  }) async {
    if (_useEdge && ref.startsWith('laroza:')) {
      final response = await _edgeJson('/v1/laroza/details', {'ref': ref});
      if (response['data'] is! Map) {
        throw const ApiException('INVALID_TITLE_METADATA');
      }
      // A background metadata-only read lets the private catalogue cache record
      // demand and its TTL. Never send a stream URL or user-supplied payload.
      unawaited(_warmLarozaMetadata(ref));
      return (response['data'] as Map).cast<String, dynamic>();
    }
    return _getJson(
      metadataOnly ? '/api/cinema/metadata' : '/api/cinema/details',
      {
        'ref': ref,
        if (refresh) 'refresh': '1',
        if (const bool.fromEnvironment('dart.library.js_interop'))
          'platform': 'web',
      },
      Duration(seconds: metadataOnly ? 12 : 60),
    );
  }

  Future<void> _warmLarozaMetadata(String ref) async {
    final now = DateTime.now();
    final attemptedAt = _metadataWarmAttempts[ref];
    if (_closed ||
        _metadataWarmPending.contains(ref) ||
        _metadataWarmPending.length >= 2 ||
        (attemptedAt != null &&
            now.difference(attemptedAt) < const Duration(minutes: 2))) {
      return;
    }
    _metadataWarmAttempts[ref] = now;
    while (_metadataWarmAttempts.length > 128) {
      _metadataWarmAttempts.remove(_metadataWarmAttempts.keys.first);
    }
    _metadataWarmPending.add(ref);
    try {
      await _getJson('/api/cinema/metadata', {
        'ref': ref,
      }, const Duration(seconds: 12));
    } catch (_) {
      // This optional cache warm must never delay or fail Edge playback.
    } finally {
      _metadataWarmPending.remove(ref);
    }
  }

  TitleDetails? cachedPlayback(String ref) {
    final value = _playbackCache[ref];
    return value?.expiresAt?.isAfter(DateTime.now()) == true ? value : null;
  }

  PlaybackSource? downloadableSource(String ref) {
    if (const bool.fromEnvironment('dart.library.js_interop')) return null;
    final sources =
        cachedPlayback(ref)?.mediaSources ?? const <PlaybackSource>[];
    for (final source in sources) {
      if (source.mediaType == 'mp4' &&
          source.expiresAt?.isAfter(DateTime.now()) == true &&
          !ref.startsWith('match')) {
        return source;
      }
    }
    return null;
  }

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
    final generation = _cacheGeneration;
    return _metadataPending.putIfAbsent(ref, () async {
      try {
        final json = await _metadataJson(ref, metadataOnly: true);
        _ensureGeneration(generation);
        _metadata[ref] = (
          expires: DateTime.now().add(const Duration(minutes: 2)),
          details: TitleDetails.fromJson(json),
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
      return _baseUri
          .replace(path: '/api/matches/logo', queryParameters: {'url': value})
          .toString();
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
    final json = _useEdge
        ? await _edgeJson('/v1/matches')
        : await _getJson('/api/v1/matches');
    return _list(json['data']).map(_matchItem).toList(growable: false);
  }

  Future<List<MatchServer>> matchServers(String ref) async {
    if (ref.trim().isEmpty) throw const ApiException('MISSING_MATCH_REFERENCE');
    final json = _useEdge
        ? await _edgeJson('/v1/matches/servers', {'ref': ref})
        : await _getJson('/api/v1/matches/servers', {'ref': ref});
    return _list(json['data'])
        .map(MatchServer.fromJson)
        .where((server) => server.ref.isNotEmpty)
        .toList(growable: false);
  }

  Future<MatchPlayback> resolveMatchPlayback(String serverRef) async {
    if (serverRef.trim().isEmpty) {
      throw const ApiException('MISSING_MATCH_SERVER_REFERENCE');
    }
    if (_useEdge) {
      final resolved = await resolvePlayback(serverRef);
      return MatchPlayback(
        mediaPath: resolved.mediaPath,
        mediaType: resolved.mediaType,
        serverName: resolved.mediaSources.first.provider,
        playbackMode: resolved.playbackMode,
        headers: resolved.playbackHeaders,
        expiresAt: resolved.expiresAt,
      );
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
    return item.copyWith(
      poster: rawPoster.startsWith('/')
          ? _baseUri.resolve(rawPoster).toString()
          : rawPoster,
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
    final generation = _cacheGeneration;
    final json = _useEdge && categoryId.startsWith('laroza-')
        ? await _edgeJson('/v1/laroza/category', {
            'section': categoryId.substring(7),
            'page': '$page',
          })
        : await _getJson('/api/v1/category', {'ref': categoryId, 'p': '$page'});
    _ensureGeneration(generation);
    final pagination = json['pagination'];
    if (pagination is Map && pagination['has_more'] is bool) {
      _pagination['$categoryId:$page'] = pagination['has_more'] as bool;
      while (_pagination.length > 128) {
        _pagination.remove(_pagination.keys.first);
      }
    }
    return _dedupeCatalog(_list(json['data']).map(_catalogItem));
  }

  @override
  Future<List<CatalogItem>> search(String query, {String providerId = ''}) async {
    final generation = _cacheGeneration;
    final json = await _getJson(
      '/api/v1/search',
      {'q': query.trim(), if (providerId.isNotEmpty) 'provider': providerId},
      const Duration(seconds: 90),
    );
    _ensureGeneration(generation);
    return _dedupeCatalog(_list(json['data']).map(_catalogItem));
  }

  final List<Map<String, dynamic>> _searchProviders = [];
  final sourceMetadataChanges = ValueNotifier<int>(0);
  Future<List<Map<String, dynamic>>>? _searchProvidersPending;
  bool _searchProvidersLoaded = false;
  bool sourceMetadataLoading = false;
  String? sourceMetadataError;

  // Shared by all entry points. Successful metadata is cached, in-flight calls
  // coalesce, and failure clears the pending slot so an explicit retry can run.
  Future<List<Map<String, dynamic>>> searchProviders() {
    if (_searchProvidersLoaded) return Future.value(List.unmodifiable(_searchProviders));
    if (_searchProvidersPending != null) return _searchProvidersPending!;
    sourceMetadataLoading = true;
    sourceMetadataError = null;
    final pending = _loadSearchProviders();
    _searchProvidersPending = pending;
    sourceMetadataChanges.value += 1;
    return pending;
  }

  Future<List<Map<String, dynamic>>> _loadSearchProviders() async {
    try {
      final json = await _getJson('/api/v1/search/providers');
      _searchProviders..clear()..addAll(_list(json['data']));
      _searchProvidersLoaded = true;
      return List.unmodifiable(_searchProviders);
    } catch (_) {
      sourceMetadataError = 'تعذر تحميل المصادر';
      rethrow;
    } finally {
      _searchProvidersPending = null;
      sourceMetadataLoading = false;
      if (!_closed) sourceMetadataChanges.value += 1;
    }
  }

  String sourceDisplayLabel(CatalogItem item) {
    final id = item.source;
    final prefix = item.ref.split(':').first;
    for (final p in _searchProviders) {
      final aliases = p['aliases'] is List ? p['aliases'] as List : const [];
      final host = Uri.tryParse(item.ref)?.host;
      final domains = p['domains'] is List ? p['domains'] as List : const [];
      if (p['id'] == id ||
          p['id'] == prefix ||
          aliases.contains(id) ||
          aliases.contains(prefix) ||
          (host != null && host.isNotEmpty && domains.any((d) => Uri.tryParse('$d')?.host == host))) {
        return '${p['displayName'] ?? ''}';
      }
    }
    return '';
  }

  Future<bool> tmdbAvailable() async {
    final json = await _getJson('/api/v1/tmdb/status');
    return json['configured'] == true;
  }

  Future<List<CatalogItem>> searchTmdb(String query) async {
    final generation = _cacheGeneration;
    final value = query.trim();
    if (value.length < 2) return const [];
    final json = await _getJson('/api/v1/tmdb/search', {'q': value});
    _ensureGeneration(generation);
    return _dedupeCatalog(_list(json['data']).map(_catalogItem));
  }

  List<CatalogItem> _dedupeCatalog(Iterable<CatalogItem> values) {
    final merged = UnifiedMedia.mergeSources(values);
    for (final item in merged) {
      rememberIdentity(item);
    }
    return merged;
  }

  @override
  Future<TitleDetails> details(String ref) async {
    final generation = _cacheGeneration;
    final cached = cachedMetadata(ref);
    var metadata = cached?.hasEpisodes == true ? cached! : await _details(ref);
    _ensureGeneration(generation);
    final group = _catalogGroups[ref];
    if (group != null) {
      metadata = metadata.copyWith(sourceRefs: group.sourceRefs);
      if (metadata.hasEpisodes && group.sourceRefs.length > 1) {
        await _rememberEpisodeGroups(ref, group, metadata);
        _ensureGeneration(generation);
      }
    }
    if (_useEdge &&
        !metadata.hasEpisodes &&
        ['3isk:', 'alooy:', 'legacy:', 'laroza:'].any(ref.startsWith)) {
      final playback = await resolvePlayback(ref);
      _ensureGeneration(generation);
      return metadata.copyWith(
        mediaPath: playback.mediaPath,
        mediaType: playback.mediaType,
        playbackMode: playback.playbackMode,
        playbackHeaders: playback.playbackHeaders,
        mediaSources: playback.mediaSources,
        expiresAt: playback.expiresAt,
        downloadAvailable: playback.downloadAvailable,
        playbackUnavailable: false,
        playbackReason: '',
      );
    }
    return metadata;
  }

  Future<TitleDetails> _details(String ref, {bool refresh = false}) async {
    final generation = _cacheGeneration;
    if (ref.trim().isEmpty) throw const ApiException('MISSING_TITLE_REFERENCE');
    final json = await _metadataJson(ref, refresh: refresh);
    _ensureGeneration(generation);
    final normalized = <String, dynamic>{...json};
    if (json['media_sources'] is List) {
      normalized['media_sources'] = [
        for (final raw in (json['media_sources'] as List).whereType<Map>())
          <String, dynamic>{
            ...raw.cast<String, dynamic>(),
            'playback_mode': raw['playback_mode'] ?? json['playback_mode'],
            'expires_at': raw['expires_at'] ?? json['expires_at'],
            'headers':
                raw['headers'] ?? json['headers'] ?? json['playback_headers'],
          },
      ];
    }
    final rawPath =
        json['stream_url'] ?? json['media_url'] ?? json['media_path'];
    if ((normalized['media_sources'] is! List ||
            (normalized['media_sources'] as List).isEmpty) &&
        rawPath is String &&
        rawPath.isNotEmpty) {
      normalized['media_sources'] = [
        {...json, 'url': rawPath},
      ];
    }
    final details = TitleDetails.fromJson(normalized);
    if (!details.hasDirectMedia) {
      _metadata[ref] = (
        expires: DateTime.now().add(const Duration(minutes: 2)),
        details: details,
      );
      if (_metadata.length > 64) {
        _metadata.remove(_metadata.keys.first);
      }
    }
    if (details.hasDirectMedia) {
      _registerDirectMetadata(details);
      _playbackCache[ref] = details;
      if (_playbackCache.length > 64) {
        _playbackCache.remove(_playbackCache.keys.first);
      }
    }
    return details;
  }

  void _registerDirectMetadata(TitleDetails details) {
    if (![
      'direct',
      'local_proxy',
      'edge_direct',
      'edge_local_proxy',
    ].contains(details.playbackMode)) {
      throw const ApiException('CLOUD_VIDEO_PROXY_RETIRED');
    }
    final validated = <String, DateTime>{};
    final sources = <PlaybackSource>[
      PlaybackSource(
        mediaPath: details.mediaPath,
        mediaType: details.mediaType,
        expiresAt: details.expiresAt,
      ),
      ...details.mediaSources,
    ];
    for (final source in sources) {
      final uri = Uri.tryParse(source.mediaPath);
      final expiry = source.expiresAt ?? details.expiresAt;
      if (uri == null ||
          !isPublicMediaUri(uri) ||
          expiry == null ||
          !expiry.isAfter(DateTime.now().add(const Duration(seconds: 30)))) {
        throw const ApiException('INVALID_DIRECT_MEDIA');
      }
      validated[source.mediaPath] = expiry;
    }
    _edgeStreams.addAll(validated);
    _edgeStreams.removeWhere((_, expiry) => !expiry.isAfter(DateTime.now()));
    while (_edgeStreams.length > 64) {
      _edgeStreams.remove(_edgeStreams.keys.first);
    }
  }

  @override
  Future<TitleDetails> resolvePlayback(
    String ref, {
    bool refresh = false,
  }) async {
    final generation = _cacheGeneration;
    if (_useEdge &&
        [
          '3isk:',
          'alooy:',
          'legacy:',
          'laroza:',
          'match:',
          'matchserver:',
        ].any(ref.startsWith)) {
      return _resolveEdge(ref, refresh: refresh);
    }
    // Metadata prefetch never substitutes for a playable, token-aware response.
    final resolved = await _details(ref, refresh: refresh);
    _ensureGeneration(generation);
    if (resolved.needsClientResolution) {
      throw const ApiException('EDGE_DIRECT_RESOLUTION_REQUIRED');
    }
    if (resolved.hasDirectMedia) {
      _playbackCache[ref] = resolved;
      if (_playbackCache.length > 64) {
        _playbackCache.remove(_playbackCache.keys.first);
      }
      return resolved;
    }
    if (resolved.playbackUnavailable) {
      throw ApiException(
        resolved.playbackReason.isEmpty
            ? 'PLAYBACK_UNAVAILABLE'
            : resolved.playbackReason,
      );
    }
    throw const ApiException('NO_PLAYABLE_MEDIA');
  }

  Future<TitleDetails> _resolveEdge(String ref, {required bool refresh}) async {
    final generation = _cacheGeneration;
    final group = _catalogGroups[ref];
    TitleDetails? primary;
    try {
      primary = await _resolveSingleEdge(ref, refresh: refresh);
    } catch (_) {
      if (group == null || group.sourceRefs.length < 2) rethrow;
    }
    _ensureGeneration(generation);
    final providers =
        primary?.mediaSources.map((source) => source.providerId).toSet() ??
        <String>{};
    final refs =
        group?.sourceRefs.entries
            .where(
              (entry) => entry.value != ref && !providers.contains(entry.key),
            )
            .take(3) ??
        const <MapEntry<String, String>>[];
    final alternatives = await Future.wait(
      refs.map((entry) async {
        try {
          return await _resolveSingleEdge(entry.value, refresh: refresh);
        } catch (_) {
          return null;
        }
      }),
    );
    _ensureGeneration(generation);
    final ranked = sourceRouter.rank([
      if (primary != null) ...primary.mediaSources,
      for (final other in alternatives)
        if (other != null) ...other.mediaSources,
    ]);
    if (ranked.isEmpty) throw const ApiException('EDGE_NO_HEALTHY_SOURCES');
    final first = ranked.first;
    final base = primary ?? alternatives.whereType<TitleDetails>().first;
    final resolved = base.copyWith(
      mediaPath: first.mediaPath,
      mediaType: first.mediaType,
      playbackMode: first.playbackMode,
      playbackHeaders: first.headers,
      expiresAt: first.expiresAt,
      mediaSources: ranked,
      sourceRefs: group?.sourceRefs,
      downloadAvailable:
          !const bool.fromEnvironment('dart.library.js_interop') &&
          ranked.any((s) => s.mediaType == 'mp4'),
    );
    _playbackCache[ref] = resolved;
    while (_playbackCache.length > 64) {
      _playbackCache.remove(_playbackCache.keys.first);
    }
    return resolved;
  }

  bool _parentMatches(CatalogItem group, String ref, TitleDetails details) {
    final actual = CatalogItem(
      id: ref,
      ref: ref,
      title: details.title,
      poster: details.poster,
      type: group.type,
      year: details.year,
      genres: details.genres,
      audioLanguage: details.audioLanguage,
      edition: details.edition,
      imdbId: details.imdbId,
      identityVerified: details.identityVerified,
      workIdentityVerified: details.workIdentityVerified,
    );
    return UnifiedMedia.sameIdentity(group, actual);
  }

  // Resolve only explicitly aligned episode numbers. Missing season/cut data
  // keeps providers separate; recommendation cards never become alternatives.
  Future<void> _rememberEpisodeGroups(
    String primaryRef,
    CatalogItem group,
    TitleDetails primary,
  ) async {
    final generation = _cacheGeneration;
    if (!_parentMatches(group, primaryRef, primary)) return;
    final parents = await Future.wait(
      group.sourceRefs.values.where((ref) => ref != primaryRef).take(3).map((
        ref,
      ) async {
        try {
          final cached = cachedMetadata(ref);
          final details =
              cached ??
              TitleDetails.fromJson(
                await _metadataJson(ref, metadataOnly: true),
              );
          _ensureGeneration(generation);
          _metadata[ref] = (
            expires: DateTime.now().add(const Duration(minutes: 2)),
            details: details,
          );
          if (_metadata.length > 64) {
            _metadata.remove(_metadata.keys.first);
          }
          return (ref, details);
        } catch (_) {
          return null;
        }
      }),
    );
    _ensureGeneration(generation);
    for (final episode in primary.episodes) {
      if (episode.season == null ||
          !episode.hasEpisodeNumber ||
          episode.ref.isEmpty) {
        continue;
      }
      final refs = <String, String>{episode.ref.split(':').first: episode.ref};
      for (final parent in parents) {
        if (parent == null) continue;
        final details = parent.$2;
        if (!_parentMatches(group, parent.$1, details)) {
          continue;
        }
        final matches = details.episodes
            .where(
              (other) =>
                  other.season == episode.season &&
                  other.hasEpisodeNumber &&
                  other.number == episode.number &&
                  other.watchAvailable &&
                  other.ref.isNotEmpty,
            )
            .toList();
        if (matches.length == 1) {
          refs[matches.single.ref.split(':').first] = matches.single.ref;
        }
      }
      if (refs.length > 1) {
        rememberIdentity(
          group.copyWith(
            ref: episode.ref,
            season: episode.season,
            episode: episode.number,
            sourceRefs: refs,
          ),
        );
      }
    }
  }

  Future<TitleDetails> _resolveSingleEdge(
    String ref, {
    required bool refresh,
  }) async {
    final generation = _cacheGeneration;
    if (_edgeUri.scheme != 'https' ||
        _edgeUri.userInfo.isNotEmpty ||
        _edgeUri.hasQuery ||
        _edgeUri.hasFragment ||
        _edgeUri.hasPort) {
      throw const ApiException('INVALID_EDGE_ENDPOINT');
    }
    final response = await _client
        .get(
          _edgeUri.replace(
            path: ref.startsWith('match:')
                ? '/v1/matches/resolve'
                : ref.startsWith('matchserver:')
                ? '/v1/matches/playback'
                : '/v1/resolve',
            queryParameters: {'ref': ref, if (refresh) 'refresh': '1'},
          ),
          headers: const {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 30));
    _ensureGeneration(generation);
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
          ![
            '3isk',
            'akoam',
            'alooy',
            'laroza',
            'matches',
          ].contains(raw['provider_id'])) {
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
    final details = TitleDetails(
      title: '',
      poster: '',
      episodes: const [],
      mediaPath: first.mediaPath,
      mediaType: first.mediaType,
      playbackMode: first.playbackMode,
      playbackHeaders: first.headers,
      mediaSources: sources,
      expiresAt: first.expiresAt,
      downloadAvailable:
          !const bool.fromEnvironment('dart.library.js_interop') &&
          sources.any((s) => s.mediaType == 'mp4') &&
          !ref.startsWith('match'),
      playbackUnavailable: false,
      playbackReason: '',
    );
    _playbackCache[ref] = details;
    if (_playbackCache.length > 64) {
      _playbackCache.remove(_playbackCache.keys.first);
    }
    return details;
  }

  Uri mediaUri(
    String mediaPath, {
    bool download = false,
    String playbackMode = 'proxy',
    DateTime? expiresAt,
  }) {
    if (playbackMode == 'edge_direct' ||
        (playbackMode == 'direct' && _edgeStreams.containsKey(mediaPath))) {
      final expiry = _edgeStreams[mediaPath];
      final uri = Uri.tryParse(mediaPath);
      if ((download && !(uri?.path.toLowerCase().endsWith('.mp4') ?? false)) ||
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
      final akoam = RegExp(
        r'^[a-z0-9-]+\.downet\.net$',
        caseSensitive: false,
      ).hasMatch(uri?.host ?? '');
      final expires = (miravd || akoam)
          ? expiresAt?.millisecondsSinceEpoch
          : int.tryParse(uri?.queryParameters['expires'] ?? '');
      if (uri == null ||
          uri.scheme != 'https' ||
          uri.userInfo.isNotEmpty ||
          uri.hasPort ||
          !(akoam ||
              miravd ||
              RegExp(
                r'^(?:[a-z0-9-]+\.)?ukrcdn\.xyz$',
                caseSensitive: false,
              ).hasMatch(uri.host)) ||
          (!akoam && !uri.path.startsWith('/hls/')) ||
          !(akoam
                  ? RegExp(
                      r'\.(m3u8|mp4|mkv|webm|mpd|ts|m2ts)$',
                      caseSensitive: false,
                    )
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
    throw const ApiException('CLOUD_VIDEO_PROXY_RETIRED');
  }

  Future<Map<String, dynamic>> _edgeJson(
    String path, [
    Map<String, String>? query,
  ]) async {
    final generation = _cacheGeneration;
    final response = await _client
        .get(
          _edgeUri.replace(path: path, queryParameters: query),
          headers: const {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 35));
    _ensureGeneration(generation);
    if (response.bodyBytes.length > 128 * 1024) {
      throw const ApiException('EDGE_RESPONSE_TOO_LARGE');
    }
    final data = jsonDecode(response.body);
    if (!response.statusCode.toString().startsWith('2') ||
        data is! Map<String, dynamic> ||
        data['status'] != 'success') {
      throw ApiException(
        path.startsWith('/v1/matches')
            ? 'MATCH_EDGE_UNAVAILABLE'
            : 'CATALOG_EDGE_UNAVAILABLE',
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> _getJson(
    String path, [
    Map<String, String>? query,
    Duration timeout = const Duration(seconds: 30),
  ]) async {
    final generation = _cacheGeneration;
    final uri = _baseUri.replace(path: path, queryParameters: query);
    final response = await _client
        .get(uri, headers: const {'accept': 'application/json'})
        .timeout(timeout);
    _ensureGeneration(generation);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (path == '/api/v1/search' && response.statusCode == 422) {
        throw const ApiException('SEARCH_UNSUPPORTED');
      }
      throw ApiException('HTTP ${response.statusCode}');
    }
    if (response.bodyBytes.length > 128 * 1024) {
      throw const ApiException('RUNTIME_RESPONSE_TOO_LARGE');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const ApiException('INVALID_JSON');
    }
    if (path == '/api/v1/search' && decoded['status'] == 'no_results') return decoded;
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

  void close() {
    if (_closed) return;
    _closed = true;
    _cacheGeneration++;
    _client.close();
    sourceMetadataChanges.dispose();
  }
}

class ApiException implements Exception {
  const ApiException(this.code);
  final String code;
  @override
  String toString() => 'ApiException($code)';
}
