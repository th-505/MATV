import 'package:flutter/material.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'phase2_player_test.dart' show FakeEngine;
import 'player_pip_handoff_test.dart' show FixtureApi;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/desktop_window_io.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('window_manager');
  var fullscreen = false;
  final transitions = <bool>[];
  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    fullscreen = false;
    transitions.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'isFullScreen') return fullscreen;
          if (call.method == 'setFullScreen') {
            fullscreen = (call.arguments as Map)['isFullScreen'] as bool;
            transitions.add(fullscreen);
          }
          return null;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  test(
    'episode replacement cannot let old player exit the new fullscreen window',
    () async {
      final first = DesktopWindowBridge(), next = DesktopWindowBridge();
      expect(await first.enter(), isTrue);
      expect(await next.enter(), isTrue);
      await first.leave();
      expect(fullscreen, isTrue);
      expect(await next.setFullscreen(false), isTrue);
      expect(await next.setFullscreen(true), isTrue);
      await next.leave();
      expect(fullscreen, isFalse);
      expect(transitions, [true, true, false, true, false]);
    },
  );
  test(
    'leaving playback preserves an already fullscreen desktop window',
    () async {
      fullscreen = true;
      final session = DesktopWindowBridge();
      await session.enter();
      await session.leave();
      expect(fullscreen, isTrue);
    },
  );
  testWidgets(
    'Escape restores window controls even when the video decoder failed',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = FixtureApi();
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: store,
            item: const CatalogItem(
              id: 'fixture',
              ref: 'legacy:fixture',
              title: 'fixture',
              poster: '',
              type: 'movie',
            ),
            title: 'fixture',
            mediaPath: 'https://fixtures.example/video.mp4',
            mediaType: 'mp4',
            playbackMode: 'direct',
            persistProgress: false,
            playerFactory: (uri, mediaType, headers, software) => FakeEngine(
              uri,
              mediaType: mediaType,
              headers: headers,
              software: software,
              fail: true,
            ),
          ),
        ),
      );
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pumpAndSettle();
      expect(
        fullscreen,
        isTrue,
        reason: 'platform=$defaultTargetPlatform; transitions=$transitions',
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pumpAndSettle();
      expect(fullscreen, isFalse);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyF);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pumpAndSettle();
      expect(fullscreen, isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pumpAndSettle();
      expect(fullscreen, isFalse);
      api.close();
      store.dispose();
      debugDefaultTargetPlatformOverride = null;
    },
  );

  test('phones do not call the desktop window plugin', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final session = DesktopWindowBridge();
    expect(await session.enter(), isFalse);
    expect(await session.setFullscreen(true), isFalse);
    await session.leave();
    expect(transitions, isEmpty);
  });
}
