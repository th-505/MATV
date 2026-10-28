import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/product_version.dart';

const sourceRef = 'source:3cktv:aaaaaaaaaaaaaaaaaaaaaaaa';
void main() {
  test('playback failure diagnostics contain version and exact work/episode but no media or raw decoder text', () async {
    final sent = <Map<String, dynamic>>[];
    final api = MitvApi(
      client: MockClient((r) async {
        expect(r.method, 'POST');
        expect(r.url.path, '/api/v1/diagnostics/playback');
        sent.add((jsonDecode(r.body) as Map).cast<String, dynamic>());
        return http.Response('{}', 202);
      }),
    );
    addTearDown(api.close);
    await api.reportPlaybackFailure(
      ref: '$sourceRef:s2:e42',
      provider: '3cktv',
      code: 'NATIVE_DECODER_ERROR',
    );
    await api.reportPlaybackFailure(
      ref: '$sourceRef:s2:e42',
      provider: '3cktv',
      code: 'NATIVE_DECODER_ERROR',
    );
    expect(sent, hasLength(1));
    final body = sent.single;
    expect(body['ref'], sourceRef);
    expect(body['season'], 2);
    expect(body['episode'], 42);
    expect(body['client_version'], productVersion);
    expect(body['client_build'], productBuild);
    expect(body['code'], 'NATIVE_DECODER_ERROR');
    expect(
      body.keys,
      containsAll([
        'ref',
        'provider',
        'phase',
        'code',
        'platform',
        'client_version',
        'client_build',
      ]),
    );
    expect(
      body.keys.any(
        (k) => [
          'url',
          'media_url',
          'headers',
          'cookie',
          'authorization',
          'native_error',
          'message',
        ].contains(k),
      ),
      false,
    );
    expect(jsonEncode(body), isNot(contains('https://')));
  });
  test('diagnostics do not send raw source/media URLs and only accept coarse code/phase/provider values', () async {
    final sent = <Map<String, dynamic>>[];
    final api = MitvApi(
      client: MockClient((r) async {
        sent.add((jsonDecode(r.body) as Map).cast<String, dynamic>());
        return http.Response('{}', 503);
      }),
    );
    addTearDown(api.close);
    await api.reportPlaybackFailure(
      ref: 'https://cdn.example/video.mp4?token=secret',
    );
    expect(sent, isEmpty);
    await api.reportPlaybackFailure(
      ref: 'tmdb:tv:34587:s1:e1',
      provider: 'my_secret',
      phase: 'private_password',
      code: 'BEARER_SECRET_CREDENTIAL',
    );
    expect(sent.single['provider'], 'unknown');
    expect(sent.single['phase'], 'playback');
    expect(sent.single['code'], 'NATIVE_PLAYBACK_FAILED');
    expect(jsonEncode(sent), isNot(contains('private_password')));
    expect(jsonEncode(sent), isNot(contains('secret')));
  });
  test('legacy metadata references use their already confirmed opaque source key in device reports', () async {
    Map<String, dynamic>? payload;
    final api = MitvApi(
      client: MockClient((r) async {
        if (r.url.path.endsWith('/request')) {
          expect(r.url.queryParameters['client_version'], productVersion);
          expect(r.url.queryParameters['client_build'], '$productBuild');
          expect(r.url.queryParameters['platform'], isNotEmpty);
          return http.Response(
            jsonEncode({
              'status': 'accepted',
              'data': {'ref': sourceRef, 'state': 'queued'},
            }),
            202,
          );
        }
        payload = (jsonDecode(r.body) as Map).cast<String, dynamic>();
        return http.Response('{}', 202);
      }),
    );
    addTearDown(api.close);
    await api.requestHarvest('3cktv:opaque-original-page');
    await api.reportPlaybackFailure(
      ref: '3cktv:opaque-original-page',
      provider: '3cktv',
    );
    expect(payload?['ref'], sourceRef);
    expect(jsonEncode(payload), isNot(contains('opaque-original-page')));
  });
  test('a failed diagnostic transport never replaces the playback failure with another error', () async {
    final api = MitvApi(
      client: MockClient(
        (_) async => throw http.ClientException('unavailable'),
      ),
    );
    addTearDown(api.close);
    await api.reportPlaybackFailure(
      ref: 'tmdb:tv:34587:s1:e1',
      code: 'PLAYER_START_FAILED',
    );
  });
}
