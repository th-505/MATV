import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import 'package:mitv/src/up_next_prompt.dart';
import 'package:mitv/src/playback_timeline.dart';
import 'package:mitv/src/episode_preferences.dart';
import 'package:mitv/src/app_preferences.dart';
import 'package:mitv/src/all_provider_search.dart';
import 'package:mitv/src/api_client.dart';

Widget app(Widget child) => MaterialApp(
  home: Scaffold(body: SingleChildScrollView(child: child)),
);
VideoPlayerValue value({
  int seconds = 70,
  bool playing = true,
  bool buffering = false,
}) => VideoPlayerValue(
  duration: const Duration(seconds: 100),
  position: Duration(seconds: seconds),
  isInitialized: true,
  isPlaying: playing,
  isBuffering: buffering,
);
void main() {
  testWidgets(
    'up-next appears independently, waits ten playing seconds and advances once',
    (tester) async {
      final player = ValueNotifier(value(seconds: 60));
      var next = 0;
      await tester.pumpWidget(
        app(UpNextPrompt(player: player, onNext: () => next++)),
      );
      expect(find.byKey(const Key('up-next-prompt')), findsNothing);
      player.value = value(seconds: 70);
      await tester.pump();
      expect(find.text('الحلقة التالية • 10'), findsOneWidget);
      await tester.pump(const Duration(seconds: 9));
      expect(next, 0);
      await tester.pump(const Duration(seconds: 1));
      expect(next, 1);
      await tester.pump(const Duration(seconds: 12));
      expect(next, 1);
      await tester.pumpWidget(const SizedBox());
      player.dispose();
    },
  );
  testWidgets(
    'pause and buffering freeze the countdown; cancel also prevents completion-triggered advancement',
    (tester) async {
      final player = ValueNotifier(value());
      var next = 0;
      await tester.pumpWidget(
        app(UpNextPrompt(player: player, onNext: () => next++)),
      );
      player.value = value(playing: false);
      await tester.pump(const Duration(seconds: 15));
      expect(find.text('الحلقة التالية • 10'), findsOneWidget);
      player.value = value(buffering: true);
      await tester.pump(const Duration(seconds: 15));
      expect(next, 0);
      await tester.tap(find.byKey(const Key('up-next-cancel')));
      player.value = value(seconds: 100);
      await tester.pump(const Duration(seconds: 20));
      expect(next, 0);
      expect(find.byKey(const Key('up-next-prompt')), findsNothing);
      await tester.pumpWidget(const SizedBox());
      player.dispose();
    },
  );
  testWidgets(
    'timeline remains interactive while a prior seek is unresolved and ignores stale acknowledgements',
    (tester) async {
      final player = ValueNotifier(value(seconds: 10));
      final pending = <Completer<void>>[];
      final targets = <Duration>[];
      await tester.pumpWidget(
        app(
          PlaybackTimeline(
            player: player,
            seek: (target) {
              targets.add(target);
              final c = Completer<void>();
              pending.add(c);
              return c.future;
            },
            onStart: () {},
            onEnd: () {},
            onError: () {},
          ),
        ),
      );
      Slider slider() =>
          tester.widget(find.byKey(const Key('player-seek-slider')));
      slider().onChangeStart!(30000);
      slider().onChanged!(30000);
      slider().onChangeEnd!(30000);
      await tester.pump();
      expect(slider().value, 30000);
      slider().onChangeStart!(80000);
      slider().onChanged!(80000);
      await tester.pump();
      pending[0].complete();
      player.value = value(seconds: 30);
      await tester.pump();
      expect(slider().value, 80000);
      slider().onChangeEnd!(80000);
      await tester.pump();
      expect(targets.length, 2);
      pending[1].complete();
      player.value = value(seconds: 80);
      await tester.pump();
      expect(slider().value, 80000);
      await tester.pumpWidget(const SizedBox());
      player.dispose();
    },
  );
  testWidgets(
    'numeric episode group setting validates zero and persists an arbitrary user choice',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      await NajdPreferences.instance.load();
      await tester.pumpWidget(app(const EpisodePreferencesTile()));
      await tester.tap(find.byKey(const Key('setting-episode-group-size')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('episode-group-size-input')),
        '0',
      );
      await tester.tap(find.text('حفظ'));
      await tester.pump();
      expect(find.text('أدخل عددًا بين 1 و500'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('episode-group-size-input')),
        '33',
      );
      await tester.tap(find.text('حفظ'));
      await tester.pumpAndSettle();
      expect(NajdPreferences.instance.episodeGroupSize, 33);
      expect(
        (await SharedPreferences.getInstance()).getInt(
          'najd.episodes.group-size.v1',
        ),
        33,
      );
      await NajdPreferences.instance.setEpisodeGroupSize(24);
    },
  );
  testWidgets(
    'broad beta search dispatches multiple providers through Beta without pinning the current origin',
    (tester) async {
      final started = <String>[];
      final gates = <Completer<http.Response>>[];
      final root = MitvApi(
        providerBrowser: true,
        browserOrigin: 'old-provider-origin',
        client: MockClient((req) async {
          if (req.url.path == '/api/v1/explore/sources') {
            return http.Response(
              jsonEncode({
                'status': 'success',
                'data': [
                  {'id': 'ahwak', 'search': true},
                  {'id': 'laroza', 'search': true},
                ],
              }),
              200,
            );
          }
          expect(req.url.path, '/api/v1/browser/search');
          expect(req.url.queryParameters.containsKey('origin'), false);
          started.add(req.url.queryParameters['provider']!);
          final c = Completer<http.Response>();
          gates.add(c);
          return c.future;
        }),
      );
      final api = root.browserSession();
      await tester.pumpWidget(
        app(
          AllProviderSearchPanel(api: api, query: 'اسم العمل', onOpen: (_) {}),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(started.toSet(), {'ahwak', 'laroza'});
      for (final gate in gates) {
        gate.complete(
          http.Response(jsonEncode({'status': 'success', 'items': []}), 200),
        );
      }
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      api.close();
      root.close();
    },
  );
}
