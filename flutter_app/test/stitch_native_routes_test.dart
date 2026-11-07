import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/najd_theme.dart';
import 'package:mitv/src/stitch_design.dart';
import 'package:mitv/src/source_picker.dart';

const film = CatalogItem(
  id: 'proof-film',
  title: 'أصداء الرمال: ملحمة طويق',
  poster: '',
  type: 'movie',
  ref: 'proof:film',
  year: 2024,
  rating: 8.9,
);

class FixtureApi extends MitvApi {
  @override
  Future<List<CatalogItem>> category(String id, {int page = 1}) async => [film];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await loadPrivateNajdFonts();
    if (Platform.environment['NAJD_CAPTURE'] == '1') {
      final icons = FontLoader('MaterialIcons')
        ..addFont(
          File(
            '/workspace/flutter-sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then((b) => ByteData.sublistView(b)),
        );
      await icons.load();
    }
    final fallback = FontLoader('NajdArabicFallback')
      ..addFont(rootBundle.load('assets/fallback/NotoSansArabic.ttf'));
    await fallback.load();
  });
  for (final dark in [false, true]) {
    testWidgets(
      'production routes render and history clearing preserves favorites ${dark ? 'dark' : 'light'}',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final store = await LocalLibraryStore.create();
        final api = FixtureApi();
        addTearDown(store.dispose);
        addTearDown(api.close);
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final boundary = GlobalKey();
        Future<void> render(Widget child, String name) async {
          await tester.pumpWidget(
            MaterialApp(
              theme: dark ? NajdThemes.dark : NajdThemes.light,
              home: Directionality(
                textDirection: TextDirection.rtl,
                child: RepaintBoundary(
                  key: boundary,
                  child: Scaffold(body: SafeArea(child: child)),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          if (Platform.environment['NAJD_CAPTURE'] == '1') {
            await tester.runAsync(() async {
              final image =
                  await (boundary.currentContext!.findRenderObject()
                          as RenderRepaintBoundary)
                      .toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final dir = Directory('/workspace/artifacts/native-proof');
              await dir.create(recursive: true);
              await File('${dir.path}/$name-${dark ? 'dark' : 'light'}.png')
                  .writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
        }

        await render(Shell(api: api, store: store), 'home');
        expect(find.byKey(const Key('stitch-feature-hero')), findsOneWidget);
        await render(LibraryPage(api: api, store: store), 'watchlist-empty');
        expect(find.byKey(const Key('stitch-state-watchlist')), findsOneWidget);
        await store.toggleFavorite(film);
        await store.recordProgress(
          item: film,
          position: const Duration(minutes: 12),
          duration: const Duration(minutes: 90),
        );
        await render(
          LibraryPage(
            key: const ValueKey('history'),
            api: api,
            store: store,
            mode: NajdLibraryMode.history,
          ),
          'history',
        );
        await tester.tap(find.text('مسح السجل'));
        await tester.pumpAndSettle();
        expect(find.textContaining('لن تتأثر'), findsOneWidget);
        await tester.tap(find.text('إلغاء'));
        await tester.pumpAndSettle();
        expect(store.continueWatching, isNotEmpty);
        await tester.tap(find.text('مسح السجل'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'مسح السجل'));
        await tester.pumpAndSettle();
        expect(store.continueWatching, isEmpty);
        expect(store.isFavorite(film.ref), isTrue);
        await render(SettingsPage(api: api, store: store), 'settings');
        await tester.tap(find.text('المظهر والحلقات'));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('stitch-theme-light')), findsOneWidget);
        expect(find.byKey(const Key('stitch-theme-dark')), findsOneWidget);
        for (final state in [
          NajdEmptyKind.offline,
          NajdEmptyKind.source,
          NajdEmptyKind.search,
          NajdEmptyKind.downloads,
          NajdEmptyKind.history,
        ]) {
          await render(NajdEmptyState(kind: state, onRetry: () {}), state.name);
        }
        await render(const NajdSkeleton(), 'loading');
        await render(
          SourcePickerButton(
            sources: const [],
            selected: 0,
            onSelected: (_) async {},
          ),
          'source-button',
        );
        await tester.tap(find.byTooltip('السيرفر / الجودة'));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('stitch-state-source')), findsOneWidget);
      },
    );
  }
}
