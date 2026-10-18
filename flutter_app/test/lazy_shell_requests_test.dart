import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RequestCountingApi extends MitvApi {
  int matchesRequests = 0;
  int newsRequests = 0;
  int closeCalls = 0;
  final categoryRequests = <String>[];
  Future<List<MatchItem>> Function(int request)? matchesResponse;

  @override
  Future<List<MatchItem>> matches() {
    matchesRequests++;
    return matchesResponse?.call(matchesRequests) ?? Future.value([]);
  }

  @override
  Future<List<NewsItem>> news() async {
    newsRequests++;
    return [];
  }

  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    categoryRequests.add('$categoryId:$page');
    return [];
  }

  @override
  void close() {
    closeCalls++;
    super.close();
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('only selected sections request data and revisits preserve state',
      (tester) async {
    final api = _RequestCountingApi();
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(home: Shell(store: store, api: api)));
    await tester.pumpAndSettle();

    expect(api.matchesRequests, 0);
    expect(api.newsRequests, 0);
    expect(api.categoryRequests, ['3isk-latest:1']);
    expect(find.byType(CatalogPage, skipOffstage: false), findsNothing);

    await tester.tap(find.text('الأفلام'));
    await tester.pumpAndSettle();
    expect(api.categoryRequests, ['3isk-latest:1', 'browse-movies:1']);
    final cinemaState = tester.state(find.byType(CatalogPage));

    await tester.tap(find.text('الإعدادات'));
    await tester.pumpAndSettle();
    expect(api.matchesRequests, 0);
    expect(api.newsRequests, 0);

    await tester.tap(find.text('الأفلام'));
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(CatalogPage)), same(cinemaState));
    expect(api.categoryRequests, ['3isk-latest:1', 'browse-movies:1']);

    await tester.tap(find.text('المباشر'));
    await tester.pumpAndSettle();
    expect(api.matchesRequests, 1);
    await tester.tap(find.text('الرئيسية'));
    await tester.pumpAndSettle();
    expect(api.matchesRequests, 1);
    expect(api.categoryRequests, ['3isk-latest:1', 'browse-movies:1']);
    expect(api.newsRequests, 0);
    expect(find.text('الأخبار'), findsNothing);

    await tester.tap(find.text('المسلسلات'));
    await tester.pumpAndSettle();
    expect(api.categoryRequests.last, 'browse-series:1');
    await tester.tap(find.text('الأنمي'));
    await tester.pumpAndSettle();
    expect(api.categoryRequests.last, 'browse-anime:1');
    expect(api.categoryRequests.length, 4);
    await tester.tap(find.text('المسلسلات'));
    await tester.pumpAndSettle();
    expect(api.categoryRequests.length, 4);

    await tester.pumpWidget(const SizedBox());
    expect(api.closeCalls, 0,
        reason: 'the injected client belongs to its caller');
  });

  testWidgets('match requests survive parent rebuilds while pending and ready',
      (tester) async {
    final api = _RequestCountingApi();
    final pending = Completer<List<MatchItem>>();
    api.matchesResponse = (_) => pending.future;
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);

    Widget page() =>
        MaterialApp(home: Scaffold(body: MatchesPage(api: api, store: store)));
    await tester.pumpWidget(page());
    await tester.pumpWidget(page());
    expect(api.matchesRequests, 1);

    pending.complete([]);
    await tester.pumpAndSettle();
    await tester.pumpWidget(page());
    await tester.pumpAndSettle();
    expect(api.matchesRequests, 1);
    expect(find.text('لا توجد مباريات متاحة الآن'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('match refresh is explicit and recovers a failed cached request',
      (tester) async {
    final api = _RequestCountingApi();
    api.matchesResponse = (request) => request == 1
        ? Future.error(const ApiException('FIXTURE_NETWORK_FAILURE'))
        : Future.value([]);
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MatchesPage(api: api, store: store))));
    await tester.pumpAndSettle();
    expect(find.text('تعذر تحميل المباريات حاليًا'), findsOneWidget);
    expect(api.matchesRequests, 1);

    await tester.tap(find.byKey(const Key('matches-refresh')));
    await tester.pumpAndSettle();
    expect(api.matchesRequests, 2);
    expect(find.text('لا توجد مباريات متاحة الآن'), findsOneWidget);
    await tester.pump(const Duration(minutes: 1));
    expect(api.matchesRequests, 2,
        reason: 'no background polling or retry loop');
    await tester.pumpWidget(const SizedBox());
  });
}
