import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/subtitle_service.dart';
import 'package:mitv/src/universal_player.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/recording_media_kit.dart';

class CaptionPlatform extends RecordingMediaKitPlatform {
  final captions = <mk.SubtitleTrack>[];
  @override
  Future<void> setSubtitleTrack(
    mk.SubtitleTrack track, {
    bool synchronized = true,
  }) async {
    captions.add(track);
    state = state.copyWith(track: state.track.copyWith(subtitle: track));
    trackController.add(state.track);
  }
}

class CapturingSubtitleService extends SubtitleService {
  CapturingSubtitleService({super.client, super.store});
  Object? lastFailure;
  final done = Completer<void>();
  @override
  Future<PreparedSubtitle> loadDescriptor(SubtitleDescriptor descriptor) async {
    try {
      return await super.loadDescriptor(descriptor);
    } catch (error) {
      lastFailure = error;
      rethrow;
    } finally {
      if (!done.isCompleted) done.complete();
    }
  }
}

class CaptionMemoryStore implements SubtitleTemporaryStore {
  String? text;
  @override
  Future<String> prepare(Uint8List bytes, String format) async {
    text = utf8.decode(bytes);
    return 'file:///normalized.$format';
  }

  @override
  Future<void> close() async {}
}

void main() {
  testWidgets(
    'attached Arabic sidecar reaches the actual media_kit facade and off control',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final library = await LocalLibraryStore.create();
      final memory = CaptionMemoryStore();
      var captionRequests = 0;
      Map<String, String> sentHeaders = {};
      final service = CapturingSubtitleService(
        store: memory,
        client: MockClient((request) async {
          captionRequests++;
          sentHeaders = {
            for (final entry in request.headers.entries)
              entry.key.toLowerCase(): entry.value,
          };
          return http.Response(
            '1\n00:00:00,000 --> 00:00:02,000\nمرحبا\n',
            200,
            headers: {'content-type': 'text/plain; charset=utf-8'},
          );
        }),
      );
      final api = MitvApi(
        edgeUri: Uri.parse('https://edge.example'),
        client: MockClient(
          (request) async => http.Response(
            jsonEncode({
              'status': 'success',
              'schema_version': 1,
              'sources': [
                {
                  'provider_id': '3isk',
                  'provider': 'قصة عشق',
                  'source_ref': '3isk:one',
                  'url': 'https://media.example/one.mp4',
                  'format': 'mp4',
                  'playback_mode': 'edge_direct',
                  'edition': 'original',
                  'expires_at': DateTime.now()
                      .add(const Duration(minutes: 3))
                      .toIso8601String(),
                  'subtitles': [
                    {
                      'id': 'ar',
                      'url': 'https://source.example/ar.srt',
                      'format': 'srt',
                      'language': 'ara',
                      'label': 'العربية',
                      'headers': {'Referer': 'https://source.example/'},
                    },
                  ],
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );
      final platform = CaptionPlatform();
      await tester.pumpWidget(
        MaterialApp(
          home: PlayerPage(
            api: api,
            store: library,
            item: const MediaItem(
              id: 'one',
              ref: '3isk:one',
              title: 'one',
              poster: '',
              type: 'movie',
            ),
            title: 'one',
            sourceRef: '3isk:one',
            subtitles: service,
            playerFactory: (uri, type, headers, software) => UniversalPlayer(
              uri,
              mediaType: type,
              headers: headers,
              mediaKitPlayerFactory: () => mk.Player(platformPlayer: platform),
              videoOutputFactory: (_, _) => const SizedBox(),
            ),
          ),
        ),
      );
      for (var i = 0; i < 15; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      // StreamIterator.cancel can complete through the SDK's shared completed
      // Future outside FakeAsync. Yield one real event turn, then flush the
      // widget zone; never await that widget-zone operation inside runAsync.
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      expect(captionRequests, 1);
      expect(sentHeaders['referer'], 'https://source.example/');
      expect(service.lastFailure, isNull);
      expect(memory.text, contains('مرحبا'));
      expect(platform.captions.single.uri, true);
      expect(platform.captions.single.id, 'file:///normalized.srt');
      expect(platform.captions.single.language, 'ara');
      await tester.tap(find.byTooltip('الترجمة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إيقاف الترجمة'));
      await tester.pumpAndSettle();
      expect(platform.captions.last.id, 'no');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      await service.dispose();
      api.close();
      library.dispose();
    },
  );
}
