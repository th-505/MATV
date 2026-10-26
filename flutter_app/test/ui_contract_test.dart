import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/ui_contract.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SearchApi extends MitvApi {
  int sourceCalls = 0;
  final searches = <String>[];
  final explorations = <String>[];
  @override
  Future<List<String>> explorationSources() async {
    sourceCalls++;
    return ['akwam', 'mycima'];
  }

  @override
  Future<List<CatalogItem>> searchTmdb(String query) async {
    searches.add(query);
    return [];
  }

  @override
  Future<List<CatalogItem>> explore(String query, String source) async {
    explorations.add('$source:$query');
    return [];
  }
}

void main() {
  test(
    'web and shared Flutter targets use the same product navigation and colors',
    () {
      expect(TatvUi.brand, 'T-A-TV');
      expect(TatvUi.pageIds, [
        'home',
        'movies',
        'series',
        'anime',
        'turkish',
        'search',
        'live',
        'favorites',
        'settings',
      ]);
      expect(TatvUi.labels.length, TatvUi.pageIds.length);
      expect(TatvUi.icons.length, TatvUi.pageIds.length);
      expect(TatvUi.sidebarBreakpoint, 900);
      expect(TatvUi.background, const Color(0xFF07090B));
      expect(TatvUi.surface, const Color(0xFF0D1117));
      expect(TatvUi.accent, const Color(0xFFE8BD75));
    },
  );
  testWidgets(
    'advanced search is opt-in within search and uses only the selected source',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = _SearchApi();
      addTearDown(store.dispose);
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SearchPage(api: api, store: store),
          ),
        ),
      );
      expect(api.sourceCalls, 0);
      expect(find.byKey(const Key('search-explore-source')), findsNothing);
      await tester.enterText(find.byType(TextField), 'Example');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.searches, ['Example']);
      await tester.tap(find.byKey(const Key('search-advanced-toggle')));
      await tester.pumpAndSettle();
      expect(api.sourceCalls, 1);
      await tester.tap(find.byKey(const Key('search-explore-source')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('akwam').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('search-submit')));
      await tester.pumpAndSettle();
      expect(api.explorations, ['akwam:Example']);
      expect(api.searches.length, 1);
      await tester.tap(find.byKey(const Key('search-advanced-toggle')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('search-explore-source')), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
