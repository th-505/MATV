import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/download_service.dart';
import 'phase2_live_client.dart' show DevelopmentProxy;

Future<void> main(List<String> args) async {
  final ca = Platform.environment['CODEX_PROXY_CERT'];
  if (ca != null) SecurityContext.defaultContext.setTrustedCertificates(ca);
  HttpOverrides.global = DevelopmentProxy();
  MediaKit.ensureInitialized(libmpv: args[0]);
  final api = MitvApi();
  final player = Player(
      configuration:
          const PlayerConfiguration(vo: 'null', bufferSize: 8 * 1024 * 1024));
  Directory? directory;
  DownloadService? service;
  final mode = args.length > 1 ? args[1] : 'live';
  try {
    Uri uri;
    Map<String, String> headers = const {};
    int? downloadedBytes;
    if (mode == 'file') {
      final original = await File(args[2]).readAsBytes();
      directory =
          await Directory.systemTemp.createTemp('mitv-decoded-download-');
      final offset = original.length ~/ 3;
      await File('${directory.path}/.mitv-fixture.part')
          .writeAsBytes(original.take(offset).toList());
      service = DownloadService(
          directoryProvider: () async => directory!,
          client: MockClient((request) async {
            if (request.headers['range'] != 'bytes=$offset-' ||
                request.headers['Referer'] !=
                    'https://source.example/watch?key=one' ||
                request.headers['Origin'] != 'https://source.example') {
              throw StateError('PROTECTED_DOWNLOAD_HEADERS_FAILED');
            }
            return http.Response.bytes(original.skip(offset).toList(), 206,
                headers: {
                  'content-type': 'video/mp4',
                  'content-range':
                      'bytes $offset-${original.length - 1}/${original.length}',
                  'content-length': '${original.length - offset}'
                });
          }));
      final downloaded = await service.download(
          Uri.parse('https://media.example/sample.mp4'),
          resumeKey: 'fixture',
          fallbackName: 'sample.mp4',
          headers: {
            'Referer': 'https://source.example/watch?key=one',
            'Origin': 'https://source.example',
            'User-Agent': 'fixture'
          });
      downloadedBytes = downloaded.bytes;
      if (downloadedBytes != original.length) {
        throw StateError('DOWNLOAD_LENGTH_MISMATCH');
      }
      uri = File(downloaded.path).uri;
    } else {
      final matches = await api.matches();
      final match = matches.firstWhere((m) => m.status == 'live',
          orElse: () => matches.first);
      final resolved = await api.resolvePlayback(match.ref, refresh: true);
      uri =
          api.mediaUri(resolved.mediaPath, playbackMode: resolved.playbackMode);
      headers = resolved.playbackHeaders;
    }
    final native = player.platform as NativePlayer;
    await native.setProperty('ao', 'null');
    final proxy = Platform.environment['https_proxy'] ??
        Platform.environment['HTTPS_PROXY'];
    if (uri.scheme == 'https' && proxy != null) {
      await native.setProperty('http-proxy', proxy);
      const protocols = 'http,https,tls,tcp,crypto,httpproxy,data';
      await native.setProperty('demuxer-lavf-o',
          'protocol_whitelist=%${protocols.length}%$protocols');
    }
    if (ca != null) await native.setProperty('tls-ca-file', ca);
    await player.setVideoTrack(VideoTrack.auto());
    await player
        .open(Media(uri.toString(), httpHeaders: headers), play: true)
        .timeout(const Duration(seconds: 30));
    if (player.state.width == null) {
      await player.stream.width
          .firstWhere((w) => w != null && w > 0)
          .timeout(const Duration(seconds: 30));
    }
    await player.stream.position
        .firstWhere((p) => p > const Duration(milliseconds: 500))
        .timeout(const Duration(seconds: 20));
    if (mode == 'file') {
      await player.seek(const Duration(seconds: 1));
      await player.stream.position
          .firstWhere((p) => p > const Duration(milliseconds: 1200))
          .timeout(const Duration(seconds: 10));
    }
    stdout.writeln(jsonEncode({
      'mode': mode,
      'engine': 'media_kit/libmpv',
      'decoded': true,
      'width': player.state.width,
      'height': player.state.height,
      'position_ms': player.state.position.inMilliseconds,
      'downloaded_bytes': downloadedBytes,
      'range_resumed': mode == 'file',
      'origin': uri.scheme == 'https' ? uri.origin : 'device-local-file',
      'physical_device_tested': false
    }));
  } finally {
    service?.close();
    await player.dispose();
    api.close();
    if (directory != null) await directory.delete(recursive: true);
  }
}
