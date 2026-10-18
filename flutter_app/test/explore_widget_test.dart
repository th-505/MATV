import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

const savedItem = CatalogItem(id: 'akoam:saved', ref: 'akoam:saved',
    title: 'Saved fixture', poster: '', type: 'movie', source: 'akwam');
http.Response metadataResponse() => http.Response(jsonEncode({
  'status': 'success', 'data': [
    {'id': 'akwam', 'displayName': 'ذكوام (ذkwam)', 'aliases': ['akoam'], 'domains': []},
    {'id': 'future', 'displayName': 'thuture', 'aliases': [], 'domains': []},
  ],
}), 200, headers: {'content-type': 'application/json; charset=utf-8'});

class ExploreApi extends MitvApi {
  ExploreApi(http.Client client) : super(client: client, useEdge: false);
  final requests = <({String query, String provider, Completer<List<CatalogItem>> result})>[];
  final detailRefs = <String>[];
  @override
  Future<List<CatalogItem>> search(String query, {String providerId = ''}) {
    final result = Completer<List<CatalogItem>>();
    requests.add((query: query, provider: providerId, result: result));
    return result.future;
  }
  @override
  Future<void> prefetchMetadata(String ref) async {}
  @override
  Future<TitleDetails> details(String ref) async {
    detailRefs.add(ref);
    return const TitleDetails(title: 'Saved fixture', poster: '', episodes: [],
        mediaPath: '', mediaType: '', playbackUnavailable: true, playbackReason: 'fixture');
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('search switches source and rejects late results after edits and clearing', (tester) async {
    final store = await LocalLibraryStore.create();
    final api = ExploreApi(MockClient((_) async => metadataResponse()));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SearchPage(api: api, store: store))));
    await tester.pumpAndSettle();
    final input = find.byType(TextField);
    await tester.enterText(input, 'first');
    await tester.pump(const Duration(milliseconds: 500));
    expect(api.requests.single.provider, '');
    expect(find.text('جارٍ البحث…'), findsOneWidget);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('ذكوام (ذkwam)').last);
    await tester.pump(const Duration(milliseconds: 300));
    expect(api.requests.last.provider, 'akwam');
    api.requests.last.result.complete([savedItem]);
    await tester.pump();
    expect(find.text('Saved fixture'), findsOneWidget);
    api.requests.first.result.complete([savedItem.copyWith(title: 'Late old source')]);
    await tester.pump();
    expect(find.text('Late old source'), findsNothing);
    expect(find.text('Saved fixture'), findsOneWidget);

    await tester.enterText(input, 'second');
    await tester.pump(const Duration(milliseconds: 500));
    final old = api.requests.last;
    await tester.enterText(input, 'x'); // below debounce threshold: no replacement request
    old.result.complete([savedItem.copyWith(title: 'Late edited query')]);
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Late edited query'), findsNothing);
    expect(find.text('جارٍ البحث…'), findsNothing);
    await tester.enterText(input, 'third');
    await tester.pump(const Duration(milliseconds: 500));
    final cleared = api.requests.last;
    await tester.enterText(input, '');
    cleared.result.complete([savedItem.copyWith(title: 'Late cleared query')]);
    await tester.pump();
    expect(find.text('Late cleared query'), findsNothing);
    expect(find.text('جارٍ البحث…'), findsNothing);

    await tester.enterText(input, 'fourth');
    await tester.pump(const Duration(milliseconds: 500));
    final disposed = api.requests.last;
    await tester.pumpWidget(const MaterialApp(home: Text('Elsewhere')));
    disposed.result.complete([savedItem]);
    await tester.pump();
    expect(find.text('Elsewhere'), findsOneWidget);
    expect(tester.takeException(), isNull);
    api.close(); store.dispose();
  });

  testWidgets('source picker retries metadata without reloading the app', (tester) async {
    final store = await LocalLibraryStore.create();
    var calls = 0;
    final retry = Completer<http.Response>();
    final api = ExploreApi(MockClient((_) {
      ++calls;
      return calls == 1 ? Future.value(http.Response('{}', 503)) : retry.future;
    }));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SearchPage(api: api, store: store))));
    await tester.pumpAndSettle();
    expect(calls, 1);
    await tester.tap(find.text('تعذر تحميل المصادر — إعادة المحاولة'));
    await tester.pump();
    expect(calls, 2);
    // Another consumer joins the retry instead of creating a third HTTP request.
    final joined = api.searchProviders();
    expect(calls, 2);
    retry.complete(metadataResponse());
    await joined;
    await tester.pumpAndSettle();
    expect(find.text('تعذر تحميل المصادر — إعادة المحاولة'), findsNothing);
    final picker = tester.widget<DropdownButton<String>>(find.byType(DropdownButton<String>));
    expect(picker.items!.map((item) => item.value).toList(), ['', 'akwam', 'future']);
    await tester.pumpWidget(const SizedBox());
    api.close(); store.dispose();
  });

  for (final failFirst in [false, true]) {
    testWidgets('favorite details load source without visiting explore; retry=$failFirst', (tester) async {
      final store = await LocalLibraryStore.create();
      await store.toggleFavorite(savedItem);
      var calls = 0;
      final first = Completer<http.Response>();
      final second = Completer<http.Response>();
      final api = ExploreApi(MockClient((request) {
        expect(request.url.path, '/api/v1/search/providers');
        ++calls;
        return calls == 1 ? first.future : second.future;
      }));
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: LibraryPage(api: api, store: store))));
      // The downloads section has its own ongoing loader. Wait for the favorite
      // entry we exercise, rather than requiring every unrelated animation to stop.
      await tester.pump();
      expect(find.text('Saved fixture'), findsOneWidget);
      expect(calls, 0); // no visit to SearchPage or prior metadata request
      await tester.tap(find.text('Saved fixture'));
      await tester.pump(); // attach the pushed route before advancing its transition
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(DetailsPage), findsOneWidget);
      expect(calls, 1);
      // An independent simultaneous consumer shares the details request.
      final concurrent = api.searchProviders();
      expect(calls, 1);
      if (failFirst) {
        final failure = expectLater(concurrent, throwsA(isA<ApiException>()));
        first.complete(http.Response('{}', 503));
        await tester.pump(); await failure;
        expect(find.byTooltip('إعادة محاولة تحميل المصادر'), findsOneWidget);
        await tester.tap(find.byTooltip('إعادة محاولة تحميل المصادر'));
        await tester.pump();
        expect(calls, 2);
        expect(find.byTooltip('إعادة محاولة تحميل المصادر'), findsNothing);
        second.complete(metadataResponse());
      } else {
        first.complete(metadataResponse());
        await concurrent;
      }
      await tester.pumpAndSettle();
      expect(find.text('Saved fixture • ذكوام (ذkwam)'), findsOneWidget);
      expect(api.detailRefs, ['akoam:saved']);
      expect(savedItem.source, 'akwam');
      expect(savedItem.ref, 'akoam:saved');
      await api.searchProviders();
      expect(calls, failFirst ? 2 : 1); // successful metadata remains shared/cached
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      api.close(); store.dispose();
    });
  }
}
