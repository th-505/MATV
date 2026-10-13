import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:media_kit/media_kit.dart';

// This tool uses a temporary Linux library and generated local media fixtures.
// It does not install or configure a decoder on user devices.
Future<void> main(List<String> args) async {
  MediaKit.ensureInitialized(libmpv: args[0]);
  final mapping = args.length > 2
      ? jsonDecode(File(args[2]).readAsStringSync()) as Map<String, dynamic>
      : null;
  final rows = <Map<String, Object?>>[];
  for (final file in [
    'sample.mp4',
    'sample.mkv',
    'sample.webm',
    'sample.ts',
    'master.m3u8',
    'master.mpd'
  ]) {
    final player = Player(configuration: const PlayerConfiguration(vo: 'null'));
    final errors = <String>[];
    final subscription = player.stream.error.listen(errors.add);
    try {
      if (player.platform is NativePlayer) {
        await (player.platform as NativePlayer).setProperty('ao', 'null');
      }
      await player.setVideoTrack(VideoTrack.auto());
      await player
          .open(Media(mapping?[file] as String? ?? '${args[1]}/$file'),
              play: true)
          .timeout(const Duration(seconds: 12));
      await player.stream.position
          .firstWhere((v) => v > const Duration(milliseconds: 250))
          .timeout(const Duration(seconds: 12));
      if (player.state.width == null) {
        await player.stream.width
            .firstWhere((w) => w != null && w > 0)
            .timeout(const Duration(seconds: 12));
      }
      if (player.state.tracks.video
              .where((v) => v.id != 'auto' && v.id != 'no')
              .isEmpty ||
          errors.isNotEmpty) {
        throw StateError('CODEC_VALIDATION_FAILED');
      }
      await player.seek(const Duration(seconds: 1));
      await player.setVolume(40);
      await player.setRate(1.25);
      rows.add({
        'format': file.split('.').last,
        'duration_ms': player.state.duration.inMilliseconds,
        'video_tracks': player.state.tracks.video.length,
        'audio_tracks': player.state.tracks.audio.length,
        'width': player.state.width,
        'height': player.state.height,
        'decoded': true
      });
    } finally {
      await subscription.cancel();
      await player.dispose();
    }
  }
  stdout.writeln(jsonEncode({
    'engine': 'media_kit/libmpv',
    'location': 'Linux headless development test',
    'results': rows,
    'physical_device_tested': false
  }));
}
