import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/stitch_design.dart';
import 'package:shared_preferences/shared_preferences.dart';

CatalogItem result(String source, int number) => CatalogItem(
  id: '$source-$number',
  ref: '$source:actual-$number',
  source: source,
  title: 'مسلسل العمل الحلقة $number مترجمة',
  poster: '',
  type: 'series',
  year: 2024,
);

class GroupApi extends MitvApi {
  final later = Completer<List<CatalogItem>>();
  @override
  Future<List<String>> explorationSources() async => ['fosta', 'mycima'];
  @override
  Future<List<CatalogItem>> explore(String query, String provider) async =>
      provider == 'fosta'
      ? [result('fosta', 21), result('fosta', 22)]
      : later.future;
  @override
  Future<Map<String, dynamic>> requestHarvest(
    String ref, {
    String reason = 'card_open',
  }) async => {};
  @override
  Future<TitleDetails> details(String ref) async => const TitleDetails(
    title: 'اسم المصدر',
    poster: '',
    plot: 'قصة المصدر',
    episodes: [],
    mediaPath: '',
    mediaType: '',
    playbackUnavailable: true,
    playbackReason: '',
  );
}

void main() {
  testWidgets(
    'grouped poster retains a provider arriving after details opens',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = GroupApi();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SearchPage(api: api, store: store),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('search-advanced-toggle')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'العمل');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      expect(find.byType(NajdWorkCard), findsOneWidget);
      await tester.tap(find.byType(NajdWorkCard));
      await tester.pumpAndSettle();
      expect(find.text('قصة المصدر'), findsOneWidget);
      api.later.complete([result('mycima', 1)]);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('title-providers')));
      await tester.pumpAndSettle();
      expect(find.text('fosta'), findsOneWidget);
      expect(find.text('mycima'), findsOneWidget);
      await tester.tap(find.text('fosta'));
      await tester.pumpAndSettle();
      expect(find.text('مسلسل العمل الحلقة 21 مترجمة'), findsWidgets);
      expect(find.text('مسلسل العمل الحلقة 22 مترجمة'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      api.close();
      store.dispose();
    },
  );
}
