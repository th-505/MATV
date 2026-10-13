import 'dart:async';
import 'dart:convert';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/media_format_policy.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PagedApi extends MitvApi {
  final pages = <int>[];
  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    pages.add(page);
    if (page == 3) return [];
    return List.generate(
        2,
        (i) => CatalogItem(
            id: '$page-$i',
            ref: 'legacy:$page-$i',
            title: 'عمل $page-$i',
            poster: '',
            type: 'movie'));
  }

  @override
  Future<void> prefetchMetadata(String ref) async {}
}

void main() {
  test('direct Akoam media retains source headers and rejects unrelated hosts',
      () {
    final expiry = DateTime.now().add(const Duration(minutes: 5));
    final api = MitvApi();
    expect(
        api
            .mediaUri('https://s201d1.downet.net/media/file.mkv',
                playbackMode: 'direct', expiresAt: expiry)
            .host,
        's201d1.downet.net');
    expect(
        () => api.mediaUri('https://s201d1.downet.net.evil.test/media/file.mp4',
            playbackMode: 'direct', expiresAt: expiry),
        throwsA(isA<ApiException>()));
    final source = PlaybackSource.fromJson({
      'media_path': 'https://s201d1.downet.net/media/file.mkv',
      'media_type': 'matroska',
      'playback_mode': 'direct',
      'headers': {
        'Referer': 'https://akwam.ss/watch/fixture',
        'User-Agent': 'UA',
        'Cookie': 'secret'
      }
    });
    expect(source.playbackMode, 'direct');
    expect(source.headers.keys, containsAll(['Referer', 'User-Agent']));
    expect(source.headers.containsKey('Cookie'), false);
    api.close();
  });
  test('container routing keeps native common formats and expands four others',
      () {
    expect(usesExtendedMediaEngine('m3u8', '/api/cinema/media'), false);
    expect(usesExtendedMediaEngine('mp4', '/api/cinema/media'), false);
    for (final kind in [
      'matroska',
      'matroska-webm',
      'webm',
      'dash',
      'mpeg-ts'
    ]) {
      expect(usesExtendedMediaEngine(kind, '/api/cinema/media'), true);
    }
    expect(usesExtendedMediaEngine('unknown', '/movie.MKV'), true);
  });
  testWidgets(
      'short catalog pages fill viewport and reach next page without a 30-item assumption',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = PagedApi();
    final store = await LocalLibraryStore.create();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: CatalogPage(
                api: api,
                store: store,
                title: 'أفلام',
                categoryId: 'movie-foreign'))));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(api.pages, containsAll([1, 2]));
    await tester.drag(find.byType(GridView), const Offset(0, -700));
    await tester.pumpAndSettle();
    expect(api.pages, [1, 2, 3]);
    expect(find.text('عمل 2-0'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
  test('prefetch coalesces requests, caps concurrency and never resolves video',
      () async {
    final pending = <Completer<http.Response>>[];
    final api = MitvApi(client: MockClient((request) {
      expect(request.url.path, '/api/cinema/metadata');
      final complete = Completer<http.Response>();
      pending.add(complete);
      return complete.future;
    }));
    final one = api.prefetchMetadata('legacy:one');
    final duplicate = api.prefetchMetadata('legacy:one');
    final two = api.prefetchMetadata('legacy:two');
    await api.prefetchMetadata('legacy:three');
    await Future<void>.delayed(Duration.zero);
    expect(pending.length, 2);
    for (final complete in pending) {
      complete.complete(http.Response(
          jsonEncode(
              {'status': 'success', 'movie_title': 'تجربة', 'episodes': []}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'}));
    }
    await Future.wait([one, duplicate, two]);
    expect(api.cachedMetadata('legacy:one')!.title, 'تجربة');
    await api.prefetchMetadata('legacy:one');
    expect(pending.length, 2);
    api.close();
  });
}
