// Production-widget QA, not a design gallery. Data and media engines are fixtures.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/download_activity.dart';
import 'package:mitv/src/download_library_section.dart';
import 'package:mitv/src/download_service.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/najd_theme.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/provider_browser_page.dart';

import '../flutter_app/test/provider_catalogue_handoff_test.dart' as fixture;
import '../flutter_app/test/support/shell_navigation.dart';

const movie = CatalogItem(
  id: 'qa-movie',
  ref: 'qa:movie',
  title: 'أصداء الرمال: ملحمة طويق',
  poster: '',
  type: 'movie',
  year: 2024,
  rating: 8.9,
);
const series = CatalogItem(
  id: 'qa-series',
  ref: 'qa:series',
  title: 'فرسان الظلال',
  poster: '',
  type: 'series',
  year: 2024,
  rating: 9.1,
);

class MatrixDownloads extends DownloadService {
  bool completed = false;
  @override
  Future<List<DownloadedFileInfo>> listDownloads() async => completed
      ? [
          DownloadedFileInfo(
            name: 'qa-movie.mp4',
            path: '/qa/qa-movie.mp4',
            bytes: 1800 * 1024 * 1024,
            modifiedAt: DateTime(2026, 11, 3),
          ),
        ]
      : [];
}

class MatrixApi extends fixture.ProviderFixtureApi {
  String mode = 'ready';
  @override
  Future<List<CatalogItem>> category(String id, {int page = 1}) async {
    if (mode == 'loading') return Completer<List<CatalogItem>>().future;
    if (mode == 'offline') throw StateError('QA disconnected transport');
    if (mode == 'empty') return [];
    return [
      movie,
      series,
      movie.copyWith(
        id: 'qa-film-2',
        ref: 'qa:film-2',
        title: 'رحلة نحو النجوم',
      ),
      series.copyWith(
        id: 'qa-series-2',
        ref: 'qa:series-2',
        title: 'سراب المدينة',
      ),
    ];
  }

  @override
  Future<void> prefetchMetadata(String ref) async {}
  @override
  Future<List<CatalogItem>> searchTmdb(String query) async {
    if (mode == 'offline') throw StateError('QA unavailable search service');
    return mode == 'empty' ? [] : [movie, series];
  }

  @override
  Future<List<String>> explorationSources() async => ['fosta', 'alooy'];
  @override
  String explorationSourceLabel(String id) => id == 'fosta' ? 'فوستا' : 'ألوي';
  @override
  Future<List<MatchItem>> matches() async => [
    const MatchItem(
      home: 'الفريق الأول',
      away: 'الفريق الثاني',
      time: '20:00',
      status: 'scheduled',
      ref: 'match:qa',
    ),
  ];
  @override
  Future<List<Map<String, dynamic>>> browserSources() async => [
    {
      'id': 'fosta',
      'name': 'فوستا',
      'categories': [
        {'id': 'latest', 'label': 'الأحدث'},
        {'id': 'series', 'label': 'المسلسلات'},
      ],
    },
    {
      'id': 'alooy',
      'name': 'ألوي',
      'categories': [
        {'id': 'series', 'label': 'المسلسلات'},
      ],
    },
  ];
  @override
  Future<({List<CatalogItem> items, bool hasMore})> browserCatalog(
    String provider,
    String category,
    int page,
  ) async => (items: [movie, series], hasMore: false);
  @override
  Future<List<CatalogItem>> personWorks(int id) async => [movie, series];
  @override
  Future<TitleDetails> resolvePlayback(
    String ref, {
    bool refresh = false,
  }) async {
    if (mode == 'player-unavailable')
      throw const ApiException('EDGE_NO_HEALTHY_SOURCES');
    return super.resolvePlayback(ref, refresh: refresh);
  }

  @override
  Future<TitleDetails> details(String ref) async {
    if (ref.startsWith('source:') || ref.startsWith('tmdb:'))
      return super.details(ref);
    return TitleDetails(
      title: ref == series.ref ? series.title : movie.title,
      poster: '',
      plot: 'ملخص تجريبي لفحص قابلية القراءة والمسافات في واجهة نجد.',
      year: 2024,
      genres: const ['دراما', 'مغامرة'],
      cast: const [
        {'id': 7, 'name': 'أحمد عبد العزيز', 'photo': ''},
      ],
      directorPeople: const [
        {'id': 8, 'name': 'محمد العبد الله', 'photo': '', 'role': 'Director'},
      ],
      episodes: ref == series.ref
          ? const [
              EpisodeItem(
                id: 'qa-e1',
                ref: 'qa:e1',
                title: 'الحلقة الأولى: البداية',
                number: 1,
                season: 1,
                watchAvailable: true,
              ),
            ]
          : const [],
      mediaPath: '',
      mediaType: '',
      playbackUnavailable: false,
      playbackReason: '',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final profile = Platform.environment['NAJD_QA_PROFILE'] ?? 'small-phone';
  final sizes = {
    'small-phone': const Size(320, 568),
    'iphone': const Size(390, 844),
    'tablet': const Size(1024, 768),
    'desktop': const Size(1280, 800),
    'tv': const Size(1920, 1080),
  };
  final size = sizes[profile]!;
  final output = Directory('/workspace/artifacts/najd-beta200-ui-matrix');
  setUpAll(() async {
    await output.create(recursive: true);
    await loadPrivateNajdFonts();
    await (FontLoader(
      'NajdArabicFallback',
    )..addFont(rootBundle.load('assets/fallback/NotoSansArabic.ttf'))).load();
    final sdk =
        Platform.environment['NAJD_FLUTTER_SDK'] ?? '/workspace/flutter-sdk';
    await (FontLoader('MaterialIcons')..addFont(
          File(
            '$sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then(ByteData.sublistView),
        ))
        .load();
  });
  for (final dark in [false, true]) {
    testWidgets(
      '$profile ${dark ? 'dark' : 'light'} actual production states',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        debugDefaultTargetPlatformOverride = profile == 'desktop'
            ? TargetPlatform.windows
            : profile == 'iphone'
            ? TargetPlatform.iOS
            : TargetPlatform.android;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        try {
          SharedPreferences.setMockInitialValues({});
          await NajdAppearance.instance.setMode(
            dark ? ThemeMode.dark : ThemeMode.light,
          );
          final store = await LocalLibraryStore.create(), api = MatrixApi();
          final downloads = MatrixDownloads();
          addTearDown(downloads.close);
          addTearDown(api.close);
          addTearDown(store.dispose);
          final records = <Map<String, dynamic>>[];
          GlobalKey boundary = GlobalKey();
          Future<void> flush() async {
            for (var i = 0; i < 6; i++) {
              await tester.pump(const Duration(milliseconds: 100));
            }
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 10)),
            );
            await tester.pump();
          }

          Future<void> mount(Widget child) async {
            await tester.pumpWidget(const SizedBox());
            await tester.pump();
            boundary = GlobalKey();
            await tester.pumpWidget(
              RepaintBoundary(
                key: boundary,
                child: MaterialApp(
                  theme: dark ? NajdThemes.dark : NajdThemes.light,
                  locale: const Locale('ar'),
                  supportedLocales: const [Locale('ar'), Locale('en')],
                  localizationsDelegates: const [
                    GlobalMaterialLocalizations.delegate,
                    GlobalWidgetsLocalizations.delegate,
                    GlobalCupertinoLocalizations.delegate,
                  ],
                  home: child,
                ),
              ),
            );
            await flush();
          }

          Future<void> capture(String name) async {
            expect(tester.takeException(), isNull, reason: name);
            await tester.runAsync(() async {
              final image =
                  await (boundary.currentContext!.findRenderObject()
                          as RenderRepaintBoundary)
                      .toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '${output.path}/$profile-${dark ? 'dark' : 'light'}-$name.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
            records.add({
              'state': name,
              'theme': dark ? 'dark' : 'light',
              'profile': profile,
              'width': size.width,
              'height': size.height,
              'production_widgets': true,
              'fixture_data': true,
            });
            await tester.runAsync(
              () => File(
                '${output.path}/$profile-${dark ? 'dark' : 'light'}.json',
              ).writeAsString(jsonEncode(records)),
            );
          }

          Widget shell() => Shell(api: api, store: store);
          Widget library(NajdLibraryMode mode) => Scaffold(
            body: LibraryPage(
              key: UniqueKey(),
              api: api,
              store: store,
              mode: mode,
            ),
          );
          await store.toggleFavorite(movie);
          await mount(shell());
          for (final id in [
            'home',
            'movies',
            'series',
            'anime',
            'turkish',
            'search',
            'live',
            'favorites',
            'settings',
          ]) {
            if (id != 'home') {
              await selectShellDestination(tester, id);
              await flush();
            }
            await capture('shell-$id');
          }
          for (final mode in ['loading', 'empty', 'offline']) {
            api.mode = mode;
            await mount(
              Scaffold(
                body: HomePage(key: UniqueKey(), api: api, store: store),
              ),
            );
            await capture('home-$mode');
          }
          for (final mode in ['ready', 'empty', 'offline']) {
            api.mode = mode;
            await mount(
              Scaffold(
                body: SearchPage(key: UniqueKey(), api: api, store: store),
              ),
            );
            await tester.enterText(find.byType(TextField).first, 'طويق');
            await tester.pump(const Duration(milliseconds: 500));
            await flush();
            await capture('search-$mode');
          }
          api.mode = 'ready';
          await mount(
            Scaffold(
              body: SearchPage(api: api, store: store),
            ),
          );
          await tester.tap(find.byKey(const Key('search-advanced-toggle')));
          await flush();
          await tester.tap(find.text('جميع المصادر').first);
          await flush();
          expect(find.text('مصادر البحث'), findsOneWidget);
          await capture('search-source-picker');
          await store.toggleFavorite(movie);
          await mount(library(NajdLibraryMode.favorites));
          await capture('favorites-empty');
          await mount(library(NajdLibraryMode.history));
          await capture('history-empty');
          await store.recordProgress(
            item: series,
            position: const Duration(minutes: 20),
            duration: const Duration(minutes: 50),
            episodeId: 'qa-e1',
            episodeNumber: 1,
          );
          await mount(library(NajdLibraryMode.history));
          await capture('history-ready');
          await tester.tap(find.text('مسح السجل'));
          await flush();
          await capture('history-clear-confirmation');
          for (final state in ['empty', 'active', 'failed']) {
            if (state != 'empty')
              NajdDownloadActivity.instance.put(
                NajdDownloadJob(
                  id: 'qa-matrix-job',
                  title: movie.title,
                  received: 420 * 1024 * 1024,
                  total: 650 * 1024 * 1024,
                  failed: state == 'failed',
                  cancel: () =>
                      NajdDownloadActivity.instance.remove('qa-matrix-job'),
                  retry: () async {},
                ),
              );
            await mount(
              Scaffold(
                body: DownloadLibrarySection(
                  key: UniqueKey(),
                  service: downloads,
                ),
              ),
            );
            await capture('downloads-$state');
            NajdDownloadActivity.instance.remove('qa-matrix-job');
          }
          downloads.completed = true;
          await mount(
            Scaffold(body: DownloadLibrarySection(service: downloads)),
          );
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)),
          );
          await flush();
          expect(find.textContaining('qa-movie'), findsWidgets);
          await capture('downloads-completed');
          for (final item in [movie, series]) {
            await mount(DetailsPage(api: api, store: store, item: item));
            await capture('details-${item.type}');
          }
          final person = find.text('أحمد عبد العزيز');
          await tester.ensureVisible(person);
          await flush();
          await tester.tap(person);
          await flush();
          expect(find.text('أعمال أحمد عبد العزيز'), findsOneWidget);
          await capture('person-filmography');
          await mount(ProviderBrowserPage(api: api, store: store));
          await capture('provider-browser');
          Future<void> player() async {
            await mount(
              PlayerPage(
                api: api,
                store: store,
                item: fixture.work,
                title: 'الحلقة 21 — اسم الحلقة',
                sourceRef: '${fixture.canonical}:s2:e1',
                providerCatalogRef: fixture.canonical,
                episodeNumber: 21,
                episodeQueue: const [
                  EpisodeItem(
                    id: 'qa-21',
                    ref: 'qa:21',
                    title: 'الحلقة 21',
                    number: 21,
                    season: 1,
                    watchAvailable: true,
                  ),
                  EpisodeItem(
                    id: 'qa-22',
                    ref: 'qa:22',
                    title: 'الحلقة 22',
                    number: 22,
                    season: 1,
                    watchAvailable: true,
                  ),
                ],
                playerFactory: (uri, type, headers, software) =>
                    fixture.ProviderFixtureEngine(
                      uri,
                      mediaType: type,
                      headers: headers,
                      software: software,
                    ),
              ),
            );
          }

          await player();
          await capture('player-ready');
          await tester.tap(find.byKey(const Key('player-more')));
          await flush();
          await capture('player-more');
          await player();
          await tester.tap(find.byKey(const Key('player-more')));
          await flush();
          await tester.ensureVisible(find.byKey(const Key('player-providers')));
          await tester.tap(find.byKey(const Key('player-providers')));
          await flush();
          await capture('player-providers');
          await player();
          await tester.tap(find.byKey(const Key('player-more')));
          await flush();
          await tester.ensureVisible(find.byKey(const Key('player-more-fit')));
          await tester.tap(find.byKey(const Key('player-more-fit')));
          await flush();
          await capture('player-fit');
          await player();
          if (profile == 'tv') {
            await tester.sendKeyDownEvent(LogicalKeyboardKey.mediaFastForward);
            await tester.sendKeyRepeatEvent(
              LogicalKeyboardKey.mediaFastForward,
            );
            await flush();
            expect(
              find.byKey(const Key('player-hold-speed-badge')),
              findsOneWidget,
            );
            await capture('player-hold-boost');
            await tester.sendKeyUpEvent(LogicalKeyboardKey.mediaFastForward);
          } else {
            final hold = await tester.startGesture(
              Offset(size.width * .2, size.height * .25),
            );
            await tester.pump(const Duration(milliseconds: 700));
            await flush();
            expect(
              find.byKey(const Key('player-hold-speed-badge')),
              findsOneWidget,
            );
            await capture('player-hold-boost');
            await hold.up();
          }
          await flush();
          api.mode = 'player-unavailable';
          await player();
          await capture('player-source-unavailable');
          expect(records, hasLength(34));
          await tester.pumpWidget(const SizedBox());
          await tester.pump();
        } finally {
          debugDefaultTargetPlatformOverride = null;
        }
      },
      timeout: const Timeout(Duration(minutes: 4)),
    );
  }
}
