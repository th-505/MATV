import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test(
    'display localization uses base TMDB identity and explicit language',
    () async {
      final api = MitvApi(
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/tmdb/details');
          expect(request.url.queryParameters['ref'], 'tmdb:tv:42');
          expect(request.url.queryParameters['language'], 'en-US');
          return http.Response(
            jsonEncode({
              'status': 'success',
              'data': {
                'title': 'Original title',
                'overview': 'English story',
                'director_people': [
                  {
                    'id': 7,
                    'name': 'Director',
                    'photo': 'https://image.tmdb.org/t/p/w185/a.jpg',
                  },
                ],
              },
            }),
            200,
          );
        }),
      );
      addTearDown(api.close);
      final display = await api.localizedMetadata('tmdb:tv:42:s2:e1', 'en');
      expect(display.title, 'Original title');
      expect(display.plot, 'English story');
      expect(display.directorPeople.single['id'], 7);
      expect(display.episodes, isEmpty);
      await expectLater(
        api.localizedMetadata('source:actual:s1:e21', 'en'),
        throwsA(isA<ApiException>()),
      );
    },
  );
}
