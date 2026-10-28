import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/details_page.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/source_editions_panel.dart';
import 'package:shared_preferences/shared_preferences.dart';

const sourceA = 'source:3cktv:aaaaaaaaaaaaaaaaaaaaaaaa';
const sourceB = 'source:3isk:bbbbbbbbbbbbbbbbbbbbbbbb';
http.Response response(
  Map<String, dynamic> data, {
  String status = 'success',
  int code = 200,
}) => http.Response(
  jsonEncode({'status': status, 'data': data}),
  code,
  headers: {'content-type': 'application/json'},
);

void main() {
  test('source-authoritative TMDB metadata never manufactures playable canonical episodes', () async {
    final calls = <String>[];
    final api = MitvApi(
      client: MockClient((r) async {
        calls.add(r.url.path);
        return response({
          'title': 'وادي الذئاب',
          'source_index_authoritative': true,
          'seasons': [
            for (var n = 1; n <= 4; n++) {'season_number': n},
          ],
          'episodes': [
            {'episode_number': 1, 'ref': 'tmdb:tv:34587:s1:e1'},
          ],
        });
      }),
    );
    addTearDown(api.close);
    final details = await api.details('tmdb:tv:34587');
    expect(details.sourceIndexAuthoritative, true);
    expect(details.availableSeasons, [1, 2, 3, 4]);
    expect(details.episodes, isEmpty);
    expect(calls, ['/api/v1/tmdb/details']);
  });
  test('a selected source keeps its observed two-part 55/42 index rather than TMDB four seasons', () async {
    final api = MitvApi(
      client: MockClient((r) async {
        expect(r.url.path, '/api/v1/harvest/work');
        expect(r.url.queryParameters['ref'], sourceA);
        final season = int.parse(r.url.queryParameters['season']!);
        final count = season == 1 ? 55 : 42;
        return response({
          'title': 'وادي الذئاب مترجم',
          'provider': '3cktv',
          'source_edition': 'subtitled',
          'source_index_authoritative': true,
          'season_number': season,
          'seasons': [
            {'season_number': 1, 'episode_count': 55},
            {'season_number': 2, 'episode_count': 42},
          ],
          'episodes': [
            {
              'id': '$season:$count',
              'ref': '$sourceA:s$season:e$count',
              'episode_number': count,
              'season_number': season,
              'watch_available': true,
            },
          ],
          'episode_pagination': {'has_more': false},
        });
      }),
    );
    addTearDown(api.close);
    final one = await api.details(sourceA),
        two = await api.details('$sourceA:s2:e1');
    expect(one.availableSeasons, [1, 2]);
    expect(one.episodes.single.number, 55);
    expect(two.episodes.single.number, 42);
    expect(two.episodes.single.season, 2);
    expect(two.episodes.single.ref, '$sourceA:s2:e42');
  });
  test('source playback retries boundedly, refreshes only once and preserves exact source headers and cut', () async {
    final queries = <Map<String, String>>[];
    final api = MitvApi(
      sourcePollInterval: Duration.zero,
      client: MockClient((r) async {
        expect(r.url.path, '/api/v1/harvest/playback');
        queries.add(r.url.queryParameters);
        expect(r.url.queryParameters['ref'], sourceA);
        expect(r.url.queryParameters['season'], '2');
        expect(r.url.queryParameters['episode'], '42');
        if (queries.length == 1) {
          return response({'state': 'queued'}, status: 'accepted', code: 202);
        }
        return response({
          'state': 'ready',
          'servers': [
            {
              'url': 'https://cdn.example/42.m3u8',
              'kind': 'direct',
              'headers': {'Referer': 'https://source.example/'},
              'expires_at': DateTime.now()
                  .add(const Duration(minutes: 5))
                  .toIso8601String(),
              'provider': '3cktv',
              'provider_id': '3cktv',
              'edition': 'cut-A',
              'source_ref': '3cktv:exact42',
            },
          ],
        });
      }),
    );
    addTearDown(api.close);
    final d = await api.resolvePlayback('$sourceA:s2:e42', refresh: true);
    expect(queries.length, 2);
    expect(queries.first['refresh'], '1');
    expect(queries.last.containsKey('refresh'), false);
    expect(d.mediaType, 'm3u8');
    expect(d.mediaSources.single.edition, 'cut-A');
    expect(d.mediaSources.single.headers['Referer'], 'https://source.example/');
    expect(d.mediaSources.single.sourceRef, '3cktv:exact42');
  });
  test(
    'source playback rejects an embed even if the response calls it ready',
    () async {
      final api = MitvApi(
        client: MockClient(
          (_) async => response({
            'state': 'ready',
            'servers': [
              {
                'url': 'https://source.example/embed.html',
                'kind': 'direct',
                'expires_at': DateTime.now()
                    .add(const Duration(minutes: 5))
                    .toIso8601String(),
              },
            ],
          }),
        ),
      );
      addTearDown(api.close);
      await expectLater(
        api.resolvePlayback('$sourceA:s1:e1'),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test('source playback stops polling when its time budget expires', () async {
    var calls = 0;
    final api = MitvApi(
      sourcePlaybackTimeout: const Duration(milliseconds: 20),
      sourcePollInterval: const Duration(milliseconds: 2),
      client: MockClient((_) async {
        calls++;
        return response({'state': 'running'}, status: 'accepted', code: 202);
      }),
    );
    addTearDown(api.close);
    await expectLater(
      api.resolvePlayback('$sourceA:s1:e1'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.toString(),
          'reason',
          contains('SOURCE_PLAYBACK_STILL_PENDING'),
        ),
      ),
    );
    expect(calls, greaterThan(0));
    expect(calls, lessThan(50));
  });
  testWidgets(
    'dubbed copies from different providers remain separate choices and the panel stops waiting',
    (tester) async {
      final selected = <String>[];
      final api = MitvApi(
        client: MockClient(
          (r) async => r.url.path.endsWith('/request')
              ? response({'state': 'queued'}, status: 'accepted', code: 202)
              : response({
                  'state': 'ready',
                  'counts': {'queued': 0, 'running': 0},
                  'source_editions': [
                    {
                      'ref': sourceA,
                      'provider': '3cktv',
                      'title': 'وادي الذئاب',
                      'edition': 'dubbed',
                      'available': true,
                      'seasons': [
                        {'season': 5, 'episode_count': 77},
                      ],
                    },
                    {
                      'ref': sourceB,
                      'provider': '3isk',
                      'title': 'وادي الذئاب',
                      'edition': 'dubbed',
                      'available': true,
                      'seasons': [
                        {'season': 1, 'episode_count': 300},
                      ],
                    },
                  ],
                }),
        ),
      );
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SourceEditionsPanel(
                api: api,
                workRef: 'tmdb:tv:34587',
                onOpen: (e) => selected.add(e['ref'] as String),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('مدبلج — نسخة مستقلة'), findsNWidgets(2));
      expect(
        find.byKey(const ValueKey('source-edition-$sourceA')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('source-edition-$sourceB')),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('source-edition-$sourceA')));
      expect(selected, [sourceA]);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'a pending panel ends its automatic wait and leaves explicit retry',
    (tester) async {
      var clock = DateTime.utc(2026);
      final api = MitvApi(
        client: MockClient(
          (r) async => response(
            {
              'state': 'running',
              'counts': {'running': 1},
            },
            status: r.url.path.endsWith('/request') ? 'accepted' : 'success',
            code: r.url.path.endsWith('/request') ? 202 : 200,
          ),
        ),
      );
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SourceEditionsPanel(
              api: api,
              workRef: 'tmdb:tv:34587',
              clock: () => clock,
              pollBudget: const Duration(milliseconds: 10),
              pollInterval: const Duration(milliseconds: 2),
              onOpen: (_) {},
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      clock = clock.add(const Duration(seconds: 1));
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump();
      expect(find.textContaining('توقفت المتابعة التلقائية'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'favorite remains local when the harvesting request fails and explains missing confirmation',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      const item = CatalogItem(
        id: 'tmdb:movie:1',
        ref: 'tmdb:movie:1',
        title: 'Work',
        poster: '',
        type: 'movie',
      );
      final api = MitvApi(
        client: MockClient(
          (r) async => r.url.path.endsWith('/request')
              ? http.Response('{}', 503)
              : response({'title': 'Work', 'source_index_authoritative': true}),
        ),
      );
      addTearDown(api.close);
      await tester.pumpWidget(
        MaterialApp(
          home: DetailsPage(api: api, store: store, item: item),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.favorite_border));
      await tester.pumpAndSettle();
      expect(store.isFavorite(item.ref), true);
      expect(find.textContaining('حُفظت المفضلة محليًا'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('source-only season five and pagination preserve observed gaps', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    final requests = <Map<String, String>>[];
    final api = MitvApi(
      client: MockClient((r) async {
        requests.add(r.url.queryParameters);
        expect(r.url.path, '/api/v1/harvest/work');
        final next = r.url.queryParameters['offset'] == '2';
        return response({
          'ref': sourceA,
          'title': 'نسخة الموسم الخامس',
          'source_index_authoritative': true,
          'provider': '3cktv',
          'source_edition': 'dubbed',
          'season_number': 5,
          'seasons': [
            {'season_number': 5, 'episode_count': 3},
          ],
          'episodes': [
            for (final n in next ? [4] : [1, 3])
              {
                'id': 'e$n',
                'ref': '$sourceA:s5:e$n',
                'episode_number': n,
                'season_number': 5,
                'title': 'الحلقة $n',
                'watch_available': true,
              },
          ],
          'episode_pagination': {
            'has_more': !next,
            'next_offset': next ? null : 2,
          },
        });
      }),
    );
    addTearDown(api.close);
    const item = CatalogItem(
      id: sourceA,
      ref: sourceA,
      title: 'نسخة الموسم الخامس',
      poster: '',
      type: 'series',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: DetailsPage(api: api, store: store, item: item),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('الحلقة 1'), findsOneWidget);
    expect(find.text('الحلقة 3'), findsOneWidget);
    expect(find.text('الحلقة 2'), findsNothing);
    final more = find.text('تحميل المزيد من حلقات المصدر');
    await tester.ensureVisible(more);
    await tester.tap(more);
    await tester.pumpAndSettle();
    expect(requests.last['season'], '5');
    expect(requests.last['offset'], '2');
    expect(find.text('الحلقة 4'), findsOneWidget);
    expect(find.text('الحلقة 2'), findsNothing);
    expect(find.text('تحميل المزيد من حلقات المصدر'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  test('a direct 3cktv catalogue reference resolves its own source work rather than legacy or TMDB metadata', () async {
    var requestCount = 0;
    final api = MitvApi(
      client: MockClient((r) async {
        switch (r.url.path) {
          case '/api/v1/harvest/request':
            requestCount++;
            expect(r.url.queryParameters['ref'], '3cktv:observed-series');
            return response(
              {'ref': sourceA, 'state': 'queued'},
              status: 'accepted',
              code: 202,
            );
          case '/api/v1/harvest/status':
            return response({
              'ref': sourceA,
              'state': 'ready',
              'source_editions': [
                {'ref': sourceA, 'available': true},
              ],
            });
          case '/api/v1/harvest/work':
            return response({
              'ref': sourceA,
              'title': 'وادي الذئاب',
              'source_index_authoritative': true,
              'provider': '3cktv',
              'source_edition': 'subtitled',
              'season_number': 1,
              'seasons': [
                {'season_number': 1, 'episode_count': 97},
              ],
              'episodes': [
                {
                  'episode_number': 97,
                  'season_number': 1,
                  'ref': '$sourceA:s1:e97',
                  'title': 'الحلقة 97',
                },
              ],
            });
          default:
            throw StateError('Unexpected legacy/TMDB route ${r.url.path}');
        }
      }),
    );
    addTearDown(api.close);
    final d = await api.details('3cktv:observed-series');
    expect(d.sourceWorkRef, sourceA);
    expect(d.availableSeasons, [1]);
    expect(d.episodes.single.number, 97);
    expect(requestCount, 1);
  });

  test('an unindexed provider reference times out without a fabricated TMDB fallback', () async {
    final api = MitvApi(
      sourceIndexTimeout: const Duration(milliseconds: 20),
      sourcePollInterval: const Duration(milliseconds: 2),
      client: MockClient(
        (r) async => r.url.path.endsWith('/request')
            ? response(
                {'ref': sourceA, 'state': 'queued'},
                status: 'accepted',
                code: 202,
              )
            : response({
                'ref': sourceA,
                'state': 'running',
                'source_editions': [],
              }),
      ),
    );
    addTearDown(api.close);
    await expectLater(
      api.details('3cktv:observed-series'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.toString(),
          'reason',
          contains('SOURCE_INDEX_STILL_PENDING'),
        ),
      ),
    );
  });

  testWidgets(
    'opening a canonical card queues once while its source panel shares the admission request',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      var requests = 0;
      final api = MitvApi(
        client: MockClient((r) async {
          if (r.url.path.endsWith('/request')) {
            requests++;
            return response(
              {'ref': 'tmdb:tv:34587', 'state': 'ready'},
              status: 'accepted',
              code: 202,
            );
          }
          if (r.url.path.endsWith('/status')) {
            return response({
              'state': 'ready',
              'counts': {'queued': 0, 'running': 0},
              'source_editions': [],
            });
          }
          expect(r.url.path, '/api/v1/tmdb/details');
          return response({
            'title': 'وادي الذئاب',
            'source_index_authoritative': true,
          });
        }),
      );
      addTearDown(api.close);
      const item = CatalogItem(
        id: 'tmdb:tv:34587',
        ref: 'tmdb:tv:34587',
        title: 'وادي الذئاب',
        poster: '',
        type: 'series',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: DetailsPage(api: api, store: store, item: item),
        ),
      );
      await tester.pumpAndSettle();
      expect(requests, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'changing seasons after a provider-reference card uses the resolved edition key',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final sourceQueries = <Map<String, String>>[];
      final api = MitvApi(
        client: MockClient((r) async {
          if (r.url.path.endsWith('/request')) {
            expect(r.url.queryParameters['ref'], '3cktv:series');
            return response(
              {'ref': sourceA, 'state': 'ready'},
              status: 'accepted',
              code: 202,
            );
          }
          if (r.url.path.endsWith('/status')) {
            return response({
              'state': 'ready',
              'source_editions': [
                {'ref': sourceA, 'available': true},
              ],
            });
          }
          expect(r.url.path, '/api/v1/harvest/work');
          sourceQueries.add(r.url.queryParameters);
          expect(r.url.queryParameters['ref'], sourceA);
          final season = int.parse(r.url.queryParameters['season']!);
          return response({
            'ref': sourceA,
            'title': 'العمل',
            'source_index_authoritative': true,
            'season_number': season,
            'seasons': [
              {'season_number': 1, 'episode_count': 55},
              {'season_number': 2, 'episode_count': 42},
            ],
            'episodes': [
              {
                'id': 's$season',
                'ref': '$sourceA:s$season:e1',
                'season_number': season,
                'episode_number': 1,
                'title': 'حلقة الموسم $season',
              },
            ],
          });
        }),
      );
      addTearDown(api.close);
      const item = CatalogItem(
        id: '3cktv:series',
        ref: '3cktv:series',
        title: 'العمل',
        poster: '',
        type: 'series',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: DetailsPage(api: api, store: store, item: item),
        ),
      );
      await tester.pumpAndSettle();
      final selector = find.byKey(const Key('title-season-selector'));
      await tester.ensureVisible(selector);
      await tester.tap(selector);
      await tester.pumpAndSettle();
      await tester.tap(find.text('الموسم 2').last);
      await tester.pumpAndSettle();
      expect(sourceQueries.last['season'], '2');
      expect(find.text('حلقة الموسم 2'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
