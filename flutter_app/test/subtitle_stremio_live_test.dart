import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/io_client.dart';
import 'package:mitv/src/subtitle_service.dart';
import 'package:mitv/src/subtitle_temporary_store_native.dart' as storage;

/// One metadata lookup and one caption download from the local client only.
/// Disabled in routine CI to avoid consuming external quotas or requiring
/// production availability for reproducible unit tests.
void main() {
  test(
    'live Stremio v3 Arabic caption downloads without an API key',
    () async {
      final trust = SecurityContext(withTrustedRoots: true);
      final ca = Platform.environment['CODEX_PROXY_CERT'];
      if (ca != null) trust.setTrustedCertificates(ca);
      final transport = HttpClient(context: trust)
        ..findProxy = (uri) => HttpClient.findProxyFromEnvironment(
          uri,
          environment: Platform.environment,
        );
      final directory = await Directory.systemTemp.createTemp(
        'mitv-subtitle-live-proof-',
      );
      final service = SubtitleService(
        client: IOClient(transport),
        store: storage.createSubtitleTemporaryStore(
          temporaryDirectory: () async => directory,
        ),
      );
      try {
        final found = await service.searchStremio(
          imdbId: 'tt1375666',
          workIdentityVerified: true,
          mediaType: 'movie',
        );
        expect(found, isNotEmpty);
        final caption = await service.loadDescriptor(found.first);
        expect(caption.text, contains('-->'));
        expect(caption.text, matches(RegExp('[\u0600-\u06ff]')));
        expect(caption.text, isNot(contains('\ufffd')));
        final bytes = await File.fromUri(Uri.parse(caption.uri)).readAsBytes();
        expect(utf8.decode(bytes, allowMalformed: false), caption.text);
        stdout.writeln(
          jsonEncode({
            'provider': 'Stremio OpenSubtitles v3',
            'imdb_id': 'tt1375666',
            'arabic_results': found.length,
            'download_format': caption.format,
            'normalized_utf8_bytes': bytes.length,
            'metadata_encoding_hint': found.first.encodingHint,
            'arabic_text_verified': true,
            'api_key_required': false,
            'server_video_proxy': false,
            'physical_device_tested': false,
          }),
        );
      } finally {
        await service.dispose();
        expect(await directory.list().toList(), isEmpty);
        await directory.delete(recursive: true);
      }
    },
    timeout: const Timeout(Duration(minutes: 1)),
    skip: Platform.environment['MITV_LIVE_SUBTITLES'] != '1',
  );
}
