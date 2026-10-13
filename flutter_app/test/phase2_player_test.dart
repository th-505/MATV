import 'dart:convert';
import 'package:al_qahtani/src/api_client.dart';
import 'package:al_qahtani/src/library_store.dart';
import 'package:al_qahtani/src/models.dart';
import 'package:al_qahtani/src/player_page.dart';
import 'package:al_qahtani/src/universal_player.dart';
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
    final api = AlQahtaniApi(
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
    if (const String.fromEnvironment('AL_QAHTANI_TARGET') != 'tv') {
      final area = find.byKey(const Key('test-video-surface'));
      final origin = tester.getTopRight(area) - const Offset(30, -40);
      await tester.dragFrom(origin, const Offset(0, 60));
      await tester.pump(const Duration(milliseconds: 400));
      expect(engines.last.volume, lessThan(1));
    }
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
