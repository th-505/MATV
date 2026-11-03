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
import 'package:mitv/src/najd_panels.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/source_picker.dart';
import 'package:mitv/src/details_page.dart';

import 'provider_catalogue_handoff_test.dart' as fixture;

class _Search extends MitvApi {
  @override
  Future<List<String>> explorationSources() async => ['first', 'second'];
  @override
  String explorationSourceLabel(String id) =>
      id == 'first' ? 'المزود الأول' : 'المزود الثاني';
  @override
  Future<List<CatalogItem>> searchTmdb(String query) async => [];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    if (Platform.environment['NAJD_CAPTURE'] != '1') return;
    await loadPrivateNajdFonts();
    await (FontLoader(
      'NajdArabicFallback',
    )..addFont(rootBundle.load('assets/fallback/NotoSansArabic.ttf'))).load();
    await (FontLoader('MaterialIcons')..addFont(
          File(
            '/workspace/flutter-sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then(ByteData.sublistView),
        ))
        .load();
  });
  for (final dark in [false, true]) {
    for (final size in [const Size(320, 568), const Size(844, 390)]) {
      testWidgets(
        'themed panels fit RTL $size dark=$dark and preserve option selection',
        (tester) async {
          SharedPreferences.setMockInitialValues({});
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final boundary = GlobalKey();
          final theme = dark ? NajdThemes.dark : NajdThemes.light;
          Future<void> mount(Widget page) async {
            await tester.pumpWidget(
              RepaintBoundary(
                key: boundary,
                child: MaterialApp(
                  debugShowCheckedModeBanner: false,
                  theme: theme,
                  home: Directionality(
                    textDirection: TextDirection.rtl,
                    child: page,
                  ),
                ),
              ),
            );
            await tester.pumpAndSettle();
          }

          Future<void> capture(String name) async {
            expect(tester.takeException(), isNull);
            if (Platform.environment['NAJD_CAPTURE'] != '1') return;
            await tester.runAsync(() async {
              final image =
                  await (boundary.currentContext!.findRenderObject()
                          as RenderRepaintBoundary)
                      .toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final root = Directory(
                '/workspace/artifacts/najd-build109-proof',
              );
              await root.create(recursive: true);
              await File(
                '${root.path}/$name-${size.width.toInt()}-${dark ? 'dark' : 'light'}.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }

          int? selected;
          await mount(
            Scaffold(
              body: Center(
                child: SourcePickerButton(
                  selected: 0,
                  sources: const [
                    PlaybackSource(
                      mediaPath: 'https://cdn.example/one.mp4',
                      mediaType: 'mp4',
                      label: 'المصدر الرئيسي',
                      provider: 'المزود الأول',
                    ),
                    PlaybackSource(
                      mediaPath: 'https://cdn.example/two.m3u8',
                      mediaType: 'm3u8',
                      label: 'المصدر البديل',
                      provider: 'المزود الثاني',
                    ),
                  ],
                  onSelected: (value) async => selected = value,
                ),
              ),
            ),
          );
          await tester.tap(find.byTooltip('السيرفر / الجودة'));
          await tester.pumpAndSettle();
          await capture('sources');
          await tester.tap(find.text('المزود الثاني • المصدر البديل'));
          await tester.pumpAndSettle();
          expect(selected, 1);
          await mount(
            Scaffold(
              body: Center(
                child: NajdChoiceButton<String>(
                  label: 'لغة الصوت',
                  icon: Icons.audiotrack_outlined,
                  options: const [
                    NajdOption(
                      'ar',
                      'العربية الأصلية',
                      selected: true,
                      icon: Icons.audiotrack_outlined,
                    ),
                    NajdOption(
                      'en',
                      'الإنجليزية',
                      icon: Icons.audiotrack_outlined,
                    ),
                  ],
                  onSelected: (_) async {},
                ),
              ),
            ),
          );
          await tester.tap(find.byTooltip('لغة الصوت'));
          await tester.pumpAndSettle();
          await capture('audio');
          await tester.tap(find.byTooltip('إغلاق'));
          await tester.pumpAndSettle();
          final store = await LocalLibraryStore.create();
          final api = fixture.ProviderFixtureApi();
          addTearDown(store.dispose);
          addTearDown(api.close);
          if (size.width > 700) {
            await mount(
              PlayerPage(
                api: api,
                store: store,
                item: fixture.work,
                title: fixture.work.title,
                sourceRef: '${fixture.canonical}:s2:e1',
                providerCatalogRef: fixture.canonical,
                playerFactory: (uri, type, headers, software) =>
                    fixture.ProviderFixtureEngine(
                      uri,
                      mediaType: type,
                      headers: headers,
                      software: software,
                    ),
              ),
            );
            await capture('player');
            await tester.tap(find.byKey(const Key('player-providers')));
            await tester.pumpAndSettle();
            await capture('providers');
            await tester.pageBack();
            await tester.pumpAndSettle();
          } else {
            await mount(
              DetailsPage(api: api, store: store, item: fixture.work),
            );
            await capture('details');
            final search = _Search();
            addTearDown(search.close);
            await mount(
              Scaffold(
                body: SearchPage(api: search, store: store),
              ),
            );
            await tester.tap(find.byKey(const Key('search-advanced-toggle')));
            await tester.pumpAndSettle();
            await tester.ensureVisible(
              find.byKey(const Key('search-explore-source')),
            );
            await tester.tap(find.byKey(const Key('search-explore-source')));
            await tester.pumpAndSettle();
            await capture('provider-search');
            await tester.tap(find.byTooltip('إغلاق'));
            await tester.pumpAndSettle();
          }
          await tester.pumpWidget(const SizedBox());
        },
      );
    }
  }
}
