import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:mitv/src/api_client.dart';

class DevelopmentProxy extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) => HttpClient.findProxyFromEnvironment(uri,
        environment: Platform.environment);
    return client;
  }
}

Future<void> main(List<String> args) async {
  final ca = Platform.environment['CODEX_PROXY_CERT'];
  if (ca != null) SecurityContext.defaultContext.setTrustedCertificates(ca);
  HttpOverrides.global = DevelopmentProxy();
  MediaKit.ensureInitialized(libmpv: args[0]);
  final client = http.Client();
  final api = MitvApi(
      client: client, baseUri: Uri.parse('https://matv.onrender.com'));
  final results = <Map<String, Object?>>[];
  try {
    for (final category in ['movie-indian', 'series-foreign']) {
      final items = await api.category(category);
      var ref = items.first.ref;
      final details = await api.details(ref);
      if (details.hasEpisodes) ref = details.episodes.first.ref;
      final playback = await api.resolvePlayback(ref, refresh: true);
      final uri = api.mediaUri(playback.mediaPath,
          playbackMode: playback.playbackMode, expiresAt: playback.expiresAt);
      final player =
          Player(configuration: const PlayerConfiguration(vo: 'null'));
      final errors = <String>[];
      final subscription = player.stream.error.listen(errors.add);
      try {
        final native = player.platform as NativePlayer;
        await native.setProperty('ao', 'null');
        final proxy = Platform.environment['https_proxy'] ??
            Platform.environment['HTTPS_PROXY'];
        if (proxy != null) await native.setProperty('http-proxy', proxy);
        if (ca != null) await native.setProperty('tls-ca-file', ca);
        await player.setVideoTrack(VideoTrack.auto());
        await player
            .open(Media(uri.toString(), httpHeaders: playback.playbackHeaders),
                play: true)
            .timeout(const Duration(seconds: 40));
        await player.stream.position
            .firstWhere((p) => p > const Duration(milliseconds: 250))
            .timeout(const Duration(seconds: 40));
        if (player.state.width == null) {
          await player.stream.width
              .firstWhere((w) => w != null && w > 0)
              .timeout(const Duration(seconds: 20));
        }
        if (player.state.width == null) throw StateError('LIVE_DECODE_FAILED');
        results.add({
          'category': category,
          'title': items.first.title,
          'api': uri.origin,
          'playback_mode': playback.playbackMode,
          'decoded': true,
          'width': player.state.width,
          'height': player.state.height,
          'duration_seconds': player.state.duration.inSeconds
        });
      } finally {
        await subscription.cancel();
        await player.dispose();
      }
    }
    stdout.writeln(jsonEncode({
      'api': 'https://matv.onrender.com',
      'engine': 'media_kit/libmpv',
      'actual_network_video_decoded': true,
      'physical_device_tested': false,
      'results': results
    }));
  } finally {
    api.close();
  }
}
