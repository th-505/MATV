import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/subtitles_service.dart';

void main() {
  group('SubtitlesService', () {
    test('fetches and prioritizes Arabic and English subtitles by IMDb ID', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, '/subtitles/movie/tt1375666.json');
        return http.Response(
          jsonEncode({
            'subtitles': [
              {
                'id': '1',
                'url': 'https://subs.strem.io/1.srt',
                'lang': 'fre',
                'subtitleFileName': 'french.srt',
              },
              {
                'id': '2',
                'url': 'https://subs.strem.io/2.srt',
                'lang': 'ara',
                'subtitleFileName': 'arabic.srt',
              },
              {
                'id': '3',
                'url': 'https://subs.strem.io/3.srt',
                'lang': 'eng',
                'subtitleFileName': 'english.srt',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final service = SubtitlesService(client: mockClient);
      final results = await service.fetchSubtitles(imdbId: 'tt1375666');

      expect(results, hasLength(3));
      // Arabic must be prioritized first
      expect(results[0].lang, 'ara');
      expect(results[0].languageLabel, contains('العربية'));
      // English must be prioritized second
      expect(results[1].lang, 'eng');
      expect(results[1].languageLabel, contains('الإنجليزية'));
      // Others third
      expect(results[2].lang, 'fre');
    });

    test('builds series endpoint when season and episode are provided', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, '/subtitles/series/tt0903747:2:5.json');
        return http.Response(
          jsonEncode({
            'subtitles': [
              {
                'id': '10',
                'url': 'https://subs.strem.io/s2e5.srt',
                'lang': 'ara',
                'subtitleFileName': 'Breaking.Bad.S02E05.srt',
              }
            ]
          }),
          200,
        );
      });

      final service = SubtitlesService(client: mockClient);
      final results = await service.fetchSubtitles(
        imdbId: 'tt0903747',
        season: 2,
        episode: 5,
      );

      expect(results, hasLength(1));
      expect(results.first.fileName, 'Breaking.Bad.S02E05.srt');
    });

    test('handles non-tt id fail-closed returning empty list', () async {
      final service = SubtitlesService();
      final results = await service.fetchSubtitles(imdbId: 'invalid-id');
      expect(results, isEmpty);
    });

    test('decodes UTF-8 and falls back gracefully to Windows-1256 (CP1256) for Arabic', () {
      // 1. Standard UTF-8 text
      const sampleArabic = 'مرحباً بك في تطبيق MITV';
      final utf8Bytes = Uint8List.fromList(utf8.encode(sampleArabic));
      expect(SubtitlesService.decodeSubtitleBytes(utf8Bytes), sampleArabic);

      // 2. CP1256 encoded Arabic bytes (e.g. 'مرحبا' in CP1256: C5 D1 CD C8 C7)
      // C5: م (0x0645), D1: ر (0x0631), CD: ح (0x062D), C8: ب (0x0628), C7: ا (0x0627)
      final cp1256Bytes = Uint8List.fromList([0xC5, 0xD1, 0xCD, 0xC8, 0xC7]);
      final decoded = SubtitlesService.decodeSubtitleBytes(cp1256Bytes);
      expect(decoded, 'مرحبا');
    });
  });
}
