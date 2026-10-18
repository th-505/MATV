import 'dart:convert';

import 'package:mitv/src/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response jsonResponse(Object value, [int statusCode = 200]) =>
    http.Response.bytes(
      utf8.encode(jsonEncode(value)),
      statusCode,
      headers: const {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  test('resolvePlayback registers direct backend-issued media and expiry',
      () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/api/cinema/details');
      expect(request.url.queryParameters['ref'], 'legacy:episode-1');
      return jsonResponse({
        'status': 'success',
        'movie_title': 'الحلقة 1',
        'episodes': const [],
        'media_path': 'https://video.example/movie.mp4',
        'media_type': 'mp4',
        'playback_mode': 'direct',
        'expires_at':
            DateTime.now().add(const Duration(minutes: 4)).toIso8601String(),
      });
    });
    final api =
        MitvApi(client: client, baseUri: Uri.parse('https://runtime.example'));
    final resolved = await api.resolvePlayback('legacy:episode-1');
    expect(resolved.mediaPath, 'https://video.example/movie.mp4');
    expect(
        api
            .mediaUri(resolved.mediaPath, playbackMode: resolved.playbackMode)
            .host,
        'video.example');
    expect(() => api.mediaUri('/api/cinema/media?id=old'),
        throwsA(isA<ApiException>()));
  });

  test('retired cloud video and private direct metadata are rejected',
      () async {
    for (final payload in [
      {'media_path': '/api/cinema/media?id=old', 'media_type': 'mp4'},
      {
        'media_path': 'https://127.0.0.1/private.mp4',
        'media_type': 'mp4',
        'playback_mode': 'direct',
        'expires_at':
            DateTime.now().add(const Duration(minutes: 4)).toIso8601String()
      },
    ]) {
      final api = MitvApi(
          client: MockClient(
              (_) async => jsonResponse({'status': 'success', ...payload})));
      await expectLater(
          api.resolvePlayback('legacy:fixture'), throwsA(isA<ApiException>()));
      api.close();
    }
  });

  test('edge movie resolution survives unavailable Render playback metadata',
      () async {
    final paths = <String>[];
    final expiry =
        DateTime.now().add(const Duration(minutes: 4)).toIso8601String();
    final api = MitvApi(
        useEdge: true,
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((request) async {
          paths.add(request.url.path);
          if (request.url.path == '/api/cinema/details') {
            return jsonResponse({
              'status': 'success',
              'movie_title': 'فيلم',
              'playback_unavailable': true,
              'playback_reason': 'EDGE_DIRECT_RESOLUTION_REQUIRED'
            });
          }
          return jsonResponse({
            'status': 'success',
            'schema_version': 1,
            'sources': [
              {
                'provider_id': '3isk',
                'provider': 'قصة عشق',
                'url': 'https://cdn.example/master.m3u8',
                'format': 'hls',
                'playback_mode': 'edge_direct',
                'expires_at': expiry,
                'headers': {}
              }
            ]
          });
        }));
    final details = await api.details('3isk:movie');
    expect(details.title, 'فيلم');
    expect(details.canPlay, true);
    expect(paths, ['/api/cinema/details', '/api/cinema/open', '/v1/resolve']);
    api.close();
  });

  test('playback extraction bypasses prefetched episode metadata', () async {
    var extracted = 0;
    final api = MitvApi(client: MockClient((req) async {
      if (req.url.path.endsWith('/metadata')) {
        return jsonResponse({
          'status': 'success',
          'episodes': [
            {'ref': 'alooy:episode', 'episode_number': 1}
          ]
        });
      }
      extracted++;
      return jsonResponse({
        'status': 'success',
        'media_path': 'https://vid1.ujeklsj.site/fresh.mp4',
        'media_type': 'mp4',
        'playback_mode': 'local_proxy',
        'expires_at':
            DateTime.now().add(const Duration(minutes: 4)).toIso8601String()
      });
    }));
    await api.prefetchMetadata('alooy:episode');
    expect(api.cachedMetadata('alooy:episode')?.hasEpisodes, true);
    expect((await api.resolvePlayback('alooy:episode')).mediaPath,
        'https://vid1.ujeklsj.site/fresh.mp4');
    expect(extracted, 1);
    api.close();
  });

  test('match logos are routed through the MITV runtime proxy', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/api/v1/matches');
      return jsonResponse({
        'status': 'success',
        'kind': 'matches',
        'data': [
          {
            'team1': {
              'name': 'الأول',
              'logo': 'https://kooorracity.com/wp-content/uploads/team-a.png'
            },
            'team2': {
              'name': 'الثاني',
              'logo': 'https://kooorracity.com/wp-content/uploads/team-b.png'
            },
            'time': '3:00 PM',
            'status': 'scheduled',
            'ref': 'opaque-match',
          }
        ],
      });
    });
    final api =
        MitvApi(client: client, baseUri: Uri.parse('https://runtime.example'));
    final item = (await api.matches()).single;
    final home = Uri.parse(item.homeLogo);
    final away = Uri.parse(item.awayLogo);
    expect(home.host, 'runtime.example');
    expect(home.path, '/api/matches/logo');
    expect(home.queryParameters['url'],
        'https://kooorracity.com/wp-content/uploads/team-a.png');
    expect(away.path, '/api/matches/logo');
    expect(away.queryParameters['url'],
        'https://kooorracity.com/wp-content/uploads/team-b.png');
  });

  test('catalog poster runtime paths are resolved against MITV API', () async {
    final client = MockClient((request) async => jsonResponse({
          'status': 'success',
          'kind': 'search',
          'data': [
            {
              'id': 'work-1',
              'title': 'عمل تجريبي',
              'poster': '/api/cinema/media?id=opaque-poster',
              'type': 'series',
              'ref': 'legacy:opaque-work',
              'year': 2026,
            }
          ],
        }));
    final api =
        MitvApi(client: client, baseUri: Uri.parse('https://runtime.example'));
    final result = await api.search('عمل');
    expect(result.single.poster,
        'https://runtime.example/api/cinema/media?id=opaque-poster');
    expect(result.single.year, 2026);
  });

  test('news stays behind MITV runtime and maps opaque refs', () async {
    final client = MockClient((request) async {
      expect(request.url.host, 'runtime.example');
      if (request.url.path == '/api/v1/news') {
        return jsonResponse({
          'status': 'success',
          'version': '1.0.5',
          'kind': 'news',
          'data': [
            {
              'id': 'opaque-news-1',
              'ref': 'opaque-news-1',
              'title': 'خبر تجريبي',
              'date': 'اليوم',
              'description': 'وصف'
            },
          ],
        });
      }
      expect(request.url.path, '/api/v1/news/article');
      expect(request.url.queryParameters['ref'], 'opaque-news-1');
      return jsonResponse({
        'status': 'success',
        'version': '1.0.5',
        'kind': 'news-article',
        'data': {
          'ref': 'opaque-news-1',
          'title': 'خبر تجريبي',
          'date': 'اليوم',
          'paragraphs': ['الفقرة الأولى']
        },
      });
    });
    final api =
        MitvApi(client: client, baseUri: Uri.parse('https://runtime.example'));
    final items = await api.news();
    expect(items.single.ref, 'opaque-news-1');
    final article = await api.newsArticle(items.single.ref);
    expect(article.paragraphs, ['الفقرة الأولى']);
    expect(article.ref, isNot(contains('http')));
  });

  test('mediaUri rejects arbitrary upstream urls', () {
    final api = MitvApi(baseUri: Uri.parse('https://runtime.example'));
    expect(
      () => api.mediaUri('https://evil.example/video.mp4'),
      throwsA(isA<ApiException>()),
    );
    api.close();
  });

  test('resolvePlayback fails closed when details contain no playable media',
      () async {
    final client = MockClient((request) async => jsonResponse({
          'status': 'success',
          'movie_title': 'غير متاح',
          'episodes': const [],
          'playback_unavailable': true,
          'playback_reason': 'NO_PLAYABLE_MEDIA',
        }));
    final api =
        MitvApi(client: client, baseUri: Uri.parse('https://runtime.example'));
    await expectLater(
      api.resolvePlayback('legacy:unavailable'),
      throwsA(predicate((error) =>
          error is ApiException && error.code == 'NO_PLAYABLE_MEDIA')),
    );
  });
}
