import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

MediaItem work(String provider,
        {String title = 'Inception',
        String type = 'movie',
        List<String> genres = const []}) =>
    MediaItem(
        id: '$provider:film',
        title: title,
        poster: '',
        type: type,
        ref: '$provider:film',
        year: 2010,
        audioLanguage: 'en',
        edition: 'original',
        genres: genres);

class _PagedUnifiedApi extends MitvApi {
  _PagedUnifiedApi(this.pages, this.more);
  final Map<int, List<MediaItem>> pages;
  final Map<int, bool> more;
  final requests = <int>[];
  MediaItem? remembered;
  @override
  Future<List<MediaItem>> category(String categoryId, {int page = 1}) async {
    requests.add(page);
    return pages[page] ?? [];
  }

  @override
  bool? categoryHasMore(String categoryId, int page) => more[page];
  @override
  void rememberIdentity(MediaItem item) {
    remembered = item;
    super.rememberIdentity(item);
  }

  @override
  Future<void> prefetchMetadata(String ref) async {}
  @override
  Future<TitleDetails> details(String ref) async => const TitleDetails(
      title: 'Inception',
      poster: '',
      episodes: [],
      mediaPath: '',
      mediaType: '',
      playbackUnavailable: true,
      playbackReason: 'FIXTURE_METADATA_ONLY');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
      'pages merge proven same-work cards and opening preserves sources',
      (tester) async {
    final api = _PagedUnifiedApi({
      1: [work('akoam', title: 'Inception 1080p')],
      2: [work('laroza', title: 'Inception مترجم')],
      3: []
    }, {
      1: true,
      2: true,
      3: false
    });
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: CatalogPage(
                api: api,
                store: store,
                title: 'الأفلام',
                categoryId: 'movie-foreign',
                mediaKind: 'movie',
                unified: true))));
    await tester.pumpAndSettle();
    expect(api.requests, [1, 2]);
    expect(find.text('Inception 1080p'), findsOneWidget);
    expect(find.text('Inception مترجم'), findsNothing);
    expect(find.text('عرض الصفحة التالية'), findsOneWidget);
    await tester.tap(find.text('Inception 1080p'));
    await tester.pumpAndSettle();
    expect(find.byType(DetailsPage), findsOneWidget);
    expect(api.remembered!.sourceRefs,
        {'akoam': 'akoam:film', 'laroza': 'laroza:film'});
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'empty filtered and provider-rotation pages need explicit continuation',
      (tester) async {
    final api = _PagedUnifiedApi({
      1: [work('akoam', title: 'برنامج', type: 'program')],
      2: [],
      3: [work('laroza')]
    }, {
      1: true,
      2: true,
      3: false
    });
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: CatalogPage(
                api: api,
                store: store,
                title: 'الأفلام',
                categoryId: 'movie-foreign',
                mediaKind: 'movie',
                unified: true))));
    await tester.pumpAndSettle();
    expect(api.requests, [1]);
    expect(find.text('برنامج'), findsNothing);
    await tester.tap(find.text('عرض الصفحة التالية'));
    await tester.pumpAndSettle();
    expect(api.requests, [1, 2]);
    expect(find.text('عرض الصفحة التالية'), findsOneWidget);
    await tester.tap(find.text('عرض الصفحة التالية'));
    await tester.pumpAndSettle();
    expect(api.requests, [1, 2, 3]);
    expect(find.text('Inception'), findsOneWidget);
    expect(find.text('تم عرض كل الأعمال المتاحة'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'anime taxonomy excludes programs and exposes neutral browsing categories',
      (tester) async {
    final api = _PagedUnifiedApi({
      1: [
        work('alooy', title: 'برنامج اليوم', type: 'program'),
        work('laroza', title: 'Anime Movie', genres: ['Anime']),
        work('akoam', title: 'Ordinary Film'),
      ]
    }, {
      1: false
    });
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: CatalogPage(
                api: api,
                store: store,
                title: 'الأنمي',
                categoryId: 'movie-anime',
                mediaKind: 'anime',
                unified: true))));
    await tester.pumpAndSettle();
    expect(find.text('Anime Movie'), findsOneWidget);
    expect(find.text('برنامج اليوم'), findsNothing);
    expect(find.text('Ordinary Film'), findsNothing);
    final menu = tester
        .widget<DropdownButton<String>>(find.byType(DropdownButton<String>));
    expect(menu.items!.map((item) => item.value), containsAll(['browse-anime','browse-anime-movies','browse-anime-series']));
    expect(api.requests, [1]);
    await tester.pumpWidget(const SizedBox());
  });
}
