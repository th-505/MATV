import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test('a provider added only on the server can search, index and open its source work', () async {
    const id = 'future_source';
    const original = '$id:opaque-new-work';
    const work = 'source:$id:aaaaaaaaaaaaaaaaaaaaaaaa';
    final calls = <String>[];
    final api = MitvApi(
      client: MockClient((r) async {
        calls.add(r.url.path);
        Map<String, dynamic> data;
        switch (r.url.path) {
          case '/api/v1/explore/sources':
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': [
                  {
                    'id': id,
                    'search': true,
                    'name_ar': 'مصدر جديد',
                    'domain': 'future.example',
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          case '/api/v1/explore':
            expect(r.url.queryParameters['provider'], id);
            return http.Response(
              jsonEncode({
                'status': 'success',
                'items': [
                  {
                    'ref': original,
                    'title': 'عمل جديد',
                    'source': id,
                    'type': 'series',
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          case '/api/v1/harvest/request':
            expect(r.method, 'POST');
            expect(r.url.queryParameters['ref'], original);
            data = {'ref': work};
          case '/api/v1/harvest/status':
            data = {
              'state': 'ready',
              'source_editions': [
                {'ref': work, 'available': true},
              ],
            };
          case '/api/v1/harvest/work':
            data = {
              'ref': work,
              'provider': id,
              'title': 'عمل جديد',
              'source_index_authoritative': true,
              'type': 'series',
              'seasons': [
                {'season_number': 2},
              ],
              'episodes': [
                {
                  'ref': '$work:s2:e21',
                  'episode_number': 21,
                  'season_number': 2,
                  'watch_available': true,
                },
              ],
            };
          default:
            fail(
              'A new provider must not fall through to a legacy route: ${r.url.path}',
            );
        }
        return http.Response(
          jsonEncode({'status': 'success', 'data': data}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    addTearDown(api.close);
    expect(await api.explorationSources(), [id]);
    expect(api.explorationSourceLabel(id), 'مصدر جديد — future.example');
    final items = await api.explore('عمل', id);
    expect(items.single.ref, original);
    expect(api.canRequestHarvest(original), true);
    final details = await api.details(original);
    expect(details.title, 'عمل جديد');
    expect(details.episodes.single.number, 21);
    expect(details.episodes.single.season, 2);
    expect(calls, contains('/api/v1/harvest/work'));
  });
  test('dynamic references still reject controls, missing payload and excessive length', () {
    final api = MitvApi();
    addTearDown(api.close);
    for (final ref in [
      'https://example.com',
      'future:',
      'future:bad\nref',
      'future:${'x' * 1600}',
    ]) {
      expect(
        api.canRequestHarvest(ref),
        false,
        reason: ref.substring(0, ref.length.clamp(0, 30)),
      );
    }
  });
}
