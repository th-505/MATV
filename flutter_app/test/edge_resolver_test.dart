import 'dart:convert';
import 'package:al_qahtani/src/api_client.dart';
import 'package:al_qahtani/src/alooy_policy.dart';
import 'package:al_qahtani/src/library_store.dart';
import 'package:al_qahtani/src/models.dart';
import 'package:al_qahtani/src/player_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'phase2_player_test.dart' show FakeEngine, FakeBridge;

Map<String, dynamic> payload() => {
      'status': 'success',
      'schema_version': 1,
      'episode_id': 'same-cut',
      'sources': [
        for (final p in ['3isk', 'akoam', 'alooy'])
          {
            'provider_id': p,
            'provider': p == '3isk'
                ? 'قصة عشق'
                : p == 'akoam'
                    ? 'أكوام'
                    : 'Alooy TV',
            'url': 'https://media.new-cdn.example/$p.mp4',
            'format': 'mp4',
            'quality': '720p',
            'expires_at': DateTime.now()
                .add(const Duration(minutes: 3))
                .toIso8601String(),
            'playback_mode': p == 'alooy' ? 'edge_local_proxy' : 'edge_direct',
            'headers': {
              'Referer':
                  'https://source.new-domain.example/watch/episode.html?key=one',
              'Origin': 'https://source.new-domain.example',
              'User-Agent': 'fixture'
            },
          }
      ]
    };
AlQahtaniApi apiFixture() => AlQahtaniApi(
    edgeUri: Uri.parse('https://edge.example'),
    client: MockClient((r) async {
      expect(r.url.host, 'edge.example');
      expect(r.url.path, '/v1/resolve');
      return http.Response(jsonEncode(payload()), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }));
void main() {
  test('edge resolves all sources and registers new CDN domains', () async {
    final api = apiFixture();
    final d = await api.resolvePlayback('3isk:episode');
    expect(d.mediaSources.length, 3);
    expect(d.mediaSources.first.displayLabel, 'قصة عشق • 720p');
    expect(api.mediaUri(d.mediaPath, playbackMode: 'edge_direct').host,
        'media.new-cdn.example');
    expect(
        () => api.mediaUri('https://unregistered.example/video.mp4',
            playbackMode: 'edge_direct'),
        throwsA(isA<ApiException>()));
    expect(isPublicMediaUri(Uri.parse('https://127.0.0.1/private.mp4')), false);
    api.close();
  });
  test('unavailable edge never requests source HTML or device unpacking',
      () async {
    var calls = 0;
    final api = AlQahtaniApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((r) async {
          calls++;
          expect(r.url.host, 'edge.example');
          return http.Response('{"status":"unavailable"}', 503);
        }));
    await expectLater(
        api.resolvePlayback('3isk:episode'), throwsA(isA<ApiException>()));
    expect(calls, 1);
    api.close();
  });
  for (final automatic in [false, true]) {
    testWidgets(
        '${automatic ? '403 failover' : 'manual switch'} preserves two-second playhead across providers',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = apiFixture();
      final engines = <FakeEngine>[];
      final bridge = FakeBridge();
      await tester.pumpWidget(MaterialApp(
          home: PlayerPage(
              api: api,
              store: store,
              item: const MediaItem(
                  id: 'one',
                  title: 'one',
                  poster: '',
                  type: 'episode',
                  ref: '3isk:episode'),
              title: 'one',
              sourceRef: '3isk:episode',
              streamBridgeFactory: () => bridge,
              playerFactory: (u, t, h, s) {
                final e = FakeEngine(u,
                    mediaType: t, headers: h, software: s, fail: false);
                engines.add(e);
                return e;
              })));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await engines.first.seekTo(const Duration(seconds: 2));
      if (automatic) {
        engines.first.state.value =
            engines.first.value.copyWith(errorDescription: 'HTTP 403');
      } else {
        final button = tester
            .widget<PopupMenuButton<int>>(find.byType(PopupMenuButton<int>));
        final entries = button
            .itemBuilder(tester.element(find.byType(PopupMenuButton<int>)));
        expect(
            entries
                .whereType<PopupMenuItem<int>>()
                .map((e) => (e.child! as Text).data),
            contains('أكوام • 720p'));
        button.onSelected!(1);
      }
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(engines.length, 2);
      expect(engines.last.uri.path, '/akoam.mp4');
      expect(engines.last.seeks.first, const Duration(seconds: 2));
      final button = tester
          .widget<PopupMenuButton<int>>(find.byType(PopupMenuButton<int>));
      final entries =
          button.itemBuilder(tester.element(find.byType(PopupMenuButton<int>)));
      expect(
          entries
              .whereType<PopupMenuItem<int>>()
              .map((e) => (e.child! as Text).data),
          contains('Alooy TV • 720p'));
      button.onSelected!(2);
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(engines.last.uri.host, '127.0.0.1');
      expect(engines.last.headers, isEmpty);
      expect(bridge.headers!['Origin'], 'https://source.new-domain.example');
      expect(engines.last.seeks.first, const Duration(seconds: 2));
      await tester.pumpWidget(const SizedBox());
      expect(bridge.closed, true);
      api.close();
    });
  }
}
