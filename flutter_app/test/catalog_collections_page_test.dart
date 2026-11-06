import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/catalog_collections_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';

class _Api extends MitvApi {
  final calls = <String>[];
  @override
  Future<List<CatalogItem>> category(String id, {int page = 1}) async {
    calls.add(id);
    return [
      CatalogItem(
        id: '1',
        ref: 'tmdb:movie:1',
        title: 'عمل',
        poster: '',
        type: 'movie',
      ),
    ];
  }
}

void main() {
  testWidgets(
    'collection feed keeps local shelves first and lazily fetches visible ranked collections',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = _Api();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: CatalogCollectionsPage(
                api: api,
                store: store,
                group: 'movie',
                onItem: (_) {},
                onMore: (_, _) {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('متابعة المشاهدة'), findsOneWidget);
      expect(find.text('قائمتي'), findsOneWidget);
      expect(api.calls.first, 'catalog:collection:movie-top');
      expect(api.calls.length, lessThan(6));
      expect(api.calls, isNot(contains('catalog:collection:movie-53')));
      expect(tester.takeException(), isNull);
    },
  );
}
