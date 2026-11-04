import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/provider_browser_page.dart';

class TwentySources extends MitvApi {
  final started = <String>[];
  final gates = <String, Completer<List<CatalogItem>>>{};
  @override
  Future<List<CatalogItem>> explore(String q, String p) {
    started.add(p);
    return (gates[p] = Completer()).future;
  }
}

void main() {
  test(
    'twenty searches begin before the slowest or first source finishes',
    () async {
      final api = TwentySources();
      addTearDown(api.close);
      final ids = List.generate(20, (i) => 'source_$i');
      final updates = <List<CatalogItem>>[];
      final result = api.exploreParallel(
        'اختبار',
        providers: ids,
        onResults: updates.add,
      );
      await Future<void>.delayed(Duration.zero);
      expect(api.started, ids);
      api.gates[ids.last]!.complete([
        CatalogItem(
          id: 'last',
          title: 'نتيجة سريعة',
          poster: '',
          type: 'movie',
          ref: 'source_19:work',
        ),
      ]);
      await Future<void>.delayed(Duration.zero);
      expect(updates.single.single.id, 'last');
      for (final id in ids.take(19)) {
        api.gates[id]!.complete([]);
      }
      expect((await result).single.id, 'last');
    },
  );
  test('actual provider rating payloads cannot discard the catalogue', () {
    for (final value in ['', '5.0', '8.5', null, 8.1, 'NaN', 'Infinity']) {
      final item = CatalogItem.fromJson({
        'id': 'x',
        'ref': 'ahwak:x',
        'title': 'عمل',
        'rating': value,
      });
      expect(item.rating.isFinite, true);
      expect(item.rating, inInclusiveRange(0, 10));
    }
    expect(CatalogItem.fromJson({'rating': '8.5'}).rating, 8.5);
  });
  testWidgets(
    'browser chooses explicitly and restores its own provider without changing global search preference',
    (tester) async {
      SharedPreferences.setMockInitialValues({'search.source.v1': 'tmdb'});
      final store = await LocalLibraryStore.create();
      final providers = <String>[];
      final api = MitvApi(
        client: MockClient((r) async {
          dynamic body;
          if (r.url.path.endsWith('/sources')) {
            body = {
              'status': 'success',
              'data': [
                {'id': 'mycima', 'name': 'ماي سيما', 'categories': []},
                {'id': 'ahwak', 'name': 'أهواك', 'categories': []},
              ],
            };
          } else {
            providers.add(r.url.queryParameters['provider']!);
            body = {
              'status': 'success',
              'items': [
                {
                  'id': 'one',
                  'ref': 'ahwak:one',
                  'title': 'عمل أهواك',
                  'rating': '8.5',
                  'poster': '',
                  'type': 'movie',
                },
              ],
              'pagination': {'has_more': false},
            };
          }
          return http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ProviderBrowserPage(api: api, store: store),
        ),
      );
      await tester.pumpAndSettle();
      expect(providers, isEmpty);
      expect(find.text('اختر المزود لتصفح أقسامه وأعماله'), findsOneWidget);
      await tester.tap(find.text('اختر المزود'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('أهواك'));
      await tester.pumpAndSettle();
      expect(providers, ['ahwak']);
      expect(find.text('عمل أهواك'), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('search.source.v1'), 'tmdb');
      expect(
        jsonDecode(
          prefs.getString('provider.browser.selection.v1')!,
        )['provider'],
        'ahwak',
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      await tester.pumpWidget(
        MaterialApp(
          home: ProviderBrowserPage(api: api, store: store),
        ),
      );
      await tester.pumpAndSettle();
      expect(providers, ['ahwak', 'ahwak']);
      expect(find.text('عمل أهواك'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      api.close();
      store.dispose();
    },
  );
}
