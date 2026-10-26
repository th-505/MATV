import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test(
    'search exposes a support ID and sends an anonymous session/platform',
    () async {
      final api = MitvApi(
        client: MockClient((request) async {
          expect(request.url.queryParameters['q'], 'مرعشلي');
          expect(request.url.queryParameters['provider'], '3isk');
          expect(
            request.url.queryParameters['diagnostic_session'],
            matches(r'^[a-f0-9]{24}$'),
          );
          expect(request.url.queryParameters['platform'], isNotEmpty);
          return http.Response(
            jsonEncode({'status': 'error'}),
            503,
            headers: {'x-trace-id': 'test-support-id'},
          );
        }),
      );
      addTearDown(api.close);
      await expectLater(
        api.explore('مرعشلي', '3isk'),
        throwsA(isA<ApiException>()),
      );
      expect(api.lastSearchTrace, 'test-support-id');
      expect(api.lastSearchStage, 'http_503');
    },
  );
  test(
    'connection failure is distinct from a server reply and never invents a support ID',
    () async {
      final api = MitvApi(
        client: MockClient((_) async => throw http.ClientException('offline')),
      );
      addTearDown(api.close);
      await expectLater(
        api.explore('مرعشلي', '3isk'),
        throwsA(isA<http.ClientException>()),
      );
      expect(api.lastSearchTrace, isNull);
      expect(api.lastSearchStage, 'client_no_response');
    },
  );
  test('source display name and domain come from the server', () async {
    final api = MitvApi(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'success',
            'data': [
              {
                'id': '3isk',
                'search': true,
                'name_ar': 'قصة عشق',
                'domain': '3isk.example',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    addTearDown(api.close);
    expect(await api.explorationSources(), ['3isk']);
    expect(api.explorationSourceLabel('3isk'), 'قصة عشق — 3isk.example');
  });
}
