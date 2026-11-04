import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  const ref = 'source:ahwak:aaaaaaaaaaaaaaaaaaaaaaaa';
  test(
    'refresh waits for a new ready index and reads only the selected season',
    () async {
      var polls = 0;
      final paths = <String>[];
      final api = MitvApi(
        sourcePollInterval: Duration.zero,
        client: MockClient((r) async {
          paths.add(r.url.path);
          expect(r.url.queryParameters['ref'], ref);
          Map<String, dynamic> data;
          if (r.url.path.endsWith('/request')) {
            expect(r.url.queryParameters['reason'], 'source_refresh');
            data = {'requested_at': '2026-11-04T12:00:00Z'};
          } else if (r.url.path.endsWith('/status')) {
            polls++;
            data = {
              'index_state': polls == 2 ? 'queued' : 'ready',
              'index_updated_at': polls < 3
                  ? '2026-11-04T11:00:00Z'
                  : '2026-11-04T12:00:01Z',
            };
          } else {
            expect(polls, 3);
            expect(r.url.queryParameters['season'], '5');
            data = {
              'ref': ref,
              'source_title': 'عمل المصدر',
              'episodes': [],
              'season_number': 5,
            };
          }
          return http.Response(
            jsonEncode({'status': 'success', 'data': data}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      addTearDown(api.close);
      final result = await api.refreshSourceIndex(ref, season: 5);
      expect(result['ref'], ref);
      expect(paths.where((p) => p.endsWith('/work')).length, 1);
      expect(paths.every((p) => p.startsWith('/api/v1/harvest/')), true);
      await expectLater(
        api.refreshSourceIndex('tmdb:tv:123'),
        throwsA(isA<ApiException>()),
      );
    },
  );
}
