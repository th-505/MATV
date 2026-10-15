import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/models.dart';

Map<String, dynamic> item(String provider, {String edition = 'original'}) => {
  'id': provider,
  'ref': '$provider:movie',
  'title': 'Example 1080p',
  'type': 'movie',
  'year': 2021,
  'genres': ['Drama'],
  'audio_language': 'en',
  'edition': edition,
  'source': provider,
  'poster': '/poster.jpg',
};
Map<String, dynamic> stream(String provider) => {
  'status': 'success',
  'schema_version': 1,
  'sources': [
    {
      'provider_id': provider,
      'provider': provider,
      'url': 'https://media.example/$provider.mp4',
      'format': 'mp4',
      'playback_mode': 'edge_direct',
      'expires_at': DateTime.now()
          .add(const Duration(minutes: 3))
          .toIso8601String(),
      'headers': {'Referer': 'https://source.example/', 'User-Agent': 'test'},
      'timeline_verified': false,
    },
  ],
};
void main() {
  test(
    'safe grouped search preserves identity and resolves each provider once',
    () async {
      final requests = <Uri>[];
      final api = MitvApi(
        baseUri: Uri.parse('https://api.example'),
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          requests.add(request.url);
          if (request.url.path == '/api/v1/search') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': [item('3isk'), item('laroza')],
              }),
              200,
            );
          }
          expect(request.url.path, '/v1/resolve');
          return http.Response(
            jsonEncode(
              stream(request.url.queryParameters['ref']!.split(':').first),
            ),
            200,
          );
        }),
      );
      final cards = await api.search('Example');
      expect(cards, hasLength(1));
      expect(cards.single.sourceRefs, {
        '3isk': '3isk:movie',
        'laroza': 'laroza:movie',
      });
      expect(cards.single.audioLanguage, 'en');
      expect(cards.single.poster, 'https://api.example/poster.jpg');
      final playback = await api.resolvePlayback(cards.single.ref);
      expect(playback.mediaSources.map((s) => s.providerId), [
        '3isk',
        'laroza',
      ]);
      expect(playback.mediaSources.every((s) => !s.timelineVerified), true);
      expect(requests.where((uri) => uri.path == '/v1/resolve'), hasLength(2));
      expect(api.downloadableSource(cards.single.ref), isNotNull);
      api.close();
    },
  );
  test(
    'different cuts stay separate without cross-provider requests',
    () async {
      var edgeRequests = 0;
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          if (request.url.path == '/api/v1/search') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': [
                  item('3isk'),
                  item('laroza', edition: 'arabic-dubbed'),
                ],
              }),
              200,
            );
          }
          edgeRequests++;
          return http.Response(jsonEncode(stream('3isk')), 200);
        }),
      );
      final cards = await api.search('Example');
      expect(cards, hasLength(2));
      await api.resolvePlayback(cards.first.ref);
      expect(edgeRequests, 1);
      api.close();
    },
  );
  test(
    'Laroza empty feed rotation retains next page without Render calls',
    () async {
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          expect(request.url.host, 'edge.example');
          expect(request.url.path, '/v1/laroza/category');
          expect(request.url.queryParameters, {
            'section': 'movies',
            'page': '2',
          });
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': [],
              'pagination': {'has_more': true, 'next_page': 3},
            }),
            200,
          );
        }),
      );
      expect(await api.category('laroza-movies', page: 2), isEmpty);
      expect(api.categoryHasMore('laroza-movies', 2), true);
      expect(api.categoryHasMore('laroza-movies', 1), null);
      api.close();
    },
  );
  test('Laroza playback preserves descriptive metadata', () async {
    final api = MitvApi(
      edgeUri: Uri.parse('https://edge.example'),
      client: MockClient((request) async {
        if (request.url.path == '/api/cinema/metadata') {
          return http.Response('{"status":"success"}', 200);
        }
        expect(request.url.host, 'edge.example');
        if (request.url.path == '/v1/laroza/details') {
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                ...item('laroza'),
                'plot': 'A real synopsis',
                'imdb_id': 'tt1234567',
                'identity_verified': false,
                'episodes': [],
              },
            }),
            200,
          );
        }
        expect(request.url.path, '/v1/resolve');
        return http.Response(jsonEncode(stream('laroza')), 200);
      }),
    );
    final details = await api.details('laroza:movie');
    expect(details.plot, 'A real synopsis');
    expect(details.imdbId, 'tt1234567');
    expect(details.identityVerified, false);
    expect(details.edition, 'original');
    expect(details.year, 2021);
    expect(details.canPlay, true);
    api.close();
  });
  test(
    'known alternative remains usable when the primary resolver fails',
    () async {
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          final ref = request.url.queryParameters['ref'];
          if (ref == '3isk:movie') {
            return http.Response('{"status":"unavailable"}', 503);
          }
          expect(ref, 'laroza:movie');
          return http.Response(jsonEncode(stream('laroza')), 200);
        }),
      );
      api.rememberIdentity(
        MediaItem.fromJson({
          ...item('3isk'),
          'source_refs': {'3isk': '3isk:movie', 'laroza': 'laroza:movie'},
        }),
      );
      final details = await api.resolvePlayback('3isk:movie');
      expect(details.mediaSources.single.providerId, 'laroza');
      expect(details.mediaPath, details.mediaSources.single.mediaPath);
      expect(api.cachedPlayback('3isk:movie')?.mediaPath, details.mediaPath);
      api.close();
    },
  );
  test(
    'matching episode numbers cannot join a different parent work',
    () async {
      final requests = <Uri>[];
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          requests.add(request.url);
          if (request.url.path == '/api/cinema/metadata') {
            return http.Response('{"status":"success"}', 200);
          }
          if (request.url.path == '/api/cinema/details') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'title': 'Example',
                'year': 2021,
                'audio_language': 'en',
                'edition': 'original',
                'episodes': [
                  {
                    'id': 'one',
                    'number': 1,
                    'season': 1,
                    'ref': '3isk:episode',
                  },
                ],
              }),
              200,
            );
          }
          if (request.url.path == '/v1/laroza/details') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': {
                  'title': 'A Different Show',
                  'year': 2021,
                  'audio_language': 'en',
                  'edition': 'original',
                  'episodes': [
                    {
                      'id': 'other',
                      'number': 1,
                      'season': 1,
                      'ref': 'laroza:episode',
                    },
                  ],
                },
              }),
              200,
            );
          }
          expect(request.url.queryParameters['ref'], '3isk:episode');
          return http.Response(jsonEncode(stream('3isk')), 200);
        }),
      );
      api.rememberIdentity(
        MediaItem.fromJson({
          ...item('3isk'),
          'type': 'series',
          'source_refs': {'3isk': '3isk:movie', 'laroza': 'laroza:movie'},
        }),
      );
      final details = await api.details('3isk:movie');
      expect(details.episodes, hasLength(1));
      final playback = await api.resolvePlayback('3isk:episode');
      expect(playback.mediaSources.single.providerId, '3isk');
      expect(requests.where((u) => u.path == '/v1/resolve'), hasLength(1));
      api.close();
    },
  );
  test('persisted favorites keep identity without tokens', () {
    final card = MediaItem.fromJson({
      ...item('3isk'),
      'source_refs': {'3isk': '3isk:movie', 'laroza': 'laroza:movie'},
      'url': 'https://media.example/signed.mp4?token=secret',
    });
    final persisted = jsonEncode(card.toJson());
    expect(persisted, isNot(contains('token=')));
    expect(
      MediaItem.fromJson(jsonDecode(persisted)).sourceRefs,
      card.sourceRefs,
    );
  });
}
