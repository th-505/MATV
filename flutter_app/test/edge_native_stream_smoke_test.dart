import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/universal_player.dart';

/// Explicit local-client integration check. The edge resolver returns JSON;
/// only this test's libmpv client fetches and decodes the original video.
class _InheritedProxy extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) => HttpClient.findProxyFromEnvironment(uri,
        environment: Platform.environment);
    return client;
  }
}

void main() {
  final library = Platform.environment['MITV_NATIVE_LIBMPV'];
  final ref = Platform.environment['MITV_SMOKE_EDGE_REF'];
  testWidgets('real edge HLS decodes and seeks through UniversalPlayer/libmpv',
      (tester) async {
    await tester.runAsync(() async {
      final previousOverrides = HttpOverrides.current;
      final ca = Platform.environment['CODEX_PROXY_CERT'];
      if (ca != null) {
        SecurityContext.defaultContext.setTrustedCertificates(ca);
      }
      HttpOverrides.global = _InheritedProxy();
      mk.MediaKit.ensureInitialized(libmpv: library);
      final api = MitvApi();
      UniversalPlayer? player;
      mk.Player? engine;
      try {
        final playback = await api
            .resolvePlayback(ref!, refresh: true)
            .timeout(const Duration(seconds: 40));
        final source = playback.mediaSources.firstWhere((s) =>
            s.providerId == 'laroza' &&
            ['hls', 'm3u8'].contains(s.mediaType) &&
            s.expiresAt?.isAfter(DateTime.now()) == true);
        expect(source.playbackMode, 'edge_direct');
        final uri = api.mediaUri(source.mediaPath,
            playbackMode: source.playbackMode, expiresAt: source.expiresAt);
        expect(uri.scheme, 'https');
        expect(uri.host, isNot(contains('onrender.com')));
        expect(uri.host, isNot(contains('workers.dev')));
        expect(source.headers['Referer'], isNotEmpty);
        expect(source.headers['User-Agent'], isNotEmpty);
        final nativeEngine = mk.Player(
            configuration: const mk.PlayerConfiguration(
                vo: 'null', bufferSize: 4 * 1024 * 1024));
        engine = nativeEngine;
        final native = nativeEngine.platform as mk.NativePlayer;
        await native.setProperty('ao', 'null');
        final proxy = Platform.environment['https_proxy'] ??
            Platform.environment['HTTPS_PROXY'];
        if (proxy != null) {
          await native.setProperty('http-proxy', proxy);
          const protocols = 'http,https,tls,tcp,crypto,httpproxy,data';
          await native.setProperty('demuxer-lavf-o',
              'protocol_whitelist=%${protocols.length}%$protocols');
        }
        if (ca != null) await native.setProperty('tls-ca-file', ca);
        await nativeEngine.setVideoTrack(mk.VideoTrack.auto());
        final adapter = UniversalPlayer(uri,
            mediaType: source.mediaType,
            headers: source.headers,
            mediaKitPlayerFactory: () => nativeEngine,
            // Rendering a Flutter texture requires a device/window. This seam
            // changes only output; the adapter and decoder remain real.
            videoOutputFactory: (_, configuration) {
              expect(configuration.enableHardwareAcceleration, true);
              return const SizedBox();
            });
        player = adapter;
        expect(adapter.headers, source.headers);
        await adapter.initialize().timeout(const Duration(seconds: 40));
        await adapter.play();
        if ((nativeEngine.state.width ?? 0) <= 0) {
          await nativeEngine.stream.width
              .firstWhere((w) => w != null && w > 0)
              .timeout(const Duration(seconds: 30));
        }
        await nativeEngine.stream.position
            .firstWhere((p) => p > const Duration(milliseconds: 500))
            .timeout(const Duration(seconds: 30));
        final frame = await nativeEngine
            .screenshot(format: 'image/png')
            .timeout(const Duration(seconds: 10));
        expect(frame, isNotNull, reason: 'A decoded video frame is required');
        expect(frame!.take(8), [137, 80, 78, 71, 13, 10, 26, 10]);
        await adapter.seekTo(const Duration(seconds: 1));
        await nativeEngine.stream.position
            .firstWhere((p) => p > const Duration(milliseconds: 1200))
            .timeout(const Duration(seconds: 20));
        expect(adapter.value.isInitialized, true);
        expect(adapter.value.hasError, false);
        expect(adapter.value.size.width, greaterThan(0));
        expect(adapter.value.size.height, greaterThan(0));
        stdout.writeln(jsonEncode({
          'adapter': 'UniversalPlayer',
          'engine': 'Linux NativePlayer/libmpv',
          'provider': source.providerId,
          'source_ref': ref,
          'format': source.mediaType,
          'playback_mode': source.playbackMode,
          'origin': uri.origin,
          'preserved_header_names': source.headers.keys.toList()..sort(),
          'decoded_frame_png_bytes': frame.length,
          'width': adapter.value.size.width,
          'height': adapter.value.size.height,
          'position_ms': adapter.value.position.inMilliseconds,
          'seek_seconds': 1,
          'cloud_video_proxy': false,
          'physical_device_tested': false,
        }));
      } finally {
        if (player != null) {
          await player.dispose();
        } else {
          await engine?.dispose();
        }
        api.close();
        HttpOverrides.global = previousOverrides;
      }
    });
  },
      timeout: const Timeout(Duration(minutes: 3)),
      skip: library == null || ref == null);
}
