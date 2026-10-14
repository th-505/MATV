import 'dart:convert';
import 'dart:io';

import 'package:mitv/src/universal_player.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart' as mk;

void main() {
  testWidgets('unified adapter decodes and seeks a real local MP4 with libmpv',
      (tester) async {
    await tester.runAsync(() async {
      mk.MediaKit.ensureInitialized(
          libmpv: Platform.environment['MITV_NATIVE_LIBMPV']);
      final engine =
          mk.Player(configuration: const mk.PlayerConfiguration(vo: 'null'));
      final native = engine.platform;
      expect(native, isA<mk.NativePlayer>());
      await (native as mk.NativePlayer).setProperty('ao', 'null');
      await engine.setVideoTrack(mk.VideoTrack.auto());
      final player = UniversalPlayer(
          File(Platform.environment['MITV_SMOKE_FIXTURE']!).uri,
          mediaType: 'mp4',
          mediaKitPlayerFactory: () => engine,
          // No Flutter texture is needed to inspect decoded frames in headless CI.
          videoOutputFactory: (player, configuration) => const SizedBox());
      try {
        await player.initialize();
        await player.play();
        if (engine.state.width == null) {
          await engine.stream.width
              .firstWhere((width) => width != null && width > 0)
              .timeout(const Duration(seconds: 15));
        }
        await engine.stream.position
            .firstWhere(
                (position) => position > const Duration(milliseconds: 300))
            .timeout(const Duration(seconds: 15));
        await player.seekTo(const Duration(seconds: 1));
        await engine.stream.position
            .firstWhere(
                (position) => position > const Duration(milliseconds: 1200))
            .timeout(const Duration(seconds: 15));
        expect(player.value.isInitialized, true);
        expect(player.value.hasError, false);
        expect(player.value.size.width, greaterThan(0));
        expect(player.value.size.height, greaterThan(0));
        expect(player.value.position, greaterThan(const Duration(seconds: 1)));
        stdout.writeln(jsonEncode({
          'adapter': 'UniversalPlayer',
          'platform': 'Linux NativePlayer/libmpv',
          'decoded': true,
          'width': player.value.size.width,
          'height': player.value.size.height,
          'position_ms': player.value.position.inMilliseconds,
          'physical_device_tested': false
        }));
      } finally {
        await player.dispose();
      }
    });
  },
      skip: Platform.environment['MITV_NATIVE_LIBMPV'] == null ||
          Platform.environment['MITV_SMOKE_FIXTURE'] == null);
}
