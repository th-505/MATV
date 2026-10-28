import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/unified_media.dart';

MediaItem media({
  String ref = '3isk:one',
  String title = 'Dark',
  String type = 'movie',
  int? year = 2020,
  String source = 'mitv',
  List<String> genres = const [],
  int? season,
  int? episode,
  String audio = 'en',
  String edition = 'theatrical',
  String imdb = '',
  bool verified = false,
}) => MediaItem(
  id: ref,
  ref: ref,
  title: title,
  poster: '',
  type: type,
  year: year,
  source: source,
  genres: genres,
  season: season,
  episode: episode,
  audioLanguage: audio,
  edition: edition,
  imdbId: imdb,
  identityVerified: verified,
);

void main() {
  test('title normalization removes presentation only and preserves identity numbers', () {
    expect(
      MediaTaxonomy.normalizeTitle('مسلسل مَرْعَشْلي مترجم - 1080p'),
      'مرعشلي',
    );
    expect(MediaTaxonomy.normalizeTitle('Dark [WEB-DL] 1080p'), 'dark');
    expect(
      MediaTaxonomy.normalizeTitle('فيلم إِلَى النَّور بجودة HD'),
      'الي النور',
    );
    expect(MediaTaxonomy.normalizeTitle('The 100'), 'the 100');
    expect(MediaTaxonomy.normalizeTitle('Movie 43'), 'movie 43');
    expect(MediaTaxonomy.normalizeTitle('1984'), '1984');
    expect(
      MediaTaxonomy.normalizeTitle('Blade Runner 2049'),
      'blade runner 2049',
    );
    expect(MediaTaxonomy.normalizeTitle('Dark S01E02'), 'dark s01e02');
    expect(MediaTaxonomy.normalizeTitle('Dark الحلقة ٢'), 'dark الحلقة 2');
  });

  test('taxonomy uses type/genres/title markers independently of provider', () {
    for (final provider in ['3isk', 'akoam', 'alooy', 'laroza']) {
      expect(
        MediaTaxonomy.classify(media(source: provider, type: 'film')),
        'movie',
      );
      expect(
        MediaTaxonomy.classify(media(source: provider, type: 'مسلسل')),
        'series',
      );
      expect(
        MediaTaxonomy.classify(
          media(source: provider, type: 'series', genres: ['أنمي']),
        ),
        'anime',
      );
      expect(
        MediaTaxonomy.classify(
          media(source: provider, type: 'series', genres: ['Talk Show']),
        ),
        'program',
      );
      expect(
        MediaTaxonomy.classify(
          media(source: provider, type: 'unknown', title: 'برنامج المسابقات'),
        ),
        'program',
      );
      expect(
        MediaTaxonomy.classify(
          media(source: provider, type: 'unknown', title: 'Dark الحلقة12'),
        ),
        'series',
      );
      expect(
        MediaTaxonomy.classify(media(source: provider, type: 'unknown')),
        'unknown',
      );
    }
  });

  test(
    'explicit program and anime evidence overrides generic movie metadata',
    () {
      expect(
        MediaTaxonomy.classify(media(type: 'movie', genres: ['TVShow'])),
        'program',
      );
      expect(
        MediaTaxonomy.classify(media(type: 'movie', title: 'برنامج المسابقات')),
        'program',
      );
      expect(
        MediaTaxonomy.classify(media(type: 'movie', genres: ['Anime'])),
        'anime',
      );
      expect(
        MediaTaxonomy.classify(media(type: 'movie', genres: ['Documentary'])),
        'movie',
      );
      expect(
        MediaTaxonomy.classify(media(type: 'movie', genres: ['Animation'])),
        'movie',
      );
      expect(
        MediaTaxonomy.classify(media(type: 'unknown', source: 'anime')),
        'unknown',
      );
    },
  );

  test(
    'known same title/year/audio/edition merges all four provider references',
    () {
      final merged = UnifiedMedia.mergeSources([
        media(ref: '3isk:one', title: 'فيلم Dark مترجم 1080p', audio: 'eng'),
        media(ref: 'akoam:one', title: 'DARK [WEB-DL]', audio: 'en'),
        media(ref: 'alooy:one', title: 'Dark', audio: 'english'),
        media(ref: 'laroza:one', title: 'Dark', audio: 'en'),
      ]);
      expect(merged, hasLength(1));
      expect(merged.single.ref, '3isk:one');
      expect(merged.single.sourceRefs, {
        '3isk': '3isk:one',
        'akoam': 'akoam:one',
        'alooy': 'alooy:one',
        'laroza': 'laroza:one',
      });
      expect(() => merged.add(media()), throwsUnsupportedError);
      expect(
        () => merged.single.sourceRefs['other'] = 'other:ref',
        throwsUnsupportedError,
      );
    },
  );

  test('same verified IMDb identity can merge translated names without guessing a title', () {
    final merged = UnifiedMedia.mergeSources([
      media(
        title: 'مَرْعَشْلي',
        year: null,
        imdb: 'tt1234567',
        verified: true,
        audio: 'tr',
        edition: 'turkish-original',
      ),
      media(
        ref: 'akoam:one',
        title: 'Marasli',
        year: null,
        imdb: 'tt1234567',
        verified: true,
        audio: 'tur',
        edition: 'turkish-original',
      ),
    ]);
    expect(merged, hasLength(1));
    expect(merged.single.imdbId, 'tt1234567');
    expect(merged.single.identityVerified, true);
  });

  test(
    'unverified or invalid IMDb values cannot establish a work identity',
    () {
      for (final id in ['tt1234567', 'made-up-id']) {
        final merged = UnifiedMedia.mergeSources([
          media(title: 'مَرْعَشْلي', year: null, imdb: id),
          media(ref: 'akoam:one', title: 'Marasli', year: null, imdb: id),
        ]);
        expect(merged, hasLength(2));
      }
      expect(
        UnifiedMedia.mergeSources([
          media(title: 'A', year: null, imdb: 'invented', verified: true),
          media(
            ref: 'akoam:one',
            title: 'B',
            year: null,
            imdb: 'invented',
            verified: true,
          ),
        ]),
        hasLength(2),
      );
    },
  );

  test('remakes and conflicting verified IDs stay separate', () {
    expect(
      UnifiedMedia.mergeSources([
        media(year: 1959),
        media(ref: 'akoam:one', year: 2019),
      ]),
      hasLength(2),
    );
    expect(
      UnifiedMedia.mergeSources([
        media(imdb: 'tt1234567', verified: true),
        media(ref: 'akoam:one', imdb: 'tt7654321', verified: true),
      ]),
      hasLength(2),
    );
    expect(
      UnifiedMedia.mergeSources([
        media(year: 2020, imdb: 'tt1234567', verified: true),
        media(ref: 'akoam:one', year: 2021, imdb: 'tt1234567', verified: true),
      ]),
      hasLength(2),
    );
  });

  test('incomplete metadata cannot bridge two conflicting IMDb identities', () {
    final merged = UnifiedMedia.mergeSources([
      media(),
      media(ref: 'akoam:one', imdb: 'tt1234567', verified: true),
      media(ref: 'laroza:one', imdb: 'tt7654321', verified: true),
    ]);
    expect(merged, hasLength(2));
    expect(merged.first.sourceRefs.keys, containsAll(['3isk', 'akoam']));
    expect(merged.first.sourceRefs, isNot(contains('laroza')));
  });

  test(
    'underlying movie/series kinds remain distinct inside the anime category',
    () {
      final film = media(type: 'movie', genres: ['Anime']);
      final series = media(ref: 'akoam:one', type: 'series', genres: ['Anime']);
      expect(MediaTaxonomy.classify(film), 'anime');
      expect(MediaTaxonomy.classify(series), 'anime');
      expect(UnifiedMedia.mergeSources([film, series]), hasLength(2));
      expect(
        UnifiedMedia.mergeSources([
          media(type: 'anime'),
          media(ref: 'akoam:one', type: 'anime'),
        ]),
        hasLength(2),
      );
    },
  );

  for (final audio in ['', 'und', 'unknown', 'dubbed', 'xxx', 'fake']) {
    test('unknown audio "$audio" cannot cross-merge editions', () {
      expect(
        UnifiedMedia.mergeSources([
          media(audio: audio),
          media(ref: 'akoam:one', audio: audio),
        ]),
        hasLength(2),
      );
    });
  }
  for (final edition in [
    '',
    'unknown',
    'source-original',
    'null',
    'unspecified',
  ]) {
    test('unknown cut "$edition" cannot cross-merge editions', () {
      expect(
        UnifiedMedia.mergeSources([
          media(edition: edition),
          media(ref: 'akoam:one', edition: edition),
        ]),
        hasLength(2),
      );
    });
  }

  test('dubbed/original audio and alternate cuts remain separate', () {
    expect(
      UnifiedMedia.mergeSources([
        media(audio: 'ar', edition: 'arabic-dubbed'),
        media(ref: 'akoam:one', audio: 'tr', edition: 'turkish-original'),
      ]),
      hasLength(2),
    );
    expect(
      UnifiedMedia.mergeSources([
        media(audio: 'en', edition: 'theatrical'),
        media(ref: 'akoam:one', audio: 'en', edition: 'directors-cut'),
      ]),
      hasLength(2),
    );
  });

  test('whole-series and whole-program cards can merge without inventing episode 1', () {
    for (final type in ['series', 'program']) {
      final merged = UnifiedMedia.mergeSources([
        media(type: type),
        media(ref: 'akoam:one', type: type),
      ]);
      expect(merged, hasLength(1));
      expect(merged.single.season, null);
      expect(merged.single.episode, null);
    }
    expect(
      UnifiedMedia.mergeSources([
        media(type: 'movie', genres: ['TVShow']),
        media(ref: 'laroza:one', type: 'program'),
      ]),
      hasLength(1),
    );
  });

  for (final title in [
    'Dark S01E02',
    'Dark الحلقة 2',
    'Dark الحلقة2',
    'Dark Episode',
    'Dark الموسم الأول',
  ]) {
    test('episode marker "$title" requires explicit season and episode', () {
      expect(
        UnifiedMedia.mergeSources([
          media(type: 'series', title: title),
          media(ref: 'akoam:one', type: 'series', title: title),
        ]),
        hasLength(2),
      );
    });
  }

  test('matching known episodes merge; mismatched/missing season or episode never does', () {
    final first = media(type: 'series', season: 1, episode: 2);
    expect(
      UnifiedMedia.mergeSources([
        first,
        media(ref: 'akoam:one', type: 'series', season: 1, episode: 2),
      ]),
      hasLength(1),
    );
    for (final other in [
      media(ref: 'akoam:one', type: 'series', season: 2, episode: 2),
      media(ref: 'akoam:one', type: 'series', season: 1, episode: 3),
      media(ref: 'akoam:one', type: 'series', episode: 2),
      media(ref: 'akoam:one', type: 'series', season: 1),
      media(ref: 'akoam:one', type: 'series'),
    ]) {
      expect(UnifiedMedia.mergeSources([first, other]), hasLength(2));
    }
  });

  test(
    'an identical nonempty provider reference deduplicates incomplete rows',
    () {
      final merged = UnifiedMedia.mergeSources([
        media(audio: '', edition: '', year: null),
        media(audio: '', edition: '', year: null),
      ]);
      expect(merged, hasLength(1));
      expect(merged.single.sourceRefs, {'3isk': '3isk:one'});
      expect(
        UnifiedMedia.mergeSources([
          media(ref: '', audio: '', edition: '', year: null),
          media(ref: '', audio: '', edition: '', year: null),
        ]),
        hasLength(2),
      );
    },
  );

  test('distinct references from one provider are retained rather than overwritten', () {
    final merged = UnifiedMedia.mergeSources([
      media(ref: 'akoam:one'),
      media(ref: 'akoam:two'),
    ]);
    expect(merged, hasLength(2));
    expect(merged.map((item) => item.sourceRefs['akoam']), [
      'akoam:one',
      'akoam:two',
    ]);
  });

  test('strict identity comparison never substitutes an identical ref for missing metadata', () {
    expect(UnifiedMedia.sameIdentity(media(), media(ref: 'legacy:work')), true);
    expect(
      UnifiedMedia.sameIdentity(media(audio: ''), media(audio: '')),
      false,
    );
    expect(
      UnifiedMedia.sameIdentity(
        media(),
        media(ref: 'legacy:work', title: 'Other work'),
      ),
      false,
    );
    expect(
      UnifiedMedia.sameIdentity(
        media(type: 'series', season: 1, episode: 2),
        media(ref: 'legacy:work', type: 'series', season: 1, episode: 3),
      ),
      false,
    );
    expect(
      UnifiedMedia.sameIdentity(
        media(ref: 'laroza:work', type: 'series', audio: 'en'),
        media(ref: 'legacy:work', type: 'series', audio: 'eng'),
      ),
      true,
    );
  });

  test(
    'legacy Akwam references and persisted aliases use canonical provider keys',
    () {
      final item = media(
        ref: 'legacy:work',
        source: 'basri-direct',
      ).copyWith(sourceRefs: {'legacy': 'legacy:work', 'isk': '3isk:work'});
      expect(UnifiedMedia.providerId(item), 'akoam');
      final merged = UnifiedMedia.mergeSources([item]);
      expect(merged.single.sourceRefs, {
        'akoam': 'legacy:work',
        '3isk': '3isk:work',
      });
      expect(merged.single.ref, 'legacy:work');
    },
  );

  test('models round-trip descriptive identity without persisting signed stream data', () {
    final item = MediaItem.fromJson({
      'id': 'movie',
      'ref': 'laroza:one',
      'title': 'Movie',
      'type': 'movie',
      'year': 2020,
      'genres': [
        {'name': 'Anime'},
        'Action',
        42,
      ],
      'audio_language': 'ar',
      'edition': 'arabic-dubbed',
      'season_number': '1',
      'episode_number': 2,
      'imdb_id': 'tt1234567',
      'identity_verified': true,
      'source_refs': {'laroza': 'laroza:one', 'akoam': 'akoam:one'},
      'stream_url': 'https://secret.example/master.m3u8?token=hidden',
      'headers': {'Referer': 'https://secret.example'},
      'expires_at': 'never',
    });
    expect(item.genres, ['Anime', 'Action']);
    final json = item.toJson();
    for (final forbidden in [
      'stream_url',
      'media_path',
      'url',
      'headers',
      'expires_at',
    ]) {
      expect(json.containsKey(forbidden), false);
    }
    final restored = MediaItem.fromJson(json);
    expect(restored.sourceRefs, item.sourceRefs);
    expect(restored.audioLanguage, 'ar');
    expect(restored.edition, 'arabic-dubbed');
    expect(restored.season, 1);
    expect(restored.episode, 2);
    expect(restored.imdbId, 'tt1234567');
    expect(restored.identityVerified, true);
    final copy = restored.copyWith(poster: 'new-image');
    expect(copy.sourceRefs, item.sourceRefs);
    expect(copy.edition, item.edition);
    expect(copy.identityVerified, true);
    expect(MediaItem.fromJson({'category': 'Anime، Action'}).genres, [
      'Anime',
      'Action',
    ]);
    expect(
      MediaItem.fromJson({'identity_verified': 'true'}).identityVerified,
      false,
    );
    expect(
      MediaTaxonomy.classify(
        MediaItem.fromJson({
          'type': 'movie',
          'genres': [],
          'category': 'Anime',
        }),
      ),
      'anime',
    );
    expect(MediaItem.fromJson({}).type, 'series');
  });

  test(
    'details copy preserves identity, episodes and stream timing metadata',
    () {
      final details = TitleDetails.fromJson({
        'title': 'Show',
        'poster': 'image',
        'year': 2020,
        'description': 'Story',
        'category': ['Anime'],
        'season_number': 1,
        'episode_number': 2,
        'audio_language': 'ja',
        'edition': 'japanese-original',
        'imdb_id': 'tt1234567',
        'identity_verified': true,
        'source_refs': {'3isk': '3isk:one'},
        'episodes': [
          {'id': '2', 'episode_number': 2, 'season_number': 1},
        ],
        'media_sources': [
          {
            'provider_id': '3isk',
            'provider': 'Eshq',
            'edition': 'japanese-original',
            'timeline_verified': true,
            'timeline_offset_ms': -500,
            'url': 'https://media.example/master.m3u8',
            'format': 'hls',
          },
        ],
      });
      final copy = details.copyWith(poster: 'replacement');
      expect(copy.year, 2020);
      expect(copy.plot, 'Story');
      expect(copy.genres, ['Anime']);
      expect(copy.season, 1);
      expect(copy.episode, 2);
      expect(copy.audioLanguage, 'ja');
      expect(copy.edition, 'japanese-original');
      expect(copy.imdbId, 'tt1234567');
      expect(copy.identityVerified, true);
      expect(copy.sourceRefs, {'3isk': '3isk:one'});
      expect(copy.episodes.single.season, 1);
      expect(copy.mediaSources.single.providerId, '3isk');
      expect(copy.mediaSources.single.timelineVerified, true);
      expect(copy.mediaSources.single.timelineOffsetMs, -500);
      expect(
        StreamSource.fromJson({'url': 'https://media.example/a.mp4'})
            .timelineVerified,
        false,
      );
      expect(EpisodeItem.fromJson({'episode_number': 2}).season, null);
    },
  );
  test('dubbed cuts remain independent across sites and series references despite verified matching identity', () {
    final a = media(
      ref: '3isk:dub-one',
      title: 'وادي الذئاب مدبلج',
      year: 2003,
      audio: 'ar',
      edition: 'dubbed',
      imdb: 'tt0421384',
      verified: true,
    );
    final b = media(
      ref: '3cktv:dub-one',
      title: 'وادي الذئاب مدبلج',
      year: 2003,
      audio: 'ar',
      edition: 'dubbed',
      imdb: 'tt0421384',
      verified: true,
    );
    final c = media(
      ref: '3isk:dub-two',
      title: 'وادي الذئاب مدبلج',
      year: 2003,
      audio: 'ar',
      edition: 'dubbed',
      imdb: 'tt0421384',
      verified: true,
    );
    expect(UnifiedMedia.sameIdentity(a, b), false);
    expect(UnifiedMedia.sameIdentity(a, c), false);
    expect(UnifiedMedia.mergeSources([a, b, c, a]), hasLength(3));
  });
  test(
    'distinct explicit source edition keys never merge by title/year/IMDb',
    () {
      final a = media(
        ref: 'source:3isk:aaaaaaaaaaaaaaaaaaaaaaaa',
        title: 'Work',
        edition: 'theatrical',
        imdb: 'tt1234567',
        verified: true,
      );
      final b = media(
        ref: 'source:3cktv:bbbbbbbbbbbbbbbbbbbbbbbb',
        title: 'Work',
        edition: 'theatrical',
        imdb: 'tt1234567',
        verified: true,
      );
      expect(UnifiedMedia.sameIdentity(a, b), false);
      expect(UnifiedMedia.mergeSources([a, b, a]), hasLength(2));
    },
  );
}
