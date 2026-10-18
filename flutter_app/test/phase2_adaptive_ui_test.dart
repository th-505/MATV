import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/adaptive_viewport.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/app_target.dart';
import 'package:mitv/src/focus_highlight.dart';
import 'package:mitv/src/fullscreen_video_surface.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'phase2_player_test.dart' show FakeEngine;

class _LayoutApi extends MitvApi {
  @override
  Future<List<CatalogItem>> liveChannels() async => [];
  final requests = <String>[];
  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    requests.add('$categoryId:$page');
    return [];
  }

  @override
  Future<List<MatchItem>> matches() async => List.generate(
      5,
      (i) => MatchItem(
          home: 'الفريق $i',
          away: 'الضيف $i',
          time: '20:00',
          status: 'scheduled',
          ref: 'match:fixture-$i'));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final dimensions in [const Size(390, 844), const Size(1280, 800)]) {
    testWidgets(
        'six RTL destinations adapt to $dimensions without hidden fetch',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = dimensions;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _LayoutApi();
      final store = await LocalLibraryStore.create();
      addTearDown(api.close);
      addTearDown(store.dispose);
      await tester.pumpWidget(MaterialApp(
          home: Directionality(
              textDirection: TextDirection.rtl,
              child: Shell(api: api, store: store))));
      await tester.pumpAndSettle();
      expect(api.requests, ['home-trending:1']);
      expect(find.byType(HomePage), findsOneWidget);
      expect(find.text('الأخبار'), findsNothing);
      if (!isTvTarget && dimensions.width < 900) {
        expect(
            tester
                .widget<NavigationBar>(find.byType(NavigationBar))
                .destinations
                .length,
            6);
      } else {
        expect(
            tester
                .widget<NavigationRail>(find.byType(NavigationRail))
                .destinations
                .length,
            6);
      }
      await tester.tap(find.byIcon(Icons.live_tv));
      await tester.pumpAndSettle();
      expect(
          tester
              .widget<ListView>(find.byKey(const Key('live-match-carousel')))
              .scrollDirection,
          Axis.horizontal);
      expect(find.text('لا توجد قنوات مباشرة مهيأة حاليًا'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.movie_outlined));
      await tester.pumpAndSettle();
      final dropdown = tester
          .widget<DropdownButton<String>>(find.byType(DropdownButton<String>));
      expect(dropdown.items!.map((e) => e.value),
          containsAll(['browse-movie-foreign', 'browse-movie-arabic', 'browse-movie-turkish']));
      expect(tester.widget<GridView>(find.byType(GridView)).gridDelegate,
          isA<SliverGridDelegateWithFixedCrossAxisCount>());
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('keyboard selects the six-section rail without reloading visits',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1280, 800);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _LayoutApi();
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Directionality(
            textDirection: TextDirection.rtl,
            child: Shell(api: api, store: store))));
    await tester.pumpAndSettle();
    Focus.of(tester.element(find.text('الرئيسية'))).requestFocus();
    await tester.pump();
    for (final kind in ['movie', 'series', 'anime']) {
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(
          tester.widget<CatalogPage>(find.byType(CatalogPage)).mediaKind, kind);
    }
    expect(api.requests, [
      'home-trending:1',
      'browse-movies:1',
      'browse-series:1',
      'browse-anime:1'
    ]);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.byType(SettingsPage), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(tester.widget<CatalogPage>(find.byType(CatalogPage)).mediaKind,
        'anime');
    expect(api.requests.length, 4);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('viewport reads actual bounds, camera padding and text scale',
      (tester) async {
    ViewportMetrics? measured;
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(
                size: Size(900, 600),
                viewPadding: EdgeInsets.only(left: 44, bottom: 18),
                textScaler: TextScaler.linear(1.5)),
            child: Center(
                child: SizedBox(
                    width: 420,
                    height: 300,
                    child: AdaptiveViewport(builder: (_, metrics) {
                      measured = metrics;
                      return const SizedBox();
                    }))))));
    expect(measured!.size, const Size(420, 300));
    expect(measured!.safeInsets.left, 44);
    expect(measured!.textScaler.scale(20), 30);
    expect(measured!.columns(), 2);
  });

  testWidgets('focus border follows keyboard focus and Enter activates action',
      (tester) async {
    final focus = FocusNode();
    addTearDown(focus.dispose);
    var selections = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: FocusHighlight(
                child: TextButton(
                    focusNode: focus,
                    onPressed: () => selections++,
                    child: const Text('اختيار'))))));
    focus.requestFocus();
    await tester.pumpAndSettle();
    final border = tester
        .widget<AnimatedContainer>(
            find.byKey(const Key('focus-highlight-border')))
        .decoration! as BoxDecoration;
    expect((border.border! as Border).top.color, const Color(0xFFE8BD75));
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(selections, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'native player fit switch preserves full viewport and safe controls',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(844, 390);
    tester.view.viewPadding =
        const FakeViewPadding(left: 44, right: 20, bottom: 18);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewPadding);
    final api = _LayoutApi();
    final store = await LocalLibraryStore.create();
    addTearDown(api.close);
    addTearDown(store.dispose);
    const item = CatalogItem(
        id: 'local',
        title: 'Local',
        poster: '',
        type: 'movie',
        ref: 'local:fixture');
    await tester.pumpWidget(MaterialApp(
        home: PlayerPage(
            api: api,
            store: store,
            item: item,
            title: item.title,
            localFileUri: Uri.file('/tmp/fixture.mp4'),
            mediaType: 'mp4',
            persistProgress: false,
            playerFactory: (uri, type, headers, software) => FakeEngine(uri,
                mediaType: type,
                headers: headers,
                software: software,
                fail: false))));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FullscreenVideoSurface>(find.byType(FullscreenVideoSurface))
            .fit,
        BoxFit.contain);
    expect(tester.getSize(find.byKey(const Key('fullscreen-video-viewport'))),
        const Size(844, 390));
    final fitRect = tester.getRect(find.byKey(const Key('player-fit-toggle')));
    expect(fitRect.right, lessThanOrEqualTo(844 - 20));
    await tester.tap(find.byKey(const Key('player-fit-toggle')));
    await tester.pump();
    expect(
        tester
            .widget<FullscreenVideoSurface>(find.byType(FullscreenVideoSurface))
            .fit,
        BoxFit.cover);
    final video = tester.getRect(find.byKey(const Key('test-video-surface')));
    expect(video.width, greaterThanOrEqualTo(844));
    expect(video.height, greaterThanOrEqualTo(390));
    await tester.tap(find.byKey(const Key('player-fit-toggle')));
    await tester.pump();
    expect(
        tester
            .widget<FullscreenVideoSurface>(find.byType(FullscreenVideoSurface))
            .fit,
        BoxFit.contain);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
