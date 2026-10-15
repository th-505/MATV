import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:enough_convert/windows.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:mitv/src/subtitle_delay.dart';
import 'package:mitv/src/subtitle_service.dart';
import 'package:mitv/src/subtitle_temporary_store_native.dart' as storage;

/// Opt in with the same libmpv and local MP4 fixture as the decoder smoke test.
/// This runs the real subtitle demuxer and typed native property API, not a mock.
void main() {
  final library = Platform.environment['MITV_NATIVE_LIBMPV'];
  final fixture = Platform.environment['MITV_SMOKE_FIXTURE'];
  testWidgets(
    'libmpv injects normalized Arabic UTF8/CP1256 captions and applies real subtitle delay',
    (tester) async {
      await tester.runAsync(() async {
        mk.MediaKit.ensureInitialized(libmpv: library);
        final temporary = await Directory.systemTemp.createTemp(
          'mitv-subtitle-native-proof-',
        );
        final service = SubtitleService(
          store: storage.createSubtitleTemporaryStore(
            temporaryDirectory: () async => temporary,
          ),
        );
        final player = mk.Player(
          configuration: const mk.PlayerConfiguration(vo: 'null'),
        );
        final native = player.platform as mk.NativePlayer;
        const captionText = 'مرحبًا بالعالم';
        const srt = '1\n00:00:00,100 --> 00:00:04,000\n$captionText\n';
        final decoded = <String>[];
        try {
          await native.setProperty('ao', 'null');
          await player.open(
            mk.Media(File(fixture!).uri.toString()),
            play: false,
          );
          for (final encoding in ['UTF-8', 'Windows-1256']) {
            final bytes = encoding == 'UTF-8'
                ? utf8.encode(srt)
                : const Windows1256Codec().encode(srt);
            final prepared = await service.loadLocalBytes(
              Uint8List.fromList(bytes),
              '$encoding.srt',
            );
            expect(
              await File.fromUri(
                Uri.parse(prepared.uri),
              ).readAsString(encoding: utf8),
              srt,
            );
            await player.setSubtitleTrack(
              mk.SubtitleTrack.uri(
                prepared.uri,
                title: 'العربية $encoding',
                language: 'ara',
              ),
            );
            final visible = player.stream.subtitle
                .firstWhere((lines) => lines.join('\n').contains(captionText))
                .timeout(const Duration(seconds: 15));
            await player.seek(const Duration(milliseconds: 300));
            await player.play();
            await visible;
            await player.pause();
            expect(await native.getProperty('sub-text'), contains(captionText));
            decoded.add(encoding);
          }
          for (final seconds in [0.5, -0.5, 0.0]) {
            expect(await applyNativeSubtitleDelay(player, seconds), true);
            expect(
              double.parse(await native.getProperty('sub-delay')),
              seconds,
            );
          }
          expect(await applyNativeSubtitleDelay(player, double.nan), false);
          expect(await applyNativeSubtitleDelay(player, 121), false);
          await player.setSubtitleTrack(mk.SubtitleTrack.no());
          expect(await native.getProperty('sid'), 'no');
          stdout.writeln(
            jsonEncode({
              'engine': 'NativePlayer/libmpv',
              'subtitle_encodings_decoded': decoded,
              'subtitle_text': captionText,
              'native_sub_delay_seconds_verified': [0.5, -0.5, 0],
              'off_verified': true,
              'physical_device_tested': false,
            }),
          );
        } finally {
          await player.dispose();
          await service.dispose();
          expect(await temporary.list().toList(), isEmpty);
          await temporary.delete(recursive: true);
        }
      });
    },
    timeout: const Timeout(Duration(minutes: 1)),
    skip: library == null || fixture == null,
  );
}
