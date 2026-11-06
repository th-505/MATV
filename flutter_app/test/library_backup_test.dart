import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/cloud_library.dart';

const item = CatalogItem(
  id: '42',
  ref: 'tmdb:tv:42',
  title: 'عمل',
  poster: '',
  type: 'series',
  season: 2,
);
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('portable backup restores favourites and exact episode clocks without identity/session data', () async {
    final source = await LocalLibraryStore.create();
    addTearDown(source.dispose);
    await source.toggleFavorite(item);
    await source.recordProgress(
      item: item,
      position: const Duration(minutes: 20),
      duration: const Duration(minutes: 40),
      episodeNumber: 3,
    );
    final backup = source.backupSnapshot();
    final encoded = jsonEncode(backup);
    expect(encoded, isNot(contains('access_token')));
    expect(encoded, isNot(contains('user_id')));
    SharedPreferences.setMockInitialValues({});
    final target = await LocalLibraryStore.create();
    addTearDown(target.dispose);
    final result = await target.importBackup(backup);
    expect(result.favorites, 1);
    expect(result.history, 1);
    final restored = await LocalLibraryStore.create();
    addTearDown(restored.dispose);
    expect(
      restored.resumePosition(item.ref, seasonNumber: 2, episodeNumber: 3),
      const Duration(minutes: 20),
    );
    expect(restored.isFavorite(item.ref), isTrue);
    expect(restored.pendingCloudRows, hasLength(2));
  });
  test('unsafe import is rejected before any mutation', () async {
    final store = await LocalLibraryStore.create();
    addTearDown(store.dispose);
    await expectLater(
      store.importBackup({
        'schema_version': 1,
        'favorites': [
          item.toJson(),
          {
            ...item.toJson(),
            'headers': {'Authorization': 'fixture-secret'},
          },
        ],
        'history': [],
      }),
      throwsFormatException,
    );
    expect(store.favorites, isEmpty);
    expect(store.pendingCloudRows, isEmpty);
  });
  test('atomic checkpoint retires redundant legacy copies but preserves owner and history after reopen', () async {
    SharedPreferences.setMockInitialValues({
      'mitv.auth.owner.v1': 'fixture-owner',
      'library.favorites.v1': [jsonEncode(item.toJson())],
    });
    final store = await LocalLibraryStore.create();
    addTearDown(store.dispose);
    await store.recordProgress(
      item: item,
      position: const Duration(minutes: 5),
      duration: const Duration(minutes: 40),
      episodeNumber: 2,
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('library.snapshot.v2'), isNotNull);
    for (final key in [
      'library.favorites.v1',
      'library.history.v1',
      'library.sync.v1',
    ]) {
      expect(prefs.containsKey(key), isFalse);
    }
    expect(await CloudLibrarySync.installationOwnerId(), 'fixture-owner');
    final restored = await LocalLibraryStore.create();
    addTearDown(restored.dispose);
    expect(restored.favorites, hasLength(1));
    expect(restored.history, hasLength(1));
  });
}
