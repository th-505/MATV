import 'dart:convert';

import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/universal_player.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:shared_preferences/shared_preferences.dart';
import 'support/recording_media_kit.dart';

class RecordingApi extends MitvApi {
  RecordingApi({required super.client});
  final errors = <Object>[];
  @override
  Future<TitleDetails> resolvePlayback(String ref,
      {bool refresh = false}) async {
    try {
      return await super.resolvePlayback(ref, refresh: refresh);
    } catch (error) {
      errors.add(error);
      rethrow;
    }
  }
}

void main() {
  for (final fail in [false, true]) {
    testWidgets(
        fail
            ? '3isk media_kit failure renews once and disposes both players without WebView'
            : '3isk direct HLS and headers reach media_kit without a browser page',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      var resolutions = 0;
      final expiry = DateTime.now().add(const Duration(hours: 1));
      final stream =
          'https://s1.ukrcdn.xyz/hls/demo/master.m3u8?token=fixture&expires=${expiry.millisecondsSinceEpoch ~/ 1000}';
      final api = RecordingApi(client: MockClient((request) async {
        resolutions++;
        if (resolutions > 1) {
          expect(request.url.queryParameters['refresh'], '1');
        }
        return http.Response(
            jsonEncode({
              'status': 'success',
              'playback_mode': 'direct',
              'stream_url': stream,
              'mediatype': 'm3u8',
              'expires_at': expiry.toIso8601String(),
              'headers': {
                'Referer': 'https://s1.ukrcdn.xyz/',
                'User-Agent': 'fixture-UA'
              },
            }),
            200);
      }));
      final nativePlayers = <RecordingMediaKitPlatform>[];
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
        playerFactory: (uri, type, headers, software) {
          final native = RecordingMediaKitPlatform(failOpen: fail);
          nativePlayers.add(native);
          return UniversalPlayer(uri,
              mediaType: type,
              headers: headers,
              software: software,
              mediaKitPlayerFactory: () => mk.Player(platformPlayer: native),
              videoOutputFactory: (player, configuration) => const SizedBox());
        },
      )));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(api.errors, isEmpty);
      expect(nativePlayers.length, fail ? 2 : 1);
      expect(nativePlayers.first.opened.single.uri, stream);
      expect(nativePlayers.first.opened.single.httpHeaders,
          {'Referer': 'https://s1.ukrcdn.xyz/', 'User-Agent': 'fixture-UA'});
      expect(resolutions, fail ? 2 : 1);
      expect(
          find.byWidgetPredicate(
              (widget) => widget.runtimeType.toString().contains('WebView')),
          findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
      expect(nativePlayers.map((player) => player.disposalCount).toList(),
          List.filled(nativePlayers.length, 1));
      api.close();
    });
  }

  testWidgets('legacy client resolver metadata cannot fetch HTML on the device',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    var htmlRequests = 0;
    final api = RecordingApi(client: MockClient((request) async {
      if (request.url.host == 'miravd.com') {
        htmlRequests++;
        throw StateError('device HTML resolution is retired');
      }
      return http.Response(
          jsonEncode({
            'status': 'success',
            'playback_mode': 'client_resolve',
            'resolver_url': 'https://miravd.com/embed-fixture.html',
            'resolverheaders': {
              'Referer': 'https://3iskk.xyz/embed/1/12345/1/',
              'User-Agent': 'fixture-UA'
            },
          }),
          200);
    }));
    var playerCreations = 0;
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
            playerFactory: (uri, type, headers, software) {
              playerCreations++;
              throw StateError('unresolved HTML must never reach a decoder');
            })));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(htmlRequests, 0);
    expect(playerCreations, 0);
    expect(api.errors, isNotEmpty);
    expect(
        api.errors.every((error) =>
            error is ApiException &&
            error.code == 'EDGE_DIRECT_RESOLUTION_REQUIRED'),
        true);
    expect(
        find.byWidgetPredicate(
            (widget) => widget.runtimeType.toString().contains('WebView')),
        findsNothing);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
