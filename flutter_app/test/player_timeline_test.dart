import 'package:mitv/src/source_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';

import 'phase2_player_test.dart' show FakeEngine;

StreamSource source(
  String id,
  String provider, {
  String edition = '',
  bool verified = false,
  int? offset,
}) => StreamSource(
  mediaPath: 'https://media.test/$id.mp4',
  mediaType: 'mp4',
  playbackMode: 'edge_direct',
  providerId: provider,
  provider: provider,
  edition: edition,
  timelineVerified: verified,
  timelineOffsetMs: offset,
);

class TimelineApi extends MitvApi {
  TimelineApi(this.sources);
  final List<StreamSource> sources;
  int resolutions = 0;
  @override
  Future<TitleDetails> resolvePlayback(
    String ref, {
    bool refresh = false,
  }) async {
    resolutions++;
    return TitleDetails(
      title: 'Work',
      poster: '',
      episodes: const [],
      mediaPath: sources.first.mediaPath,
      mediaType: sources.first.mediaType,
      playbackMode: 'edge_direct',
      mediaSources: sources,
      playbackUnavailable: false,
      playbackReason: '',
    );
  }

  @override
  Uri mediaUri(
    String path, {
    bool download = false,
    String playbackMode = 'proxy',
    DateTime? expiresAt,
  }) => Uri.parse(path);
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  test(
    'known provider, verified cut and timeline offsets determine handoff',
    () {
      final unknownA = source('a', '3isk');
      final unknownB = source('b', 'laroza');
      expect(sourcesShareTimeline(unknownA, unknownB), false);
      expect(sourcesShareTimeline(unknownA, source('c', '3isk')), true);
      expect(sourcesShareTimeline(source('x', ''), source('y', '')), false);
      expect(
        sourcesShareTimeline(
          source('x', '3isk', edition: 'original'),
          source('y', '3isk', edition: 'dubbed'),
        ),
        false,
      );
      final original = source(
        'o',
        '3isk',
        edition: 'original',
        verified: true,
        offset: 5000,
      );
      final alternate = source(
        'p',
        'akoam',
        edition: 'original',
        verified: true,
        offset: 2000,
      );
      expect(sourcesShareTimeline(original, alternate), true);
      expect(
        sourceHandoffPosition(const Duration(seconds: 23), original, alternate),
        const Duration(seconds: 20),
      );
      expect(
        sourceHandoffPosition(const Duration(seconds: 1), original, alternate),
        Duration.zero,
      );
      expect(
        sourceHandoffPosition(const Duration(seconds: 23), unknownA, unknownB),
        Duration.zero,
      );
      expect(
        sourcesShareTimeline(
          original,
          source('q', 'akoam', edition: 'original', verified: false),
        ),
        false,
      );
    },
  );

  for (final automatic in [true, false]) {
    testWidgets(
      '${automatic ? 'automatic' : 'manual'} unverified cross-provider change never reuses a 23-second playhead',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final store = await LocalLibraryStore.create();
        final api = TimelineApi([
          source('primary', '3isk'),
          source('unverified', 'laroza'),
        ]);
        final engines = <FakeEngine>[];
        await tester.pumpWidget(
          MaterialApp(
            home: PlayerPage(
              api: api,
              store: store,
              item: const MediaItem(
                id: 'work',
                ref: '3isk:work',
                title: 'Work',
                poster: '',
                type: 'movie',
              ),
              title: 'Work',
              sourceRef: '3isk:work',
              playerFactory: (uri, type, headers, software) {
                final engine = FakeEngine(
                  uri,
                  mediaType: type,
                  headers: headers,
                  software: software,
                  fail: false,
                );
                engines.add(engine);
                return engine;
              },
            ),
          ),
        );
        await settle(tester);
        await engines.first.seekTo(const Duration(seconds: 23));
        if (automatic) {
          engines.first.state.value = VideoPlayerValue.erroneous('HTTP 403');
          await settle(tester);
          expect(
            engines.every((e) => e.uri.path == '/primary.mp4'),
            true,
            reason: 'refresh must not silently select an unverified edition after an error',
          );
        }
        // A blocked automatic handoff still leaves a manual source choice.
        final menu = tester.widget<SourcePickerButton>(
          find.byType(SourcePickerButton),
        );
        final alternative = menu.sources.indexWhere(
          (source) => source.displayLabel.startsWith('laroza'),
        );
        menu.onSelected(alternative);
        await settle(tester);
        expect(engines.last.uri.path, '/unverified.mp4');
        expect(engines.last.seeks, [Duration.zero]);
        expect(
          find.text('نسخة هذا المصدر غير متطابقة؛ يبدأ التشغيل من البداية.'),
          findsOneWidget,
        );
        await tester.pumpWidget(const SizedBox());
        api.close();
      },
    );
  }

  testWidgets(
    'automatic fallback skips an unknown cut and applies verified offsets to the next compatible source',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = TimelineApi([
        source(
          'primary',
          '3isk',
          edition: 'cut-a',
          verified: true,
          offset: 5000,
        ),
        source('unknown', 'laroza'),
        source(
          'verified',
          'akoam',
          edition: 'cut-a',
          verified: true,
          offset: 2000,
        ),
      ]);
      final engines = <FakeEngine>[];
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: store,
            item: const MediaItem(
              id: 'work',
              ref: '3isk:work',
              title: 'Work',
              poster: '',
              type: 'movie',
            ),
            title: 'Work',
            sourceRef: '3isk:work',
            playerFactory: (uri, type, headers, software) {
              final engine = FakeEngine(
                uri,
                mediaType: type,
                headers: headers,
                software: software,
                fail: false,
              );
              engines.add(engine);
              return engine;
            },
          ),
        ),
      );
      await settle(tester);
      await engines.first.seekTo(const Duration(seconds: 23));
      engines.first.state.value = VideoPlayerValue.erroneous('HTTP 503');
      await settle(tester);
      expect(engines.map((e) => e.uri.path).toList(), [
        '/primary.mp4',
        '/verified.mp4',
      ]);
      expect(engines.last.seeks, [const Duration(seconds: 20)]);
      expect(
        find.text('نسخة هذا المصدر غير متطابقة؛ يبدأ التشغيل من البداية.'),
        findsNothing,
      );
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );

  testWidgets(
    'initial decoder failure cannot refresh into an unknown cut using saved history',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      const item = MediaItem(
        id: 'work',
        ref: '3isk:work',
        title: 'Work',
        poster: '',
        type: 'movie',
      );
      await store.recordProgress(
        item: item,
        position: const Duration(seconds: 40),
        duration: const Duration(minutes: 10),
      );
      final api = TimelineApi([
        source('primary', '3isk'),
        source('unknown', 'laroza'),
      ]);
      final engines = <FakeEngine>[];
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: store,
            item: item,
            title: 'Work',
            sourceRef: item.ref,
            playerFactory: (uri, type, headers, software) {
              final engine = FakeEngine(
                uri,
                mediaType: type,
                headers: headers,
                software: software,
                fail: uri.path == '/primary.mp4',
              );
              engines.add(engine);
              return engine;
            },
          ),
        ),
      );
      await settle(tester);
      expect(engines.every((e) => e.uri.path == '/primary.mp4'), true);
      expect(
        engines.length,
        2,
        reason: 'one bounded source refresh retries its own timeline only',
      );
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
}
