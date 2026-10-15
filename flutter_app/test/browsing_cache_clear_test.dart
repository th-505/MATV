import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/models.dart';

http.Response metadata() => http.Response(
  jsonEncode({
    'status': 'success',
    'movie_title': 'Series',
    'episodes': [
      {'ref': 'legacy:episode', 'number': 1},
    ],
  }),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

http.Response stream() => http.Response(
  jsonEncode({
    'status': 'success',
    'schema_version': 1,
    'sources': [
      {
        'provider_id': '3isk',
        'provider': 'قصة عشق',
        'url': 'https://cdn.example/movie.mp4',
        'format': 'mp4',
        'playback_mode': 'edge_direct',
        'headers': {},
        'expires_at': DateTime.now()
            .add(const Duration(minutes: 3))
            .toIso8601String(),
      },
    ],
  }),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  test(
    'old prefetch results cannot refill cleared cache; a new request can',
    () async {
      final pending = Completer<http.Response>();
      var requests = 0;
      final api = MitvApi(
        client: MockClient((_) {
          requests++;
          return requests == 2 ? pending.future : Future.value(metadata());
        }),
      );
      addTearDown(api.close);
      await api.prefetchMetadata('legacy:ready');
      final prefetch = api.prefetchMetadata('legacy:pending');
      await Future<void>.delayed(Duration.zero);
      api.clearBrowsingCache();
      expect(api.cachedMetadata('legacy:ready'), isNull);
      final duplicate = api.prefetchMetadata('legacy:pending');
      expect(requests, 2);
      pending.complete(metadata());
      await Future.wait([prefetch, duplicate]);
      expect(api.cachedMetadata('legacy:pending'), isNull);
      await api.prefetchMetadata('legacy:pending');
      expect(requests, 3);
      expect(api.cachedMetadata('legacy:pending'), isNotNull);
    },
  );

  test(
    'pending category cannot restore pagination after cache clear',
    () async {
      final pending = Completer<http.Response>();
      final api = MitvApi(client: MockClient((_) => pending.future));
      addTearDown(api.close);
      final category = api.category('movie-foreign');
      final rejected = expectLater(
        category,
        throwsA(
          isA<ApiException>().having(
            (error) => error.code,
            'code',
            'CACHE_INVALIDATED',
          ),
        ),
      );
      api.clearBrowsingCache();
      pending.complete(
        http.Response(
          jsonEncode({
            'status': 'success',
            'data': [],
            'pagination': {'has_more': true},
          }),
          200,
        ),
      );
      await rejected;
      expect(api.categoryHasMore('movie-foreign', 1), isNull);
    },
  );

  test(
    'cache clear prevents stale edge alternatives and keeps already-open capabilities',
    () async {
      final pending = Completer<http.Response>();
      var requests = 0;
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((_) {
          requests++;
          return requests == 2 ? pending.future : Future.value(stream());
        }),
      );
      addTearDown(api.close);
      final resolved = await api.resolvePlayback('3isk:ready');
      api.rememberIdentity(
        const CatalogItem(
          id: 'work',
          title: 'Work',
          poster: '',
          type: 'movie',
          ref: '3isk:pending',
          year: 2020,
          audioLanguage: 'en',
          edition: 'original',
          sourceRefs: {'3isk': '3isk:pending', 'laroza': 'laroza:alternate'},
        ),
      );
      final playback = api.resolvePlayback('3isk:pending');
      final rejected = expectLater(
        playback,
        throwsA(
          isA<ApiException>().having(
            (error) => error.code,
            'code',
            'CACHE_INVALIDATED',
          ),
        ),
      );
      api.clearBrowsingCache();
      expect(api.cachedPlayback('3isk:ready'), isNull);
      expect(
        api.mediaUri(resolved.mediaPath, playbackMode: 'edge_direct').host,
        'cdn.example',
      );
      pending.complete(stream());
      await rejected;
      expect(
        requests,
        2,
        reason: 'no alternative started by an old-generation operation',
      );
      expect(api.cachedPlayback('3isk:pending'), isNull);
    },
  );

  test(
    'Laroza private-cache warm is metadata-only, optional and bounded to two '
    'requests; duplicate demand does not block playback',
    () async {
      final warms = <Uri>[];
      final pendingWarms = <Completer<http.Response>>[];
      final api = MitvApi(
        baseUri: Uri.parse('https://runtime.example'),
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          if (request.url.host == 'runtime.example') {
            expect(request.method, 'GET');
            expect(request.url.path, '/api/cinema/metadata');
            expect(request.url.queryParameters.keys, ['ref']);
            expect(request.body, isEmpty);
            warms.add(request.url);
            final pending = Completer<http.Response>();
            pendingWarms.add(pending);
            return pending.future;
          }
          if (request.url.path == '/v1/laroza/details') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': {'title': 'Film', 'episodes': []},
              }),
              200,
            );
          }
          return stream();
        }),
      );
      addTearDown(api.close);
      final details = await Future.wait([
        api.details('laroza:one'),
        api.details('laroza:two'),
        api.details('laroza:three'),
      ]);
      expect(details.every((details) => details.canPlay), isTrue);
      expect(warms, hasLength(2));
      await api.details('laroza:one');
      expect(warms, hasLength(2));
      for (final pending in pendingWarms) {
        pending.complete(http.Response('{"status":"error"}', 503));
      }
      await Future<void>.delayed(Duration.zero);
      await api.details('laroza:one');
      expect(
        warms,
        hasLength(2),
        reason: 'failed warms still have a two-minute cooldown',
      );
      api.clearBrowsingCache();
      await Future<void>.delayed(Duration.zero);
      expect(api.cachedMetadata('laroza:one'), isNull);
    },
  );
}
