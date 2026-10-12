import 'dart:convert';
import 'package:al_qahtani/src/api_client.dart';
import 'package:al_qahtani/src/models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  final expires = DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  final url = 'https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=fixture&expires=$expires';
  test('3isk direct playback goes to CDN and rejects relay/download misuse', () {
    final api = AlQahtaniApi(baseUri: Uri.parse('https://runtime.example'));
    expect(api.mediaUri(url, playbackMode: 'direct').toString(), url);
    expect(() => api.mediaUri(url), throwsA(isA<ApiException>()));
    expect(() => api.mediaUri(url, playbackMode: 'direct', download: true), throwsA(isA<ApiException>()));
    for (final unsafe in [url.replaceFirst('s1.ukrcdn.xyz', 'evil.example'), url.replaceFirst('https:', 'http:'), url.replaceFirst('s1.ukrcdn.xyz', 's1.ukrcdn.xyz.evil.example')]) {
      expect(() => api.mediaUri(unsafe, playbackMode: 'direct'), throwsA(isA<ApiException>()));
    }
    expect(() => api.mediaUri('https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=x&expires=1', playbackMode: 'direct'), throwsA(isA<ApiException>()));
  });
  test('direct metadata and expiry survive mapping; refresh forces resolver renewal', () async {
    final payload = {'status': 'success', 'playback_mode': 'direct', 'media_url': url, 'media_type': 'm3u8', 'expires_at': DateTime.fromMillisecondsSinceEpoch(expires * 1000, isUtc: true).toIso8601String(), 'download_available': false};
    final details = TitleDetails.fromJson(payload);
    expect(details.playbackMode, 'direct'); expect(details.mediaPath, url);
    expect(details.downloadAvailable, false); expect(details.expiresAt!.isUtc, true);
    final api = AlQahtaniApi(client: MockClient((request) async {
      expect(request.url.path, '/api/cinema/details'); expect(request.url.queryParameters['refresh'], '1');
      return http.Response(jsonEncode(payload), 200, headers: {'content-type': 'application/json'});
    }));
    expect((await api.resolvePlayback('3isk:fixture', refresh: true)).mediaPath, url);
  });
}
