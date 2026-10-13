import 'dart:convert';
import 'dart:io';
import 'package:media_kit/media_kit.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/stream_bridge_native.dart';
import 'phase2_live_client.dart' show DevelopmentProxy;

Future<void> main(List<String> args) async {
  final ca = Platform.environment['CODEX_PROXY_CERT'];
  if (ca != null) SecurityContext.defaultContext.setTrustedCertificates(ca);
  HttpOverrides.global = DevelopmentProxy();
  MediaKit.ensureInitialized(libmpv: args[0]);
  final api = MitvApi(
      baseUri:
          Uri.parse(args.length > 1 ? args[1] : 'https://matv.onrender.com'));
  final bridge = LocalStreamBridge();
  final player = Player(
      configuration:
          const PlayerConfiguration(vo: 'null', bufferSize: 16 * 1024 * 1024));
  try {
    final items = await api.category('alooy-series');
    final series = await api.details(items.first.ref);
    final details =
        await api.resolvePlayback(series.episodes.first.ref, refresh: true);
    final uri = await bridge.open(
        Uri.parse(details.mediaPath), details.playbackHeaders);
    await (player.platform as NativePlayer).setProperty('ao', 'null');
    await player.setVideoTrack(VideoTrack.auto());
    await player
        .open(Media(uri.toString()), play: true)
        .timeout(const Duration(seconds: 30));
    await player.stream.width
        .firstWhere((w) => w != null && w > 0)
        .timeout(const Duration(seconds: 30));
    await player.stream.position
        .firstWhere((p) => p > const Duration(milliseconds: 250))
        .timeout(const Duration(seconds: 20));
    final width = player.state.width, height = player.state.height;
    await player.seek(const Duration(seconds: 60));
    await player.stream.position
        .firstWhere((p) => p > const Duration(milliseconds: 60500))
        .timeout(const Duration(seconds: 20));
    stdout.writeln(jsonEncode({
      'source': 'alooy',
      'title': items.first.title,
      'mode': details.playbackMode,
      'local_bridge': uri.host == '127.0.0.1',
      'decoded': true,
      'width': width,
      'height': height,
      'seek_seconds': player.state.position.inSeconds,
      'physical_device_tested': false
    }));
  } finally {
    await player.dispose();
    await bridge.close();
    api.close();
  }
}
