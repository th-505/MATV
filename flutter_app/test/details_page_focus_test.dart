import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/app_target.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeApi extends MitvApi {
  _FakeApi(this.response, {required this.knownMp4}) : super(useEdge: false);

  final bool knownMp4;
  @override
  PlaybackSource? downloadableSource(String ref) => knownMp4
      ? PlaybackSource(
          mediaPath: 'https://cdn.example/episode.mp4',
          mediaType: 'mp4',
          expiresAt: DateTime.now().add(const Duration(minutes: 4)))
      : null;

  final TitleDetails response;

  @override
  Future<TitleDetails> details(String ref) async => response;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final knownMp4 in [false, true]) {
    testWidgets('episode actions keep TV focus with resolved MP4=$knownMp4',
        (tester) async {
      SharedPreferences.setMockInitialValues(const {});
      final store = await LocalLibraryStore.create();
      final api = _FakeApi(
          const TitleDetails(
            title: 'مسلسل تجريبي',
            poster: '',
            episodes: [
              EpisodeItem(
                id: 'ep-1',
                number: 1,
                title: 'الحلقة الأولى',
                ref: 'opaque-episode-ref',
                watchAvailable: true,
              ),
            ],
            mediaPath: '',
            mediaType: '',
            playbackUnavailable: false,
            playbackReason: '',
          ),
          knownMp4: knownMp4);

      await tester.pumpWidget(MaterialApp(
        home: DetailsPage(
          api: api,
          store: store,
          item: const CatalogItem(
            id: 'show-1',
            title: 'مسلسل تجريبي',
            poster: '',
            type: 'series',
            ref: 'opaque-show-ref',
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('episode-play-ep-1')), findsOneWidget);
      expect(find.byKey(const ValueKey('episode-download-ep-1')),
          knownMp4 ? findsOneWidget : findsNothing);

      final playTile = tester
          .widget<ListTile>(find.byKey(const ValueKey('episode-play-ep-1')));
      expect(playTile.focusNode, isNotNull);
      playTile.focusNode!.requestFocus();
      await tester.pump();
      expect(playTile.focusNode!.hasFocus, isTrue);

      if (isTvTarget) {
        expect(find.byKey(const ValueKey('episode-play-button-ep-1')),
            findsNothing);
        if (knownMp4) {
          final downloadButton = tester.widget<IconButton>(
              find.byKey(const ValueKey('episode-download-ep-1')));
          expect(downloadButton.focusNode, isNotNull);
          expect(downloadButton.focusNode!.debugLabel,
              contains('details-episode-download'));
        }
      } else {
        expect(find.byKey(const ValueKey('episode-play-button-ep-1')),
            findsOneWidget);
      }
      api.close();
      store.dispose();
    });
  }
}
