import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:al_qahtani/src/api_client.dart';

// Proxy/CA support is for the managed development environment only.
class EnvironmentProxy extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) => HttpClient.findProxyFromEnvironment(uri, environment: Platform.environment);
    return client;
  }
}

Future<void> main() async {
  final ca = Platform.environment['CODEX_PROXY_CERT'];
  if (ca != null) SecurityContext.defaultContext.setTrustedCertificates(ca);
  if (Platform.environment['https_proxy'] != null) HttpOverrides.global = EnvironmentProxy();
  final client = http.Client();
  final api = AlQahtaniApi(client: client, baseUri: Uri.parse('https://matv.onrender.com'));
  try {
    for (final category in ['3isk-latest', '3isk-turkish', '3isk-dubbed', '3isk-movies']) {
      final items = await api.category(category);
      if (items.isEmpty) throw StateError('EMPTY_CATEGORY');
      var ref = items.first.ref;
      final details = await api.details(ref);
      if (details.hasEpisodes) ref = details.episodes.first.ref;
      final playback = await api.resolvePlayback(ref, refresh: true);
      var uri = api.mediaUri(playback.mediaPath, playbackMode: playback.playbackMode, expiresAt: playback.expiresAt);
      int? segmentStatus;
      for (var depth = 0; depth < 4; depth++) {
        final manifest = await client.get(uri, headers: playback.playbackHeaders).timeout(const Duration(seconds: 30));
        if (manifest.statusCode != 200 || !manifest.body.trimLeft().startsWith('#EXTM3U')) throw StateError('BAD_MANIFEST');
        final lines = const LineSplitter().convert(manifest.body).map((line) => line.trim()).toList();
        final variant = lines.indexWhere((line) => line.startsWith('#EXT-X-STREAM-INF:'));
        if (variant >= 0) {
          uri = uri.resolve(lines.skip(variant + 1).firstWhere((line) => line.isNotEmpty && !line.startsWith('#')));
          api.mediaUri(uri.toString(), playbackMode: 'direct', expiresAt: playback.expiresAt);
          continue;
        }
        final segment = uri.resolve(lines.firstWhere((line) => line.isNotEmpty && !line.startsWith('#')));
        if (segment.origin != uri.origin) throw StateError('UNEXPECTED_SEGMENT_HOST');
        final request = http.Request('GET', segment)..headers.addAll({...playback.playbackHeaders, 'Range': 'bytes=0-1023'});
        final response = await client.send(request).timeout(const Duration(seconds: 30));
        segmentStatus = response.statusCode;
        if (![200, 206].contains(segmentStatus) || (await response.stream.first).isEmpty) throw StateError('BAD_SEGMENT');
        break;
      }
      if (segmentStatus == null) throw StateError('NO_SEGMENT');
      stdout.writeln(jsonEncode({'category': category, 'host': Uri.parse(playback.mediaPath).host,
        'playback': playback.playbackMode, 'manifest': 200, 'segment': segmentStatus,
        'referer': playback.playbackHeaders['Referer'], 'dart_client_verified': true}));
    }
  } catch (error) {
    stderr.writeln(jsonEncode({'failed': true, 'error_type': error.runtimeType.toString()}));
    exitCode = 1;
  } finally {
    api.close();
  }
}
