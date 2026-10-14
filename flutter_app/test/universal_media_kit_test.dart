import 'package:mitv/src/universal_player.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:media_kit_video/media_kit_video.dart' as mv;
import 'support/recording_media_kit.dart';

void main() {
  for (final platform in [
    TargetPlatform.android,
    TargetPlatform.iOS,
    TargetPlatform.windows,
    TargetPlatform.macOS,
    TargetPlatform.linux,
  ]) {
    for (final format in ['mp4', 'hls', 'mkv', 'dash', 'webm', 'ts']) {
      test(
          '$platform $format uses media_kit with headers and hardware decoding',
          () async {
        debugDefaultTargetPlatformOverride = platform;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        final native = RecordingMediaKitPlatform();
        final facade = mk.Player(platformPlayer: native);
        mv.VideoControllerConfiguration? outputConfiguration;
        final requestHeaders = {
          'Referer': 'https://provider.example/watch/episode',
          'Origin': 'https://provider.example',
          'User-Agent': 'MITV-test-UA'
        };
        final uri = Uri.parse(
            'https://media.example/episode.$format?token=a%2Bb&expires=123');
        final player = UniversalPlayer(uri,
            mediaType: format,
            headers: requestHeaders,
            mediaKitPlayerFactory: () => facade,
            videoOutputFactory: (_, configuration) {
              outputConfiguration = configuration;
              return const SizedBox();
            });
        // Mutating the caller's map must not alter a protected media request.
        requestHeaders['Referer'] = 'https://wrong.example/';
        await player.initialize();
        await player.initialize();
        expect(player.usesExtendedEngine, true);
        expect(player.extendedPlayer, same(facade));
        expect(native.opened, hasLength(1));
        expect(native.opened.single.uri, uri.toString());
        expect(native.opened.single.httpHeaders, {
          'Referer': 'https://provider.example/watch/episode',
          'Origin': 'https://provider.example',
          'User-Agent': 'MITV-test-UA'
        });
        expect(outputConfiguration!.enableHardwareAcceleration, true);
        expect(outputConfiguration!.hwdec, isNot('no'));
        expect(player.value.isInitialized, true);
        expect(player.value.size, const Size(1920, 1080));
        await player.dispose();
        await player.dispose();
        expect(native.disposalCount, 1);
      });
    }
  }

  test('software retry disables GPU decoding without changing protected input',
      () async {
    final native = RecordingMediaKitPlatform();
    mv.VideoControllerConfiguration? configuration;
    final player =
        UniversalPlayer(Uri.parse('https://media.example/protected.m3u8'),
            mediaType: 'hls',
            software: true,
            headers: const {'Referer': 'https://provider.example/'},
            mediaKitPlayerFactory: () => mk.Player(platformPlayer: native),
            videoOutputFactory: (_, c) {
              configuration = c;
              return const SizedBox();
            });
    await player.initialize();
    expect(configuration!.enableHardwareAcceleration, false);
    expect(configuration!.hwdec, 'no');
    expect(native.opened.single.httpHeaders!['Referer'],
        'https://provider.example/');
    await player.dispose();
  });

  test('controls delegate to libmpv and failure retains the saved playhead',
      () async {
    final native = RecordingMediaKitPlatform();
    final player = UniversalPlayer(Uri.parse('https://media.example/a.mp4'),
        mediaType: 'mp4',
        mediaKitPlayerFactory: () => mk.Player(platformPlayer: native),
        videoOutputFactory: (player, configuration) => const SizedBox());
    await player.initialize();
    await player.play();
    await player.seekTo(const Duration(seconds: 23));
    await player.setVolume(0.35);
    await player.setPlaybackSpeed(1.5);
    await Future<void>.delayed(Duration.zero);
    expect(player.value.position, const Duration(seconds: 23));
    native.emitError('403 https://secret.example/a?token=must-not-leak');
    await Future<void>.delayed(Duration.zero);
    native.emitPosition(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(player.value.hasError, true);
    expect(player.value.position, const Duration(seconds: 23));
    expect(player.value.errorDescription, isNot(contains('secret.example')));
    expect(native.seeks.single, const Duration(seconds: 23));
    expect(native.volumes.single, 35);
    expect(native.rates.single, 1.5);
    await player.pause();
    expect(native.playCount, 1);
    expect(native.pauseCount, 1);
    await player.dispose();
    expect(native.disposalCount, 1);
    expect(() => player.play(), throwsStateError);
  });

  test('local files use the same decoder and retain their file URI', () async {
    final native = RecordingMediaKitPlatform();
    final uri = Uri.file('/tmp/MITV/Downloads/episode.mp4');
    final player = UniversalPlayer(uri,
        mediaType: 'mp4',
        mediaKitPlayerFactory: () => mk.Player(platformPlayer: native),
        videoOutputFactory: (player, configuration) => const SizedBox());
    await player.initialize();
    expect(native.opened.single.uri, anyOf(uri.toString(), uri.toFilePath()));
    await player.dispose();
  });

  test('failed open releases the player once when the page disposes it',
      () async {
    final native = RecordingMediaKitPlatform(failOpen: true);
    final player = UniversalPlayer(Uri.parse('https://media.example/bad.mp4'),
        mediaType: 'mp4',
        mediaKitPlayerFactory: () => mk.Player(platformPlayer: native),
        videoOutputFactory: (player, configuration) => const SizedBox());
    await expectLater(player.initialize(), throwsStateError);
    await player.dispose();
    await player.dispose();
    expect(native.disposalCount, 1);
  });
}
