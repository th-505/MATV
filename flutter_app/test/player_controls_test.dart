import 'package:mitv/src/player_controls.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final width in [280.0, 320.0, 600.0, 1280.0, 1920.0]) {
    testWidgets('RTL transport stays LTR and fits width $width', (tester) async {
      tester.view.physicalSize = Size(width, 600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var rewind = 0;
      var forward = 0;
      await tester.pumpWidget(MaterialApp(home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: PlayerControls(
          isPlaying: false, isTv: false, playbackSpeed: 1,
          onRewind: () => rewind++, onForward: () => forward++,
          onTogglePlay: () {}, onPlaybackSpeedChanged: (_) {},
        )),
      )));
      final back = find.byKey(const Key('player-rewind'));
      final play = find.byKey(const Key('player-play-toggle'));
      final next = find.byKey(const Key('player-forward'));
      expect(tester.getCenter(back).dx, lessThan(tester.getCenter(play).dx));
      expect(tester.getCenter(play).dx, lessThan(tester.getCenter(next).dx));
      await tester.tap(back);
      await tester.tap(next);
      expect(rewind, 1);
      expect(forward, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('TV player starts focused on play and D-Pad moves across controls', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PlayerControls(
          isPlaying: false,
          isTv: true,
          playbackSpeed: 1.0,
          onRewind: () {},
          onTogglePlay: () {},
          onForward: () {},
          onPlaybackSpeedChanged: (_) {},
        ),
      ),
    ));
    await tester.pump();

    final play = tester.widget<IconButton>(find.byKey(const Key('player-play-toggle')));
    final forward = tester.widget<IconButton>(find.byKey(const Key('player-forward')));
    final rewind = tester.widget<IconButton>(find.byKey(const Key('player-rewind')));

    expect(play.focusNode?.hasFocus, isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    expect(forward.focusNode?.hasFocus, isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.pump();
    expect(play.focusNode?.hasFocus, isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.pump();
    expect(rewind.focusNode?.hasFocus, isTrue);
  });

  testWidgets('playback speed menu emits selected supported speed', (tester) async {
    double? selected;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PlayerControls(
          isPlaying: true,
          isTv: false,
          playbackSpeed: 1.0,
          onRewind: () {},
          onTogglePlay: () {},
          onForward: () {},
          onPlaybackSpeedChanged: (value) => selected = value,
        ),
      ),
    ));

    await tester.tap(find.byKey(const Key('player-speed')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('player-speed-1.5x')));
    await tester.pumpAndSettle();
    expect(selected, 1.5);
  });

  testWidgets('mobile player controls do not steal autofocus', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PlayerControls(
          isPlaying: true,
          isTv: false,
          playbackSpeed: 1.0,
          onRewind: () {},
          onTogglePlay: () {},
          onForward: () {},
          onPlaybackSpeedChanged: (_) {},
        ),
      ),
    ));
    await tester.pump();

    final play = tester.widget<IconButton>(find.byKey(const Key('player-play-toggle')));
    expect(play.autofocus, isFalse);
  });
}
