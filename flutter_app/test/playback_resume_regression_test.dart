import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/playback_resume.dart';

import 'phase2_player_test.dart' show FakeEngine;

class _FixtureApi extends MitvApi {
  @override
  Uri mediaUri(
    String path, {
    bool download = false,
    String playbackMode = 'proxy',
    DateTime? expiresAt,
  }) => Uri.parse(path);
}

const item = CatalogItem(
  id: 'resume',
  ref: 'legacy:resume',
  title: 'عمل محفوظ',
  poster: '',
  type: 'movie',
);
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  test('a legacy newer watch checkpoint cannot be overwritten by older local sync metadata', () async {
    final entry = WatchEntry(
      contentRef: item.ref,
      contentId: item.id,
      title: item.title,
      poster: '',
      type: 'movie',
      positionMs: 240000,
      durationMs: 600000,
      updatedAtMs: 2000,
      playbackRef: item.ref,
    );
    SharedPreferences.setMockInitialValues({
      'library.history.v1': [jsonEncode(entry.toJson())],
      'library.sync.v1': [
        jsonEncode({
          'kind': 'history',
          'item_key': item.ref,
          'metadata': {
            ...entry.toJson(),
            'position_ms': 30000,
            'updated_at_ms': 1000,
          },
          'updated_at': DateTime.fromMillisecondsSinceEpoch(
            1000,
            isUtc: true,
          ).toIso8601String(),
          'deleted': false,
        }),
      ],
    });
    final store = await LocalLibraryStore.create();
    addTearDown(store.dispose);
    expect(store.resumePosition(item.ref), const Duration(minutes: 4));
  });
  test('atomic checkpoint restores history even if legacy copies are lost, and deletion stays deleted', () async {
    SharedPreferences.setMockInitialValues({});
    final first = await LocalLibraryStore.create();
    await first.recordProgress(
      item: item,
      position: const Duration(minutes: 4),
      duration: const Duration(minutes: 10),
      playbackRef: item.ref,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('library.history.v1');
    await prefs.remove('library.sync.v1');
    first.dispose();
    final restored = await LocalLibraryStore.create();
    expect(restored.resumePosition(item.ref), const Duration(minutes: 4));
    expect(restored.history.single.playbackRef, item.ref);
    await restored.clearHistory();
    restored.dispose();
    final cleared = await LocalLibraryStore.create();
    addTearDown(cleared.dispose);
    expect(cleared.history, isEmpty);
  });
  for (final restart in [false, true]) {
    testWidgets(
      'saved video asks before ${restart ? 'restarting' : 'resuming'} and background checkpoint survives reopening',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final store = await LocalLibraryStore.create(), api = _FixtureApi();
        await store.recordProgress(
          item: item,
          position: const Duration(minutes: 4),
          duration: const Duration(minutes: 10),
          playbackRef: item.ref,
        );
        FakeEngine? engine;
        await tester.pumpWidget(
          MaterialApp(
            home: PlayerPage(
              api: api,
              store: store,
              item: item,
              title: item.title,
              mediaPath: 'https://media.example/video.mp4',
              mediaType: 'mp4',
              playbackMode: 'edge_direct',
              playerFactory: (uri, type, headers, software) =>
                  engine = FakeEngine(
                    uri,
                    mediaType: type,
                    headers: headers,
                    software: software,
                    fail: false,
                  ),
            ),
          ),
        );
        await settle(tester);
        expect(find.text('استئناف التشغيل'), findsOneWidget);
        expect(find.text('البدء من جديد'), findsOneWidget);
        expect(engine!.value.isPlaying, false);
        expect(store.resumePosition(item.ref), const Duration(minutes: 4));
        await tester.tap(
          find.text(restart ? 'البدء من جديد' : 'استئناف التشغيل'),
        );
        await settle(tester);
        expect(
          engine!.value.position,
          restart ? Duration.zero : const Duration(minutes: 4),
        );
        engine!.state.value = engine!.value.copyWith(
          position: const Duration(minutes: 5),
        );
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
        await settle(tester);
        final restored = await tester.runAsync(LocalLibraryStore.create);
        expect(restored!.resumePosition(item.ref), const Duration(minutes: 5));
        restored.dispose();
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pumpWidget(const SizedBox());
        await settle(tester);
        store.dispose();
        api.close();
      },
    );
  }
  test('history selects its exact episode reference instead of the first episode of a work', () {
    const e = WatchEntry(
      contentRef: 'tmdb:tv:42',
      contentId: '42',
      title: 'مسلسل',
      poster: '',
      type: 'series',
      positionMs: 60000,
      durationMs: 180000,
      updatedAtMs: 1,
      episodeNumber: 21,
      playbackRef: 'source:ahwak:aaaaaaaaaaaaaaaaaaaaaaaa:s2:e21',
    );
    expect(
      historyPlaybackReference(e),
      'source:ahwak:aaaaaaaaaaaaaaaaaaaaaaaa:s2:e21',
    );
  });
  testWidgets(
    'a checkpoint from another episode cannot open a resume prompt or seek the player',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final series = item.copyWith(type: 'series', season: 1);
      await store.recordProgress(
        item: series,
        position: const Duration(minutes: 4),
        duration: const Duration(minutes: 20),
        episodeNumber: 1,
      );
      final wrong = store.history.single;
      final api = _FixtureApi();
      FakeEngine? engine;
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: store,
            item: series.copyWith(episode: 2),
            title: 'الحلقة 2',
            episodeNumber: 2,
            watchEntry: wrong,
            mediaPath: 'https://media.example/video.mp4',
            mediaType: 'mp4',
            playbackMode: 'edge_direct',
            playerFactory: (uri, type, headers, software) =>
                engine = FakeEngine(
                  uri,
                  mediaType: type,
                  headers: headers,
                  software: software,
                  fail: false,
                ),
          ),
        ),
      );
      await settle(tester);
      expect(find.text('استئناف التشغيل'), findsNothing);
      expect(engine!.value.position, const Duration());
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
      api.close();
      store.dispose();
    },
  );
}
