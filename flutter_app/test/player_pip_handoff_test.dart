import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/pip_bridge.dart';
import 'package:mitv/src/player_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'phase2_player_test.dart' show FakeEngine;

class FixtureApi extends MitvApi {
  @override
  Uri mediaUri(
    String path, {
    bool download = false,
    String playbackMode = 'proxy',
    DateTime? expiresAt,
  }) => Uri.parse(path);
}

class FixturePip extends NajdPipBridge {
  final updates = StreamController<NajdPipEvent>.broadcast();
  Duration? enteredAt;
  bool closed = false;
  @override
  bool get needsNativeHandoff => true;
  @override
  Stream<NajdPipEvent> get events => updates.stream;
  @override
  Future<bool> supported(String format) async => true;
  @override
  Future<void> update({
    required bool playing,
    required double width,
    required double height,
  }) async {}
  @override
  Future<bool> enter({
    required String url,
    required Map<String, String> headers,
    required Duration position,
    required bool playing,
    required double rate,
    required double width,
    required double height,
  }) async {
    enteredAt = position;
    return true;
  }

  @override
  Future<void> close() async {
    closed = true;
  }
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets(
    'OS PiP transfers the clock, persists native progress and restores the same second',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create(),
          api = FixtureApi(),
          pip = FixturePip();
      late FakeEngine engine;
      const item = CatalogItem(
        id: 'pip',
        ref: 'legacy:pip',
        title: 'اختبار',
        poster: '',
        type: 'movie',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: store,
            item: item,
            title: item.title,
            mediaPath: 'https://media.example/test.mp4',
            mediaType: 'mp4',
            playbackMode: 'edge_direct',
            pipBridge: pip,
            playerFactory: (u, t, h, s) => engine = FakeEngine(
              u,
              mediaType: t,
              headers: h,
              software: s,
              fail: false,
            ),
          ),
        ),
      );
      await settle(tester);
      await engine.seekTo(const Duration(minutes: 2, seconds: 17));
      await tester.tap(find.byKey(const Key('player-more')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('player-more-pip')));
      await settle(tester);
      expect(pip.enteredAt, const Duration(minutes: 2, seconds: 17));
      expect(engine.value.isPlaying, false);
      pip.updates.add(
        const NajdPipEvent(
          active: true,
          position: Duration(minutes: 3, seconds: 11),
          duration: Duration(minutes: 10),
          playing: true,
        ),
      );
      await settle(tester);
      expect(store.history.single.positionMs, 191000);
      pip.updates.add(
        const NajdPipEvent(
          active: false,
          position: Duration(minutes: 3, seconds: 23),
          duration: Duration(minutes: 10),
          playing: true,
        ),
      );
      await settle(tester);
      expect(engine.value.position, const Duration(minutes: 3, seconds: 23));
      expect(engine.value.isPlaying, true);
      expect(store.history.single.positionMs, 203000);
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
      expect(pip.closed, true);
      final restored = await LocalLibraryStore.create();
      expect(restored.history.single.positionMs, 203000);
      restored.dispose();
      store.dispose();
      api.close();
      await pip.updates.close();
    },
  );
}
