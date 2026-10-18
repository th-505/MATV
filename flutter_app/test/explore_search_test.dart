import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/models.dart';

void main() {
  test('source metadata labels never replace query, provider or reference', () async {
    final api = MitvApi(client: MockClient((request) async {
      if (request.url.path.endsWith('/providers')) {
        return http.Response(jsonEncode({'status': 'success', 'data': [
          {'id': 'akwam', 'displayName': 'ذكوام', 'aliases': ['akoam'], 'domains': []},
          {'id': 'future', 'displayName': 'thuture', 'aliases': [], 'domains': []},
        ]}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      expect(request.url.queryParameters, {'q': 'العمل', 'provider': 'akwam'});
      return http.Response(jsonEncode({'status': 'no_results', 'data': []}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    }), baseUri: Uri.parse('https://runtime.example'));
    final providers = await api.searchProviders();
    expect(providers.last['displayName'], 'thuture');
    const item = CatalogItem(id: 'akoam:1', title: 'عمل', poster: '', type: 'movie', ref: 'akoam:1', source: 'akwam');
    expect(api.sourceDisplayLabel(item), 'ذكوام');
    expect(api.sourceDisplayLabel(item), 'ذكوام');
    expect(item.source, 'akwam');
    expect(item.ref, 'akoam:1');
    expect(await api.search(' العمل ', providerId: 'akwam'), isEmpty);
    api.close();
  });

  test('unsupported search is distinct from unavailable source', () async {
    for (final status in [422, 503]) {
      final api = MitvApi(client: MockClient((_) async => http.Response('{}', status)));
      await expectLater(api.search('عمل', providerId: 'source'),
          throwsA(predicate((e) => e.toString().contains(status == 422 ? 'SEARCH_UNSUPPORTED' : 'HTTP 503'))));
      api.close();
    }
  });
}
