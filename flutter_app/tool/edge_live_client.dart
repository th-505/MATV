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
  final api = MitvApi();
  final bridge = LocalStreamBridge(trustedEdge: true);
  final player = Player(
      configuration:
          const PlayerConfiguration(vo: 'null', bufferSize: 8 * 1024 * 1024));
  try {
    final ref = args.length > 1
        ? args[1]
        : 'alooy:L3dhdGNoL21hcmFzbGktYXIuaHRtbD9rZXk9dDNtdWdvMG1jb2h0';
    final details = await api.resolvePlayback(ref, refresh: true);
    final source = args.length > 2
        ? details.mediaSources.firstWhere((s) => s.provider == args[2])
        : details.mediaSources.first;
    final local = source.playbackMode == 'edge_local_proxy';
    final uri = local
        ? await bridge.open(Uri.parse(source.mediaPath), source.headers)
        : api.mediaUri(source.mediaPath, playbackMode: source.playbackMode);
    final native = player.platform as NativePlayer;
    await native.setProperty('ao', 'null');
    final proxy = Platform.environment['https_proxy'] ??
        Platform.environment['HTTPS_PROXY'];
    if (!local && proxy != null) {
      await native.setProperty('http-proxy', proxy);
      // Development-only transport permission for the managed HTTPS proxy.
      const protocols = 'http,https,tls,tcp,crypto,httpproxy,data';
      await native.setProperty('demuxer-lavf-o',
          'protocol_whitelist=%${protocols.length}%$protocols');
    }
    if (ca != null) await native.setProperty('tls-ca-file', ca);
    await player.setVideoTrack(VideoTrack.auto());
    await player
        .open(
            Media(uri.toString(),
                httpHeaders: local ? const {} : source.headers),
            play: true)
        .timeout(const Duration(seconds: 30));
    if (player.state.width == null) {
      await player.stream.width
          .firstWhere((w) => w != null && w > 0)
          .timeout(const Duration(seconds: 30));
    }
    await player.stream.position
        .firstWhere((p) => p > const Duration(milliseconds: 250))
        .timeout(const Duration(seconds: 20));
    final width = player.state.width, height = player.state.height;
    await player.seek(const Duration(seconds: 60));
    await player.stream.position
        .firstWhere((p) => p > const Duration(milliseconds: 60500))
        .timeout(const Duration(seconds: 20));
    stdout.writeln(jsonEncode({
      'provider': source.provider,
      'resolver': 'cloudflare-edge',
      'mode': source.playbackMode,
      'local_bridge': local,
      'decoded': true,
      'width': width,
      'height': height,
      'seek_seconds': 60,
      'physical_device_tested': false
    }));
  } finally {
    await player.dispose();
    await bridge.close();
    api.close();
  }
}
