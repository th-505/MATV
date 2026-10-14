import 'dart:convert';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/miravd_resolver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('base62 and spaced Dean Edwards arguments decode consistently', () {
    final words = List.filled(37, '');
    words[36] = 'https://s43.grzcdn.com/hls/master.m3u8';
    final packed =
        "eval(function(){return p}   ('A', 62, 37, '${words.join('|')}'.split('|')))";
    expect(miravdMediaUrl(packed), words[36]);
  });
  test('legacy player HTML is never fetched inside the device', () async {
    var requests = 0;
    final api = MitvApi(client: MockClient((request) async {
      requests++;
      expect(request.url.path, '/api/cinema/details');
      return http.Response(
          jsonEncode({
            'status': 'success',
            'playback_mode': 'client_resolve',
            'resolver_url': 'https://miravd.com/embed-fixture.html'
          }),
          200);
    }));
    await expectLater(
        api.resolvePlayback('3isk:fixture'), throwsA(isA<ApiException>()));
    expect(requests, 1);
    api.close();
  });
  test('packed metadata is decoded without permitting unrelated media hosts',
      () {
    const packed =
        "eval(function(p,a,c,k,e,d){}('0://1.2.3/4/5.6',36,7,'https|s43|grzcdn|com|hls|master|m3u8'.split('|')))";
    expect(miravdMediaUrl(packed), 'https://s43.grzcdn.com/hls/master.m3u8');
    expect(() => miravdMediaUrl('https://evil.example/hls/master.m3u8'),
        throwsFormatException);
    expect(() => miravdMediaUrl(packed.replaceFirst(',36,7,', ',99,7,')),
        throwsFormatException);
  });
  for (final invalidRedirect in [false, true]) {
    test(
        invalidRedirect
            ? 'metadata redirect cannot leave the trusted player host'
            : 'untrusted metadata URL is rejected before fetching', () async {
      var playerRequests = 0;
      final api = MitvApi(client: MockClient((request) async {
        if (request.url.path == '/api/cinema/details') {
          return http.Response(
              jsonEncode({
                'status': 'success',
                'playback_mode': 'client_resolve',
                'resolver_url': invalidRedirect
                    ? 'https://miravd.com/embed-demo.html'
                    : 'https://evil.example/embed-demo.html',
              }),
              200);
        }
        playerRequests++;
        expect(request.url.host, 'miravd.com');
        return http.Response('', 302,
            headers: {'location': 'https://evil.example/embed-demo.html'});
      }));
      await expectLater(
          api.resolvePlayback('3isk:fixture'), throwsA(isA<ApiException>()));
      expect(playerRequests, 0);
      api.close();
    });
  }
}
