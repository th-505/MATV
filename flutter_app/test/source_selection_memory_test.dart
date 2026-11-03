import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/source_selection_memory.dart';

const work = 'source:second:bbbbbbbbbbbbbbbbbbbbbbbb';
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('remembered provider selection survives rereading without rewriting its source episode as TMDB numbering', () async {
    await SourceSelectionMemory.remember(
      'tmdb:tv:123',
      const SourceSelection(
        workRef: work,
        episodeRef: '$work:s1:e21',
        episodeId: 'actual-21',
        title: 'اسم المصدر',
        provider: 'second',
        season: 1,
        number: 21,
      ),
    );
    final choice = await SourceSelectionMemory.read('tmdb:tv:123');
    expect(choice?.episodeRef, '$work:s1:e21');
    expect(choice?.season, 1);
    expect(choice?.number, 21);
    final data = (await SharedPreferences.getInstance()).getString(
      SourceSelectionMemory.key,
    )!;
    expect(data, isNot(contains('https://')));
  });
  test('media URLs and foreign episode references are not stored as source preferences', () async {
    await SourceSelectionMemory.remember(
      'tmdb:tv:123',
      const SourceSelection(
        workRef: work,
        episodeRef: 'https://cdn.example/video.mp4?token=private',
        episodeId: '1',
        title: 'اسم',
        provider: 'second',
      ),
    );
    expect(await SourceSelectionMemory.read('tmdb:tv:123'), isNull);
    expect(
      SourceSelection.parse({
        'work': work,
        'episode': 'source:foreign:aaaaaaaaaaaaaaaaaaaaaaaa:s1:e21',
      }),
      isNull,
    );
  });
  test('explicit provider catalogue uses observed title, poster, overview and episode numbers together', () async {
    final api = MitvApi(
      client: MockClient(
        (request) async => http.Response(
          jsonEncode({
            'status': 'success',
            'data': {
              'ref': work,
              'type': 'series',
              'year': 2000,
              'observed_year': null,
              'genres': ['دراما'],
              'title': 'اسم TMDB',
              'source_title': 'الاسم الرسمي بالموقع',
              'poster': 'https://images.example/canonical.jpg',
              'source_poster': 'https://images.example/actual.jpg',
              'overview': 'قصة TMDB',
              'observed_overview': 'قصة المصدر',
              'seasons': [
                {'season_number': 1},
              ],
              'season_number': 1,
              'episodes': [
                {
                  'id': '21',
                  'ref': '$work:s1:e21',
                  'episode_number': 21,
                  'season_number': 1,
                  'title': 'حلقة 21',
                  'watch_available': true,
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );
    addTearDown(api.close);
    final details = TitleDetails.fromJson(await api.sourceWorkMetadata(work));
    expect(details.title, 'الاسم الرسمي بالموقع');
    expect(details.poster, 'https://images.example/actual.jpg');
    expect(details.plot, 'قصة المصدر');
    expect(details.year, isNull);
    expect(details.contentType, 'series');
    expect(details.genres, contains('دراما'));
    expect(details.episodes.single.number, 21);
    expect(details.episodes.single.season, 1);
  });
}
