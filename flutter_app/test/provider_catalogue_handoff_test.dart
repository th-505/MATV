import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/najd_theme.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/source_editions_panel.dart';
import 'package:mitv/src/source_selection_memory.dart';

import 'phase2_player_test.dart' as recording;

const own = 'source:second:bbbbbbbbbbbbbbbbbbbbbbbb';
const canonical = 'tmdb:tv:123';
const work = CatalogItem(
  id: '123',
  ref: canonical,
  title: 'اسم العرض',
  poster: '',
  type: 'series',
  season: 2,
  episode: 1,
);

class ProviderFixtureApi extends MitvApi {
  @override
  Uri mediaUri(
    String path, {
    bool download = false,
    String playbackMode = 'proxy',
    DateTime? expiresAt,
  }) => Uri.parse(path);
  int statusCalls = 0;
  @override
  Future<Map<String, dynamic>> requestHarvest(
    String ref, {
    String reason = 'card_open',
  }) async => {'ref': ref, 'state': 'queued'};
  @override
  Future<Map<String, dynamic>> harvestStatus(String ref) async {
    statusCalls++;
    return {
      'state': 'ready',
      'counts': {'queued': 0, 'running': 0},
      'source_editions': [
        {
          'ref': own,
          'provider': 'second',
          'provider_name': 'المزود الثاني',
          'title': 'الاسم الرسمي في الموقع',
          'available': true,
          'seasons': [
            {'season': 1, 'episode_count': 40},
          ],
        },
      ],
    };
  }

  @override
  Future<TitleDetails> details(String ref) async => ref.startsWith(own)
      ? const TitleDetails(
          title: 'الاسم الرسمي في الموقع',
          poster: '',
          plot: 'ملخص المصدر الأصلي',
          sourceWorkRef: own,
          sourceProvider: 'second',
          sourceIndexAuthoritative: true,
          availableSeasons: [1],
          episodes: [
            EpisodeItem(
              id: 'actual-21',
              number: 21,
              season: 1,
              title: 'حلقة الموقع 21',
              ref: '$own:s1:e21',
              watchAvailable: true,
            ),
            EpisodeItem(
              id: 'actual-22',
              number: 22,
              season: 1,
              title: 'حلقة الموقع 22',
              ref: '$own:s1:e22',
              watchAvailable: true,
            ),
          ],
          mediaPath: '',
          mediaType: '',
          playbackUnavailable: false,
          playbackReason: '',
        )
      : const TitleDetails(
          title: 'اسم العرض',
          poster: '',
          plot: 'قصة العمل',
          sourceIndexAuthoritative: true,
          episodes: [],
          mediaPath: '',
          mediaType: '',
          playbackUnavailable: false,
          playbackReason: '',
        );
  @override
  Future<TitleDetails> resolvePlayback(
    String ref, {
    bool refresh = false,
  }) async {
    final path = ref.startsWith(own) ? 'second' : 'first';
    return TitleDetails(
      title: 'فيديو',
      poster: '',
      episodes: const [],
      mediaPath: 'https://cdn.example/$path.mp4',
      mediaType: 'mp4',
      playbackMode: 'direct',
      playbackUnavailable: false,
      playbackReason: '',
      mediaSources: [
        PlaybackSource(
          mediaPath: 'https://cdn.example/$path.mp4',
          mediaType: 'mp4',
          playbackMode: 'direct',
          providerId: path,
        ),
      ],
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
    );
  }
}

class ProviderFixtureEngine extends recording.FakeEngine {
  ProviderFixtureEngine(
    super.uri, {
    required super.mediaType,
    required super.headers,
    required super.software,
  }) : super(fail: false);
  @override
  Future<void> initialize() async {
    await super.initialize();
    state.value = value.copyWith(duration: const Duration(minutes: 40));
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'title shows exactly three primary actions and keeps source scans behind the source action',
    (tester) async {
      final store = await LocalLibraryStore.create();
      final api = ProviderFixtureApi();
      addTearDown(store.dispose);
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          theme: NajdThemes.light,
          home: DetailsPage(api: api, store: store, item: work),
        ),
      );
      await tester.pumpAndSettle();
      for (final key in ['title-watch', 'title-download', 'title-providers']) {
        expect(find.byKey(Key(key)), findsOneWidget);
      }
      expect(find.byType(SourceEditionsPanel), findsNothing);
      expect(api.statusCalls, 0);
      await tester.tap(find.byKey(const Key('title-providers')));
      await tester.pumpAndSettle();
      expect(find.byType(SourceEditionsPanel), findsOneWidget);
      expect(api.statusCalls, greaterThan(0));
    },
  );
  testWidgets(
    'manual provider episode 21 keeps the 20-minute clock without treating it as TMDB episode one',
    (tester) async {
      tester.view.physicalSize = const Size(844, 390);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final store = await LocalLibraryStore.create();
      final api = ProviderFixtureApi();
      final engines = <ProviderFixtureEngine>[];
      addTearDown(store.dispose);
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          theme: NajdThemes.light,
          home: PlayerPage(
            api: api,
            store: store,
            item: work,
            title: work.title,
            sourceRef: '$canonical:s2:e1',
            providerCatalogRef: canonical,
            playerFactory: (uri, type, headers, software) {
              final engine = ProviderFixtureEngine(
                uri,
                mediaType: type,
                headers: headers,
                software: software,
              );
              engines.add(engine);
              return engine;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await engines.first.seekTo(const Duration(minutes: 20));
      await tester.tap(find.byKey(const Key('player-more')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('player-providers')));
      await tester.tap(find.byKey(const Key('player-providers')));
      await tester.pumpAndSettle();
      final provider = find.byKey(const ValueKey('source-edition-$own'));
      await tester.ensureVisible(provider);
      await tester.pumpAndSettle();
      await tester.tap(provider);
      await tester.pumpAndSettle();
      expect(find.text('ملخص المصدر الأصلي'), findsOneWidget);
      final episode = find.byKey(const ValueKey('episode-play-actual-21'));
      await tester.scrollUntilVisible(
        episode,
        180,
        scrollable: find
            .descendant(
              of: find.byType(DetailsPage),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await Scrollable.ensureVisible(tester.element(episode), alignment: .25);
      await tester.pumpAndSettle();
      expect(episode.hitTestable(), findsOneWidget);
      await tester.tap(episode);
      await tester.pumpAndSettle();
      expect(engines.last.uri.path, '/second.mp4');
      expect(engines.last.seeks, contains(const Duration(minutes: 20)));
      final player = tester.widget<PlayerPage>(find.byType(PlayerPage));
      expect(player.sourceRef, '$own:s1:e21');
      expect(player.episodeNumber, 21);
      expect(player.item.season, 1);
      final selected = await SourceSelectionMemory.read(canonical);
      expect(selected?.episodeRef, '$own:s1:e21');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
