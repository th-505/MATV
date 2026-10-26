import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test(
    'canonical catalogue, season metadata and exact episode playback share one backend',
    () async {
      final calls = <Uri>[];
      final api = MitvApi(
        baseUri: Uri.parse('https://api.example'),
        useEdge: false,
        client: MockClient((request) async {
          calls.add(request.url);
          final path = request.url.path;
          Map<String, dynamic> body;
          if (path == '/api/v1/catalog') {
            expect(request.url.queryParameters['ref'], 'catalog:tv:all');
            body = {
              'status': 'success',
              'has_more': false,
              'data': [
                {
                  'id': 'tmdb:tv:1',
                  'ref': 'tmdb:tv:1',
                  'title': 'Example',
                  'type': 'series',
                  'source': 'tmdb',
                  'year': 2026,
                },
              ],
            };
          } else if (path == '/api/v1/tmdb/details') {
            expect(request.url.queryParameters['ref'], 'tmdb:tv:1');
            body = {
              'status': 'success',
              'data': {
                'title': 'Example',
                'overview': 'Story',
                'year': 2026,
                'seasons': [
                  {'season_number': 2},
                ],
              },
            };
          } else if (path == '/api/v1/tmdb/season') {
            expect(request.url.queryParameters['season'], '2');
            body = {
              'status': 'success',
              'data': {
                'episodes': [
                  {
                    'episode_number': 4,
                    'season_number': 2,
                    'title': 'Episode four',
                    'ref': 'tmdb:tv:1:s2:e4',
                  },
                ],
              },
            };
          } else if (path == '/api/v1/discovery/start') {
            expect(request.method, 'POST');
            expect(request.url.queryParameters['season'], '2');
            expect(request.url.queryParameters['episode'], '4');
            body = {
              'status': 'accepted',
              'data': {
                'state': 'ready',
                'result': {
                  'servers': [
                    {
                      'url': 'https://cdn.example/video.m3u8',
                      'headers': {},
                      'kind': 'direct',
                    },
                  ],
                },
              },
            };
          } else {
            throw StateError('Unexpected request $path');
          }
          return http.Response(
            jsonEncode(body),
            path.endsWith('/start') ? 202 : 200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      addTearDown(api.close);
      final rows = await api.category('catalog:tv:all');
      expect(rows.single.ref, 'tmdb:tv:1');
      expect(api.categoryHasMore('catalog:tv:all', 1), false);
      final details = await api.details('tmdb:tv:1:s2:e4');
      expect(details.plot, 'Story');
      expect(details.availableSeasons, [2]);
      expect(details.episodes.single.season, 2);
      expect(details.episodes.single.number, 4);
      final playback = await api.resolvePlayback('tmdb:tv:1:s2:e4');
      expect(playback.mediaType, 'm3u8');
      expect(playback.mediaSources.single.mediaType, 'm3u8');
      expect(playback.hasDirectMedia, true);
      expect(calls.every((uri) => uri.host == 'api.example'), true);
    },
  );
}
