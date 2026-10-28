import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/fullscreen_video_surface.dart';
import 'package:mitv/src/download_service.dart';
import 'package:mitv/src/download_directory_migration.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/match_player_page.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'phase2_player_test.dart' show FakeEngine;

void main() {
  for (final dimensions in [
    const Size(390, 844),
    const Size(844, 390),
    const Size(1920, 1080)
  ]) {
    testWidgets(
        'contain viewport fills $dimensions without stretching the image',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = dimensions;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const MaterialApp(
          home: Scaffold(
              body: FullscreenVideoSurface(
                  videoSize: Size(1920, 1080),
                  child: SizedBox(key: Key('video-image'))))));
      expect(tester.getSize(find.byKey(const Key('fullscreen-video-viewport'))),
          dimensions);
      final rect = tester.getRect(find.byKey(const Key('video-image')));
      expect(rect.center.dx, closeTo(dimensions.width / 2, .01));
      expect(rect.center.dy, closeTo(dimensions.height / 2, .01));
      expect(rect.width / rect.height, closeTo(16 / 9, .001));
      expect(rect.width, lessThanOrEqualTo(dimensions.width + .01));
      expect(rect.height, lessThanOrEqualTo(dimensions.height + .01));
    });
  }
  test('protected direct MP4 resumes with headers and finalizes actual file',
      () async {
    final directory =
        await Directory.systemTemp.createTemp('mitv-protected-download-');
    addTearDown(() => directory.delete(recursive: true));
    final bytes = [
      0,
      0,
      0,
      16,
      102,
      116,
      121,
      112,
      107,
      115,
      111,
      109,
      0,
      0,
      0,
      0
    ];
    await File('${directory.path}/.mitv-resume.part')
        .writeAsBytes(bytes.take(6).toList());
    final service = DownloadService(
        directoryProvider: () async => directory,
        client: MockClient((request) async {
          expect(request.url.host, 'video.example');
          expect(request.headers['range'], 'bytes=6-');
          expect(request.headers['Referer'],
              'https://source.example/watch?key=one');
          expect(request.headers['Origin'], 'https://source.example');
          return http.Response.bytes(bytes.skip(6).toList(), 206, headers: {
            'content-type': 'video/mp4',
            'content-range': 'bytes 6-15/16',
            'content-length': '10'
          });
        }));
    final result =
        await service.download(Uri.parse('https://video.example/file.mp4'),
            headers: {
              'Referer': 'https://source.example/watch?key=one',
              'Origin': 'https://source.example',
              'User-Agent': 'fixture'
            },
            fallbackName: 'episode.mp4',
            resumeKey: 'resume');
    expect(await File(result.path).readAsBytes(), bytes);
    expect(result.bytes, 16);
    expect(await File('${directory.path}/.mitv-resume.part').exists(), false);
    service.close();
  });
  test('direct HLS and private media URLs never start a download', () async {
    var calls = 0;
    final service = DownloadService(client: MockClient((r) async {
      calls++;
      return http.Response('', 200);
    }));
    for (final url in [
      'https://video.example/master.m3u8',
      'https://127.0.0.1/private.mp4'
    ]) {
      await expectLater(
          service.download(Uri.parse(url)), throwsA(isA<DownloadException>()));
    }
    expect(calls, 0);
    service.close();
  });
  test(
      'renaming library retains complete files and resumes without overwriting',
      () async {
    final documents = await Directory.systemTemp.createTemp('mitv-migration-');
    addTearDown(() => documents.delete(recursive: true));
    final old = Directory('${documents.path}/AlQahtani/Downloads');
    await old.create(recursive: true);
    await File('${old.path}/episode.mp4').writeAsBytes([1, 2, 3]);
    await File('${old.path}/.qahtani-one.part').writeAsBytes([4, 5]);
    final migrated = await migrateDownloadDirectory(documents);
    expect(
        migrated.uri.pathSegments
            .where((p) => p.isNotEmpty)
            .toList()
            .reversed
            .take(2)
            .toList(),
        ['Downloads', 'MITV']);
    expect(await File('${migrated.path}/episode.mp4').readAsBytes(), [1, 2, 3]);
    expect(await File('${migrated.path}/.mitv-one.part').readAsBytes(), [4, 5]);
    await old.create(recursive: true);
    await File('${old.path}/episode.mp4').writeAsBytes([9]);
    await migrateDownloadDirectory(documents);
    expect(await File('${migrated.path}/episode.mp4').readAsBytes(), [1, 2, 3]);
    expect(await File('${old.path}/episode.mp4').readAsBytes(), [9]);
  });
  testWidgets('match screen delegates to shared player and edge direct source',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient((r) async {
          expect(r.url.path, '/v1/matches/resolve');
          return http.Response(
              jsonEncode({
                'status': 'success',
                'schema_version': 1,
                'sources': [
                  {
                    'provider': 'live',
                    'provider_id': 'matches',
                    'format': 'hls',
                    'url': 'https://video.example/live.m3u8',
                    'playback_mode': 'edge_direct',
                    'expires_at': DateTime.now()
                        .add(const Duration(minutes: 3))
                        .toIso8601String(),
                    'headers': {'Referer': 'https://source.example/'}
                  }
                ]
              }),
              200,
              headers: {'content-type': 'application/json'});
        }));
    const match = MatchItem(
        home: 'one',
        away: 'two',
        time: '19:00',
        status: 'live',
        ref: 'match:fixture');
    await tester.pumpWidget(MaterialApp(
        home: MatchPlayerPage(
            api: api,
            store: store,
            match: match,
            playerFactory: (u, t, h, software) {
              expect(u.host, 'video.example');
              expect(t, 'm3u8');
              expect(h['Referer'], 'https://source.example/');
              return FakeEngine(u,
                  mediaType: t, headers: h, software: software, fail: false);
            })));
    expect(find.byType(PlayerPage), findsOneWidget);
    expect(tester.widget<PlayerPage>(find.byType(PlayerPage)).isLive, true);
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byKey(const Key('fullscreen-video-viewport')), findsOneWidget);
    expect(find.byIcon(Icons.download), findsNothing);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
  for (final format in ['hls', 'mp4']) {
    testWidgets('download control follows actual $format source format',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = MitvApi(
          edgeUri: Uri.parse('https://edge.example'),
          client: MockClient((request) async => http.Response(
              jsonEncode({
                'status': 'success',
                'schema_version': 1,
                'sources': [
                  {
                    'provider': 'fixture',
                    'provider_id': 'akoam',
                    'format': format,
                    'url':
                        'https://video.example/movie.${format == 'hls' ? 'm3u8' : 'mp4'}',
                    'playback_mode': 'edge_direct',
                    'expires_at': DateTime.now()
                        .add(const Duration(minutes: 3))
                        .toIso8601String(),
                    'headers': {}
                  }
                ]
              }),
              200,
              headers: {'content-type': 'application/json'})));
      await tester.pumpWidget(MaterialApp(
          home: PlayerPage(
              api: api,
              store: store,
              item: const MediaItem(
                  id: 'movie',
                  title: 'movie',
                  poster: '',
                  type: 'movie',
                  ref: 'legacy:fixture'),
              title: 'movie',
              sourceRef: 'legacy:fixture',
              playerFactory: (u, t, h, software) => FakeEngine(u,
                  mediaType: t, headers: h, software: software, fail: false))));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.byIcon(Icons.download),
          format == 'mp4' ? findsOneWidget : findsNothing);
      if (format == 'mp4') {
        expect(
            api
                .mediaUri('https://video.example/movie.mp4',
                    playbackMode: 'edge_direct', download: true)
                .scheme,
            'https');
      }
      await tester.pumpWidget(const SizedBox());
      api.close();
    });
  }
}
