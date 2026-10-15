import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/cloud_library.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/library_sync_record.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

const item = CatalogItem(
  id: 'a',
  title: 'عمل',
  poster: '',
  type: 'movie',
  ref: 'opaque:a',
);

class FakeCloud implements LibraryCloudTransport {
  @override
  String ownerId = 'owner-a';
  final rows = <String, LibrarySyncRecord>{};
  final pushes = <List<LibrarySyncRecord>>[];
  final cursors = <int>[];
  int revision = 0;
  bool fail = false;
  Completer<void>? pushGate;
  @override
  Future<List<LibrarySyncRecord>> push(List<LibrarySyncRecord> changes) async {
    pushes.add(changes);
    if (fail) throw StateError('offline');
    await pushGate?.future;
    return changes.map((row) {
      final current = rows[row.key];
      if (current != null && !row.updatedAt.isAfter(current.updatedAt)) {
        return current;
      }
      final accepted = LibrarySyncRecord(
        kind: row.kind,
        itemKey: row.itemKey,
        metadata: row.metadata,
        updatedAt: row.updatedAt,
        deleted: row.deleted,
        userId: ownerId,
        revision: ++revision,
      );
      rows[row.key] = accepted;
      return accepted;
    }).toList();
  }

  @override
  Future<List<LibrarySyncRecord>> pull({
    required int afterRevision,
    required int limit,
  }) async {
    cursors.add(afterRevision);
    if (fail) throw StateError('offline');
    final changed =
        rows.values.where((row) => row.revision > afterRevision).toList()
          ..sort((a, b) => a.revision.compareTo(b.revision));
    return changed.take(limit).toList();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late DateTime now;
  late LocalLibraryStore store;
  late FakeCloud cloud;
  CloudLibrarySync? sync;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    now = DateTime.utc(2026, 10, 15);
    store = await LocalLibraryStore.create(clock: () => now);
    cloud = FakeCloud();
  });
  tearDown(() async {
    await sync?.close();
    sync = null;
    store.dispose();
  });
  Future<void> start() async {
    sync = await CloudLibrarySync.start(
      store,
      cloud,
      clock: () => now,
      observeLifecycle: false,
      syncImmediately: false,
    );
  }

  test(
    'UUID is RFC4122 random, persisted, and survives library activity',
    () async {
      final prefs = await SharedPreferences.getInstance();
      final first = await CloudLibrarySync.deviceIdFor(prefs);
      expect(
        first,
        matches(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      );
      await store.toggleFavorite(item);
      await store.clearSearchHistory();
      expect(await CloudLibrarySync.deviceIdFor(prefs), first);
    },
  );

  test(
    'writes only metadata, batches at32, and persists acknowledged changes',
    () async {
      for (var i = 0; i < 65; i++) {
        await store.toggleFavorite(
          CatalogItem(
            id: '$i',
            title: 'عمل $i',
            poster: '',
            type: 'movie',
            ref: 'opaque:$i',
          ),
        );
      }
      await start();
      await sync!.syncNow();
      expect(cloud.pushes.map((batch) => batch.length), [32, 32, 1]);
      expect(store.pendingCloudRows, isEmpty);
      final restored = await LocalLibraryStore.create();
      expect(restored.favorites, hasLength(65));
      expect(restored.pendingCloudRows, isEmpty);
      restored.dispose();
    },
  );

  test(
    'unsubmitted local add/remove cancels but attempted lost-ACK keeps tombstone',
    () async {
      await store.toggleFavorite(item);
      await store.toggleFavorite(item);
      expect(store.pendingCloudRows, isEmpty);
      await store.toggleFavorite(item);
      await store.markCloudAttempted(store.pendingCloudRows);
      await store.toggleFavorite(item);
      expect(store.pendingCloudRows.single.deleted, isTrue);
      final restored = await LocalLibraryStore.create();
      expect(restored.pendingCloudRows.single.deleted, isTrue);
      restored.dispose();
    },
  );

  test('stale in-flight ACK cannot overwrite a later local deletion', () async {
    await store.toggleFavorite(item);
    cloud.pushGate = Completer<void>();
    await start();
    final running = sync!.syncNow();
    while (cloud.pushes.isEmpty) {
      await Future<void>.delayed(Duration.zero);
    }
    now = now.add(const Duration(seconds: 1));
    await store.toggleFavorite(item);
    cloud.pushGate!.complete();
    await running;
    expect(store.favorites, isEmpty);
    expect(store.pendingCloudRows.single.deleted, isTrue);
    cloud.pushGate = null;
    await sync!.syncNow();
    expect(cloud.rows.values.single.deleted, isTrue);
    expect(store.pendingCloudRows, isEmpty);
  });

  test(
    'history sends at most once per60seconds and cadence survives restart',
    () async {
      await store.recordProgress(
        item: item,
        position: const Duration(seconds: 5),
        duration: const Duration(minutes: 10),
      );
      await start();
      await sync!.syncNow();
      now = now.add(const Duration(seconds: 5));
      await store.recordProgress(
        item: item,
        position: const Duration(seconds: 10),
        duration: const Duration(minutes: 10),
      );
      await sync!.syncNow();
      expect(cloud.pushes, hasLength(1));
      await sync!.close();
      await start();
      await sync!.syncNow();
      expect(cloud.pushes, hasLength(1));
      now = now.add(const Duration(seconds: 55));
      await sync!.syncNow();
      expect(cloud.pushes, hasLength(2));
      expect(cloud.rows.values.single.metadata['position_ms'], 10000);
    },
  );

  test(
    'newer remote tombstone beats legacy favorite and never resurrects it',
    () async {
      SharedPreferences.setMockInitialValues({
        'library.favorites.v1': [
          '{"id":"a","title":"عمل","poster":"","type":"movie","ref":"opaque:a"}',
        ],
      });
      store.dispose();
      store = await LocalLibraryStore.create(clock: () => now);
      cloud.rows['favorite::opaque:a'] = LibrarySyncRecord(
        kind: 'favorite',
        itemKey: 'opaque:a',
        metadata: const {},
        updatedAt: now,
        userId: cloud.ownerId,
        revision: ++cloud.revision,
        deleted: true,
      );
      await start();
      await sync!.syncNow();
      expect(store.favorites, isEmpty);
      expect(cloud.pushes, isEmpty);
    },
  );

  test(
    'revision pagination sees late old-clock arrivals and resumes persisted cursor',
    () async {
      for (var i = 1; i <= 251; i++) {
        final ref = 'opaque:$i';
        cloud.rows['favorite::$ref'] = LibrarySyncRecord(
          kind: 'favorite',
          itemKey: ref,
          metadata: CatalogItem(
            id: '$i',
            title: 'عمل',
            poster: '',
            type: 'movie',
            ref: ref,
          ).toJson(),
          updatedAt: now,
          userId: cloud.ownerId,
          revision: ++cloud.revision,
        );
      }
      await start();
      await sync!.syncNow();
      expect(store.favorites, hasLength(251));
      expect(cloud.cursors, [0, 250]);
      await sync!.close();
      await start();
      cloud.rows['favorite::opaque:old-clock'] = LibrarySyncRecord(
        kind: 'favorite',
        itemKey: 'opaque:old-clock',
        metadata: item
            .copyWith(id: 'old-clock', ref: 'opaque:old-clock')
            .toJson(),
        updatedAt: now.subtract(const Duration(days: 3)),
        userId: cloud.ownerId,
        revision: ++cloud.revision,
      );
      await sync!.syncNow();
      expect(cloud.cursors.last, 251);
      expect(store.isFavorite('opaque:old-clock'), isTrue);
    },
  );

  test(
    'offline sync retains work and backs off rather than retrying each edit',
    () async {
      cloud.fail = true;
      await store.toggleFavorite(item);
      await start();
      await sync!.syncNow();
      await sync!.syncNow();
      expect(cloud.cursors, hasLength(1));
      expect(store.pendingCloudRows, hasLength(1));
      expect(sync!.lastErrorCode, 'LIBRARY_SYNC_UNAVAILABLE');
      now = now.add(const Duration(minutes: 5));
      cloud.fail = false;
      await sync!.syncNow();
      expect(store.pendingCloudRows, isEmpty);
      expect(sync!.lastErrorCode, isNull);
    },
  );

  test('metadata budget excludes URLs/tokens and counts UTF8 key bytes', () {
    LibrarySyncRecord row(
      Map<String, dynamic> metadata, {
      String key = 'opaque:a',
    }) => LibrarySyncRecord(
      kind: 'favorite',
      itemKey: key,
      metadata: metadata,
      updatedAt: now,
    );
    expect(
      row({'stream_url': 'https://media.example/x.mp4'}).fitsCloudBudget,
      isFalse,
    );
    expect(
      row({
        'poster': 'https://image.example/x.jpg?token=secret',
      }).fitsCloudBudget,
      isFalse,
    );
    expect(
      row({
        'ref': 'opaque:a',
        'genres': ['دراما'],
      }).fitsCloudBudget,
      isTrue,
    );
    expect(row({}, key: List.filled(800, 'ع').join()).fitsCloudBudget, isFalse);
  });

  test(
    'position context survives local persistence without signed URLs',
    () async {
      await store.recordProgress(
        item: item,
        position: const Duration(minutes: 2),
        duration: const Duration(minutes: 20),
        selectedSourceRef: 'opaque:alternate',
        providerId: 'laroza',
        edition: 'original',
        timelineVerified: true,
        timelineOffsetMs: 1200,
      );
      final restored = await LocalLibraryStore.create();
      final entry = restored.history.single;
      expect(entry.selectedSourceRef, 'opaque:alternate');
      expect(entry.providerId, 'laroza');
      expect(entry.edition, 'original');
      expect(entry.timelineVerified, isTrue);
      expect(entry.timelineOffsetMs, 1200);
      restored.dispose();
    },
  );
}
