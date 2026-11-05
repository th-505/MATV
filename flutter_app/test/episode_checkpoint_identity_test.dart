import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/cloud_library.dart';
import 'package:mitv/src/watch_identity.dart';
import 'package:mitv/src/library_sync_record.dart';

import 'cloud_library_test.dart' show FakeCloud;

const show = CatalogItem(
  id: '42',
  ref: 'tmdb:tv:42',
  title: 'مسلسل',
  poster: '',
  type: 'series',
  season: 1,
);

class PointCloud extends FakeCloud implements HistoryCheckpointTransport {
  final lookedUp = <String>[];
  @override
  Future<LibrarySyncRecord?> checkpoint(String key) async {
    lookedUp.add(key);
    return rows['history::$key'];
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'missing and reused provider IDs cannot mix episodes or seasons',
    () async {
      final store = await LocalLibraryStore.create();
      addTearDown(store.dispose);
      for (final selection in [(1, 1, 120), (1, 2, 240), (2, 1, 360)]) {
        await store.recordProgress(
          item: show.copyWith(season: selection.$1),
          position: Duration(seconds: selection.$3),
          duration: const Duration(minutes: 40),
          episodeId: '',
          episodeNumber: selection.$2,
          playbackRef: '${show.ref}:s${selection.$1}:e${selection.$2}',
        );
      }
      expect(store.history, hasLength(3));
      expect(
        store.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 1),
        const Duration(minutes: 2),
      );
      expect(
        store.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 2),
        const Duration(minutes: 4),
      );
      expect(
        store.resumePosition(show.ref, seasonNumber: 2, episodeNumber: 1),
        const Duration(minutes: 6),
      );
      expect(store.resumeEntry(show.ref), isNull);
      await store.recordProgress(
        item: show,
        position: const Duration(minutes: 7),
        duration: const Duration(minutes: 40),
        episodeId: '1',
        episodeNumber: 1,
      );
      await store.recordProgress(
        item: show.copyWith(season: 2),
        position: const Duration(minutes: 9),
        duration: const Duration(minutes: 40),
        episodeId: '1',
        episodeNumber: 1,
      );
      expect(
        store.resumePosition(
          show.ref,
          episodeId: '1',
          seasonNumber: 1,
          episodeNumber: 1,
        ),
        const Duration(minutes: 7),
      );
      expect(
        store.resumePosition(
          show.ref,
          episodeId: '1',
          seasonNumber: 2,
          episodeNumber: 1,
        ),
        const Duration(minutes: 9),
      );
      final restored = await LocalLibraryStore.create();
      addTearDown(restored.dispose);
      expect(
        restored.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 2),
        const Duration(minutes: 4),
      );
    },
  );
  test('episode reference is the fallback ID and unknown numbering is not invented', () {
    final episode = EpisodeItem.fromJson({
      'ref': 'provider:opaque-episode',
      'title': 'حلقة خاصة',
    });
    expect(episode.id, 'provider:opaque-episode');
    expect(episode.hasEpisodeNumber, isFalse);
    expect(
      stableWatchEpisodeId(
        contentRef: show.ref,
        episodeId: episode.id,
        playbackRef: episode.ref,
      ),
      isNot(
        stableWatchEpisodeId(
          contentRef: show.ref,
          episodeId: 'other',
          playbackRef: 'provider:other',
        ),
      ),
    );
  });
  test('cloud transfer retains each episode, and a pause flush bypasses the five-second cadence', () async {
    var clock = DateTime.utc(2026, 11, 5);
    final first = await LocalLibraryStore.create(clock: () => clock);
    addTearDown(first.dispose);
    final cloud = FakeCloud();
    final sync = await CloudLibrarySync.start(
      first,
      cloud,
      clock: () => clock,
      syncImmediately: false,
      observeLifecycle: false,
    );
    addTearDown(sync.close);
    await first.recordProgress(
      item: show,
      position: const Duration(minutes: 3),
      duration: const Duration(minutes: 30),
      episodeNumber: 1,
    );
    await sync.syncNow();
    clock = clock.add(const Duration(seconds: 1));
    await first.recordProgress(
      item: show,
      position: const Duration(minutes: 3, seconds: 1),
      duration: const Duration(minutes: 30),
      episodeNumber: 1,
    );
    await first.recordProgress(
      item: show,
      position: const Duration(minutes: 5),
      duration: const Duration(minutes: 30),
      episodeNumber: 2,
    );
    await sync.syncNow(flushHistory: true);
    SharedPreferences.setMockInitialValues({});
    final second = await LocalLibraryStore.create(clock: () => clock);
    addTearDown(second.dispose);
    final receiver = await CloudLibrarySync.start(
      second,
      cloud,
      syncImmediately: false,
      observeLifecycle: false,
    );
    addTearDown(receiver.close);
    await receiver.syncNow();
    expect(
      second.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 1),
      const Duration(minutes: 3, seconds: 1),
    );
    expect(
      second.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 2),
      const Duration(minutes: 5),
    );
  });
  test(
    'watching over eighty episodes does not delete earlier cloud checkpoints',
    () async {
      final store = await LocalLibraryStore.create();
      addTearDown(store.dispose);
      for (var i = 1; i <= 81; i++) {
        await store.recordProgress(
          item: show,
          position: const Duration(minutes: 2),
          duration: const Duration(minutes: 20),
          episodeNumber: i,
        );
      }
      expect(
        store.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 1),
        const Duration(minutes: 2),
      );
      expect(store.pendingCloudRows.where((row) => row.deleted), isEmpty);
    },
  );
  test('a linked receiver reads one exact checkpoint without advancing the bulk sync cursor', () async {
    final source = await LocalLibraryStore.create();
    addTearDown(source.dispose);
    final cloud = PointCloud();
    final sender = await CloudLibrarySync.start(
      source,
      cloud,
      syncImmediately: false,
      observeLifecycle: false,
    );
    addTearDown(sender.close);
    for (final ep in [1, 2]) {
      await source.recordProgress(
        item: show,
        position: Duration(minutes: ep),
        duration: const Duration(minutes: 30),
        episodeNumber: ep,
      );
    }
    await sender.syncNow(flushHistory: true);
    SharedPreferences.setMockInitialValues({});
    final target = await LocalLibraryStore.create();
    addTearDown(target.dispose);
    final receiver = await CloudLibrarySync.start(
      target,
      cloud,
      syncImmediately: false,
      observeLifecycle: false,
    );
    addTearDown(receiver.close);
    final pulls = cloud.cursors.length;
    await receiver.refreshCheckpoint(
      contentRef: show.ref,
      seasonNumber: 1,
      episodeNumber: 2,
    );
    expect(cloud.cursors.length, pulls);
    expect(cloud.lookedUp.first, '${show.ref}::s1:e2');
    expect(cloud.lookedUp.length, lessThanOrEqualTo(3));
    expect(
      target.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 2),
      const Duration(minutes: 2),
    );
    await receiver.syncNow();
    expect(target.history, hasLength(2));
  });
  test(
    'newer legacy checkpoint wins over stale canonical checkpoint',
    () async {
      final cloud = PointCloud();
      final old = DateTime.utc(2026, 1, 1);
      for (final pair in [
        ('s1:e2', 60, old),
        ('legacy-two', 180, old.add(const Duration(minutes: 1))),
      ]) {
        final key = '${show.ref}::${pair.$1}';
        cloud.rows['history::$key'] = LibrarySyncRecord(
          kind: 'history',
          itemKey: key,
          updatedAt: pair.$3,
          metadata: {
            'content_ref': show.ref,
            'episode_id': pair.$1,
            'season_number': 1,
            'episode_number': 2,
            'position_ms': pair.$2 * 1000,
            'duration_ms': 1800000,
            'updated_at_ms': pair.$3.millisecondsSinceEpoch,
            'metadata': show.toJson(),
          },
        );
      }
      final store = await LocalLibraryStore.create();
      addTearDown(store.dispose);
      final sync = await CloudLibrarySync.start(
        store,
        cloud,
        syncImmediately: false,
        observeLifecycle: false,
      );
      addTearDown(sync.close);
      await sync.refreshCheckpoint(
        contentRef: show.ref,
        episodeId: 'legacy-two',
        seasonNumber: 1,
        episodeNumber: 2,
      );
      expect(
        store.resumePosition(show.ref, seasonNumber: 1, episodeNumber: 2),
        const Duration(minutes: 3),
      );
    },
  );
}
