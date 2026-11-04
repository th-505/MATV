import 'dart:io';

import 'package:mitv/src/models.dart';
import 'package:mitv/src/download_service.dart';

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test('beta details and playback never use Najd harvest, TMDB or legacy special-provider endpoints', () async {
    final paths = <String>[];
    final key = 'source:alooy:${'a' * 24}';
    final client = MockClient((request) async {
      paths.add(request.url.path);
      final data = switch (request.url.path) {
        '/api/v1/browser/request' => {'ref': key, 'state': 'ready'},
        '/api/v1/browser/status' => {
          'state': 'ready',
          'index_state': 'ready',
          'source_editions': [
            {'ref': key, 'available': true},
          ],
        },
        '/api/v1/browser/work' => {
          'ref': key,
          'title': 'عمل الموقع',
          'type': 'series',
          'source_index_authoritative': true,
          'available_seasons': [2],
          'seasons': [
            {'season_number': 2},
          ],
          'episodes': [
            {
              'ref': '$key:s2:e19',
              'title': 'الحلقة 19',
              'episode_number': 19,
              'season_number': 2,
              'watch_available': true,
            },
          ],
        },
        '/api/v1/browser/playback' => {
          'state': 'ready',
          'servers': [
            {
              'url': 'https://cdn.example/video.mp4',
              'kind': 'direct',
              'identity_verified': true,
              'web_playable': true,
              'expires_at': DateTime.now()
                  .add(const Duration(minutes: 5))
                  .toIso8601String(),
            },
          ],
        },
        _ => throw StateError('Unexpected path ${request.url.path}'),
      };
      return http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final najd = MitvApi(client: client, useEdge: false);
    final beta = najd.browserSession();
    addTearDown(najd.close);
    addTearDown(beta.close);
    for (final provider in ['alooy', '3isk', 'legacy', 'laroza', 'mycima']) {
      final details = await beta.details('$provider:fixture');
      expect(details.episodes.single.number, 19);
    }
    expect(
      (await beta.resolvePlayback('$key:s2:e19')).mediaPath,
      'https://cdn.example/video.mp4',
    );
    await expectLater(
      beta.details('tmdb:movie:550'),
      throwsA(isA<ApiException>()),
    );
    expect(paths.every((path) => path.startsWith('/api/v1/browser/')), isTrue);
    expect(najd.providerBrowser, isFalse);
    expect(najd.usesEdge, isFalse);
  });
  test('beta history/favorite metadata retains its isolated pipeline after cloud serialization', () {
    final item = CatalogItem(
      id: 'one',
      ref: 'mycima:one',
      title: 'Work',
      poster: '',
      type: 'series',
      discoveryScope: 'beta',
    );
    final restored = CatalogItem.fromJson(
      jsonDecode(jsonEncode(item.copyWith(title: 'Saved').toJson()))
          as Map<String, dynamic>,
    );
    expect(restored.discoveryScope, 'beta');
    expect(restored.title, 'Saved');
    expect(
      CatalogItem.fromJson({'ref': 'tmdb:movie:550'}).discoveryScope,
      'najd',
    );
  });
  test('beta movie resolution supplies a downloadable MP4 with normalized safe headers', () async {
    final key = 'source:fosta:${'b' * 24}';
    final client = MockClient((request) async {
      final data = switch (request.url.path) {
        '/api/v1/browser/request' => {'ref': key},
        '/api/v1/browser/status' => {
          'state': 'ready',
          'index_state': 'ready',
          'source_editions': [
            {'ref': key, 'available': true},
          ],
        },
        '/api/v1/browser/work' => {
          'ref': key,
          'title': 'Movie',
          'type': 'movie',
          'episodes': [],
        },
        '/api/v1/browser/playback' => {
          'state': 'ready',
          'servers': [
            {
              'kind': 'direct',
              'url': 'https://cdn.example.com/movie.mp4',
              'identity_verified': true,
              'expires_at': DateTime.now()
                  .add(const Duration(minutes: 5))
                  .toIso8601String(),
              'headers': {
                'referer': 'https://source.example/',
                'origin': 'https://source.example',
                'Authorization': 'must-not-forward',
                'User-Agent': 'fixture',
              },
            },
          ],
        },
        _ => throw StateError('Unexpected route'),
      };
      return http.Response(
        jsonEncode({'status': 'success', 'data': data}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final root = MitvApi(client: client, useEdge: false),
        beta = root.browserSession();
    addTearDown(root.close);
    addTearDown(beta.close);
    await beta.resolvePlayback('fosta:movie');
    final source = beta.downloadableSource('fosta:movie');
    expect(source, isNotNull);
    expect(source!.headers, {
      'Referer': 'https://source.example/',
      'Origin': 'https://source.example',
      'User-Agent': 'fixture',
    });
    final directory = await Directory.systemTemp.createTemp(
      'najd-beta-download-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final bytes = <int>[
      0,
      0,
      0,
      16,
      0x66,
      0x74,
      0x79,
      0x70,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    final download = DownloadService(
      directoryProvider: () async => directory,
      client: MockClient((request) async {
        expect(request.headers['referer'], 'https://source.example/');
        return http.Response.bytes(
          bytes,
          200,
          headers: {'content-type': 'video/mp4'},
        );
      }),
    );
    addTearDown(download.close);
    final result = await download.download(
      Uri.parse(source.mediaPath),
      fallbackName: 'movie',
      headers: source.headers,
    );
    expect(await File(result.path).readAsBytes(), bytes);
  });
  test(
    'closing a beta session does not close the shared Najd transport',
    () async {
      var closed = false;
      final client = _OwnedClient(
        (request) async =>
            http.Response(jsonEncode({'status': 'success', 'data': []}), 200),
        () => closed = true,
      );
      final najd = MitvApi(client: client, useEdge: false),
          beta = najd.browserSession();
      beta.close();
      expect(closed, isFalse);
      expect(await najd.browserSources(), isEmpty);
      najd.close();
      expect(closed, isTrue);
    },
  );
}

class _OwnedClient extends MockClient {
  _OwnedClient(super.handler, this.onClose);
  final void Function() onClose;
  @override
  void close() {
    onClose();
    super.close();
  }
}
