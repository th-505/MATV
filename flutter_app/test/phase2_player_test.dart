import 'dart:convert';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/stream_bridge.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/universal_player.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

class FakeEngine extends UniversalPlayer {
  FakeEngine(super.uri,
      {required super.mediaType,
      required super.headers,
      required super.software,
      required this.fail});
  final bool fail;
  final state = ValueNotifier(const VideoPlayerValue.uninitialized());
  final seeks = <Duration>[];
  double volume = 1;
  @override
  VideoPlayerValue get value => state.value;
  @override
  void addListener(VoidCallback listener) => state.addListener(listener);
  @override
  void removeListener(VoidCallback listener) => state.removeListener(listener);
  @override
  Future<void> initialize() async {
    if (fail) throw StateError('bad source');
    state.value = const VideoPlayerValue(
        duration: Duration(minutes: 10),
        size: Size(1920, 1080),
        isInitialized: true);
  }

  @override
  Future<void> play() async {
    state.value = value.copyWith(isPlaying: true);
  }

  @override
  Future<void> pause() async {
    state.value = value.copyWith(isPlaying: false);
  }

  @override
  Future<void> seekTo(Duration position) async {
    seeks.add(position);
    state.value = value.copyWith(position: position);
  }

  @override
  Future<void> setPlaybackSpeed(double speed) async {}
  @override
  Future<void> setVolume(double v) async {
    volume = v;
  }

  @override
  Widget video() => const SizedBox(key: Key('test-video-surface'));
  @override
  Future<void> dispose() async {
    state.dispose();
  }
}

class FakeBridge implements StreamBridge {
  bool closed = false;
  Map<String, String>? headers;
  @override
  Future<Uri> open(Uri target, Map<String, String> values) async {
    headers = values;
    return Uri.parse('http://127.0.0.1:1234/session/stream');
  }

  @override
  Future<void> close() async {
    closed = true;
  }
}

void main() {
  testWidgets(
      'failed server tries alternate decoder then switches source at saved position',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    const item = CatalogItem(
        id: 'film',
        ref: 'legacy:film',
        title: 'Film',
        poster: '',
        type: 'movie');
    await store.recordProgress(
        item: item,
        position: const Duration(seconds: 40),
        duration: const Duration(minutes: 10));
    final api = MitvApi(
        client: MockClient((request) async => http.Response(
            jsonEncode({
              'status': 'success',
              'media_path': '/api/cinema/media?id=bad',
              'media_type': 'mp4',
              'media_sources': [
                {
                  'media_path': '/api/cinema/media?id=bad',
                  'media_type': 'mp4',
                  'label': '720p'
                },
                {
                  'media_path': '/api/cinema/media?id=good',
                  'media_type': 'mp4',
                  'label': '1080p'
                },
              ]
            }),
            200)));
    final engines = <FakeEngine>[];
    await tester.pumpWidget(MaterialApp(
        home: PlayerPage(
            api: api,
            store: store,
            item: item,
            title: 'Film',
            sourceRef: item.ref,
            playerFactory: (uri, type, headers, software) {
              final player = FakeEngine(uri,
                  mediaType: type,
                  headers: headers,
                  software: software,
                  fail: uri.queryParameters['id'] == 'bad');
              engines.add(player);
              return player;
            })));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(engines.length, 3);
    expect(engines[1].software, true);
    expect(engines.last.uri.queryParameters['id'], 'good');
    expect(engines.last.seeks.first, const Duration(seconds: 40));
    expect(find.byKey(const Key('test-video-surface')), findsOneWidget);
    expect(find.byIcon(Icons.high_quality), findsOneWidget);
    if (const String.fromEnvironment('MITV_TARGET') != 'tv') {
      final area = find.byKey(const Key('test-video-surface'));
      final origin = tester.getTopRight(area) - const Offset(30, -40);
      await tester.dragFrom(origin, const Offset(0, 60));
      await tester.pump(const Duration(milliseconds: 400));
      expect(engines.last.volume, lessThan(1));
      final point = tester.getCenter(area) + const Offset(90, -50);
      await tester.tapAt(point);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tapAt(point);
      await tester.pump(const Duration(milliseconds: 100));
      expect(engines.last.seeks.last, const Duration(seconds: 50));
      expect(find.text('+10 ثوانٍ'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('+10 ثوانٍ'), findsNothing);
    }
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
  testWidgets(
      'Alooy loopback player never forwards upstream Origin to local bridge',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    const item = CatalogItem(
        id: 'alooy',
        ref: 'alooy:fixture',
        title: 'Alooy',
        poster: '',
        type: 'series');
    final api = MitvApi(
        client: MockClient((request) async => http.Response(
            jsonEncode({
              'status': 'success',
              'media_path': 'https://vid8.ujeklsj.site/test.mp4',
              'media_type': 'mp4',
              'playback_mode': 'local_proxy',
              'headers': {
                'Referer':
                    'https://fa.alooytv16.xyz/watch/test.html?key=abc123',
                'Origin': 'https://fa.alooytv16.xyz',
                'User-Agent': 'Mozilla/5.0'
              }
            }),
            200)));
    final engines = <FakeEngine>[];
    final bridge = FakeBridge();
    await tester.pumpWidget(MaterialApp(
        home: PlayerPage(
            api: api,
            store: store,
            item: item,
            title: 'Alooy',
            sourceRef: item.ref,
            streamBridgeFactory: () => bridge,
            playerFactory: (uri, type, headers, software) {
              final p = FakeEngine(uri,
                  mediaType: type,
                  headers: headers,
                  software: software,
                  fail: false);
              engines.add(p);
              return p;
            })));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(engines, hasLength(1));
    expect(engines.single.uri.host, '127.0.0.1');
    expect(engines.single.uri.scheme, 'http');
    expect(engines.single.headers, isEmpty);
    expect(bridge.headers?['Origin'], 'https://fa.alooytv16.xyz');
    await tester.pumpWidget(const SizedBox());
    expect(bridge.closed, true);
    api.close();
  });
}
