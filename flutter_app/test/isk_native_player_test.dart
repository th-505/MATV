import 'dart:convert';

import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

class RecordingPlayer extends VideoPlayerPlatform {
  RecordingPlayer({this.fail = false});
  final bool fail;
  final sources = <DataSource>[];
  @override
  Future<void> init() async {}
  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    sources.add(options.dataSource);
    return sources.length;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => fail
      ? Stream.error(PlatformException(code: '403', message: 'Forbidden'))
      : Stream.value(VideoEvent(
          eventType: VideoEventType.initialized,
          duration: const Duration(minutes: 10),
          size: const Size(1920, 1080),
        ));
  @override
  Future<void> dispose(int playerId) async {}
  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> play(int playerId) async {}
  @override
  Future<void> pause(int playerId) async {}
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<Duration> getPosition(int playerId) async => Duration.zero;
  @override
  Widget buildViewWithOptions(VideoViewOptions options) => const SizedBox();
}

class RecordingApi extends MitvApi {
  RecordingApi({required super.client});
  final errors = <Object>[];
  TitleDetails? prepared;
  @override
  Future<TitleDetails> resolvePlayback(String ref,
      {bool refresh = false}) async {
    if (prepared != null) return prepared!;
    try {
      return await super.resolvePlayback(ref, refresh: refresh);
    } catch (error) {
      errors.add(error);
      rethrow;
    }
  }
}

void main() {
  for (final mode in ['direct', 'failure', 'client_resolve']) {
    final fail = mode == 'failure';
    final clientResolve = mode == 'client_resolve';
    testWidgets(
        fail
            ? '3isk failure renews once without opening WebView'
            : clientResolve
                ? 'miravd metadata is resolved in background and sent to native plugin'
                : '3isk native plugin receives direct URL and playback headers',
        (tester) async {
      final previous = VideoPlayerPlatform.instance;
      final native = RecordingPlayer(fail: fail);
      VideoPlayerPlatform.instance = native;
      addTearDown(() => VideoPlayerPlatform.instance = previous);
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      var resolutions = 0;
      final expiry = DateTime.now().add(const Duration(hours: 1));
      final stream = clientResolve
          ? 'https://s43.grzcdn.com/hls/master.m3u8'
          : 'https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=fixture&expires=${expiry.millisecondsSinceEpoch ~/ 1000}';
      final api = RecordingApi(client: MockClient((request) async {
        if (request.url.host == 'miravd.com') {
          expect(
              request.headers['Referer'], 'https://3iskk.xyz/embed/1/12345/1/');
          expect(request.headers['User-Agent'], 'fixture-UA');
          return http.Response(
              "eval(function(p,a,c,k,e,d){}('0://1.2.3/4/5.6',36,7,'https|s43|grzcdn|com|hls|master|m3u8'.split('|')))",
              200);
        }
        resolutions++;
        if (clientResolve) {
          return http.Response(
              jsonEncode({
                'status': 'success',
                'playback_mode': 'client_resolve',
                'resolver_url': 'https://miravd.com/embed-fixture.html',
                'resolver_headers': {
                  'Referer': 'https://3iskk.xyz/embed/1/12345/1/',
                  'User-Agent': 'fixture-UA'
                },
              }),
              200);
        }
        if (resolutions > 1) {
          expect(request.url.queryParameters['refresh'], '1');
        }
        return http.Response(
            jsonEncode({
              'status': 'success',
              'playback_mode': 'direct',
              'stream_url': stream,
              'media_type': 'm3u8',
              'expires_at': expiry.toIso8601String(),
              'headers': {
                'Referer': 'https://s1.ukrcdn.xyz/',
                'User-Agent': 'fixture-UA'
              },
            }),
            200);
      }));
      if (clientResolve) {
        api.prepared =
            await tester.runAsync(() => api.resolvePlayback('3isk:fixture'));
      }
      await tester.pumpWidget(MaterialApp(
          home: PlayerPage(
        api: api,
        store: store,
        title: 'حلقة',
        sourceRef: '3isk:fixture',
        item: const CatalogItem(
            id: 'fixture',
            ref: '3isk:fixture',
            title: 'حلقة',
            poster: '',
            type: 'series'),
      )));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(api.errors, isEmpty);
      expect(native.sources.length, fail ? 2 : 1);
      expect(native.sources.first.uri, stream);
      expect(native.sources.first.httpHeaders, {
        'Referer':
            clientResolve ? 'https://miravd.com/' : 'https://s1.ukrcdn.xyz/',
        'User-Agent': 'fixture-UA'
      });
      expect(resolutions, fail ? 2 : 1);
      expect(
          find.byWidgetPredicate(
              (widget) => widget.runtimeType.toString().contains('WebView')),
          findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
      api.close();
    });
  }
}
