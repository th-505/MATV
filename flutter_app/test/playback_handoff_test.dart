import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/playback_handoff.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/app_target.dart';
import 'package:mitv/src/cloud_library.dart';

const entry = WatchEntry(
  contentRef: 'tmdb:tv:42',
  contentId: '42',
  title: 'عمل تجريبي',
  poster: '',
  type: 'series',
  positionMs: 1200456,
  durationMs: 2400000,
  updatedAtMs: 1234,
  episodeId: 's2:e3',
  seasonNumber: 2,
  episodeNumber: 3,
  playbackRef: 'tmdb:tv:42:s2:e3',
);
void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);
  test(
    'handoff sends exact episode and clock, without media credentials',
    () async {
      final calls = <Map<String, dynamic>>[];
      final bridge = PlaybackHandoff(
        rpc: (name, params) async {
          calls.add({'name': name, ...params});
          return null;
        },
      );
      if (isTvTarget) {
        await expectLater(bridge.send('target', entry), throwsStateError);
        expect(calls, isEmpty);
        await expectLater(
          CloudLibrarySync.playbackRpc('najd_playback_send', {}),
          throwsStateError,
        );
      } else {
        await bridge.send('target', entry);
        final payload = calls.single['p_payload'] as Map;
        expect(payload['position_ms'], 1200456);
        expect(payload['season_number'], 2);
        expect(payload['episode_number'], 3);
        expect(payload.containsKey('media_url'), isFalse);
        expect(payload.containsKey('headers'), isFalse);
      }
    },
  );
  testWidgets(
    'receiver requires consent, opens once at sender clock and stops background polling',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;
      final calls = <String>[];
      WatchEntry? received;
      final bridge = PlaybackHandoff(
        rpc: (name, params) async {
          calls.add(name);
          if (name == 'najd_playback_inbox') {
            return [
              {'id': 'transfer-1', 'payload': entry.toJson()},
            ];
          }
          return null;
        },
      );
      await tester.pumpWidget(
        MaterialApp(
          home: PlaybackInbox(
            transport: bridge,
            onOpen: (value) => received = value,
            child: const Scaffold(body: Text('جاهز')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(received, isNull);
      expect(find.text('طلب تشغيل من جهازك'), findsOneWidget);
      await tester.tap(find.text('تشغيل هنا'));
      await tester.pumpAndSettle();
      expect(received?.positionMs, 1200456);
      expect(received?.episodeNumber, 3);
      expect(calls.where((c) => c == 'najd_playback_ack').length, 1);
      await tester.pump(const Duration(seconds: 8));
      await tester.pumpAndSettle();
      expect(find.text('طلب تشغيل من جهازك'), findsNothing);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final before = calls.length;
      await tester.pump(const Duration(seconds: 16));
      expect(calls.length, before);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox());
      debugDefaultTargetPlatformOverride = null;
    },
  );
}
