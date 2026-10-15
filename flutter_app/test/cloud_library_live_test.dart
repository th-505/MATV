@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/cloud_library.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/library_sync_record.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/supabase_config.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _live = bool.fromEnvironment('MITV_LIVE_SUPABASE');

class _SessionNetwork extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) => HttpClient.findProxyFromEnvironment(
      uri,
      environment: Platform.environment,
    );
    return client;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'actual SDK: two anonymous owners, restored session, stale ACK, deletion and RLS',
    () async {
      final path = Platform.environment['MITV_QA_SESSIONS'];
      if (path == null) throw StateError('MITV_QA_SESSIONS_REQUIRED');
      final ca = Platform.environment['CODEX_PROXY_CERT'];
      if (ca != null) SecurityContext.defaultContext.setTrustedCertificates(ca);
      final previousOverrides = HttpOverrides.current;
      HttpOverrides.global = _SessionNetwork();
      final sessionFile = File(path);
      final stored = (jsonDecode(await sessionFile.readAsString()) as List)
          .map((entry) => (entry as Map).cast<String, dynamic>())
          .toList();
      if (stored.length != 2) {
        throw StateError('TWO_EXISTING_QA_SESSIONS_REQUIRED');
      }
      final clients = List.generate(
        2,
        (_) => SupabaseClient(
          mitvSupabaseUrl,
          mitvSupabasePublishableKey,
          authOptions: const AuthClientOptions(autoRefreshToken: true),
        ),
      );
      CloudLibrarySync? sync;
      LocalLibraryStore? store;
      SupabaseClient? restored;
      final proof = <String, dynamic>{
        'anonymous_sdk': true,
        'physical_device': false,
      };
      try {
        for (var i = 0; i < 2; i++) {
          final response = await clients[i].auth.recoverSession(
            jsonEncode(stored[i]),
          );
          if (response.session == null) {
            throw StateError('QA_SESSION_RECOVERY_FAILED');
          }
          stored[i] = response.session!.toJson();
          await sessionFile.writeAsString(jsonEncode(stored));
          expect(response.user!.isAnonymous, isTrue);
        }
        final a = clients[0].auth.currentUser!.id;
        final b = clients[1].auth.currentUser!.id;
        expect(a, isNot(b));
        restored = SupabaseClient(
          mitvSupabaseUrl,
          mitvSupabasePublishableKey,
          authOptions: const AuthClientOptions(autoRefreshToken: true),
        );
        await restored.auth.recoverSession(jsonEncode(stored[0]));
        expect(restored.auth.currentUser!.id, a);
        proof['session_restore_same_uid'] = true;
        proof['owner_ids'] = [a, b];
        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();
        final adapterA = AnonymousLibraryTransport(clients[0], prefs);
        await adapterA.prepare();
        await adapterA.prepare();
        final deviceRows = await clients[0]
            .from('mitv_devices')
            .select()
            .eq('user_id', a);
        expect(
          deviceRows.map((row) => row['device_id']),
          contains(prefs.getString(CloudLibrarySync.deviceIdKey)),
        );
        final hiddenDevices = await clients[1]
            .from('mitv_devices')
            .select()
            .eq('user_id', a);
        expect(hiddenDevices, isEmpty);
        proof['device_registration_owned_and_persisted'] = true;
        final adapterB = SupabaseLibraryTransport(clients[1], b);
        final stamp = DateTime.now().toUtc();
        final suffix = stamp.microsecondsSinceEpoch;
        final ref = 'opaque:mitv-qa-$suffix';
        LibrarySyncRecord row(
          String title,
          DateTime updatedAt, {
          bool deleted = false,
        }) => LibrarySyncRecord(
          kind: 'favorite',
          itemKey: ref,
          metadata: deleted
              ? const {}
              : CatalogItem(
                  id: 'qa',
                  title: title,
                  poster: '',
                  type: 'movie',
                  ref: ref,
                ).toJson(),
          updatedAt: updatedAt,
          deleted: deleted,
        );
        final first = (await adapterA.push([row('A old', stamp)])).single;
        final second = (await adapterA.push([
          row('A current', stamp.add(const Duration(seconds: 1))),
        ])).single;
        expect(second.revision, greaterThan(first.revision));
        final stale = (await adapterA.push([row('A stale', stamp)])).single;
        expect(stale.metadata['title'], 'A current');
        expect(stale.revision, second.revision);
        final deletion = (await adapterA.push([
          row('', stamp.add(const Duration(seconds: 2)), deleted: true),
        ])).single;
        expect(deletion.deleted, isTrue);
        expect(
          (await adapterA.push([
            row('resurrection attempt', stamp),
          ])).single.deleted,
          isTrue,
        );
        proof['stale_write_rejected'] = true;
        proof['tombstone_not_resurrected'] = true;
        await adapterB.push([row('B own metadata', stamp)]);
        final visibleB = await clients[1]
            .from('mitv_library')
            .select()
            .eq('user_id', a)
            .eq('item_key', ref);
        expect(visibleB, isEmpty);
        var ownerInsertDenied = false;
        try {
          await clients[1].from('mitv_library').insert({
            'user_id': a,
            'kind': 'favorite',
            'item_key': 'opaque:mitv-denied-$suffix',
            'metadata': {},
            'updated_at': stamp.toIso8601String(),
          });
        } on PostgrestException catch (error) {
          ownerInsertDenied = error.code == '42501';
        }
        expect(ownerInsertDenied, isTrue);
        final bOwn = await clients[1]
            .from('mitv_library')
            .select()
            .eq('item_key', ref);
        expect(bOwn.single['metadata']['title'], 'B own metadata');
        proof['rls_cross_owner_select_empty'] = true;
        proof['rls_cross_owner_insert_denied'] = true;
        final oldClockRef = 'opaque:mitv-qa-late-$suffix';
        final late = (await adapterA.push([
          LibrarySyncRecord(
            kind: 'favorite',
            itemKey: oldClockRef,
            metadata: CatalogItem(
              id: 'late',
              title: 'Late offline',
              poster: '',
              type: 'movie',
              ref: oldClockRef,
            ).toJson(),
            updatedAt: stamp.subtract(const Duration(days: 2)),
          ),
        ])).single;
        expect(late.revision, greaterThan(deletion.revision));
        expect(
          (await adapterA.pull(
            afterRevision: deletion.revision,
            limit: 250,
          )).map((r) => r.itemKey),
          contains(oldClockRef),
        );
        proof['late_old_clock_change_visible_by_revision'] = true;
        SharedPreferences.setMockInitialValues({});
        store = await LocalLibraryStore.create();
        final localItem = CatalogItem(
          id: 'sync',
          title: 'SDK sync QA',
          poster: '',
          type: 'movie',
          ref: 'opaque:mitv-qa-sync-$suffix',
        );
        await store.toggleFavorite(localItem);
        sync = await CloudLibrarySync.start(
          store,
          adapterA,
          observeLifecycle: false,
          syncImmediately: false,
        );
        await sync.syncNow();
        expect(sync.lastErrorCode, isNull);
        expect(store.pendingCloudRows, isEmpty);
        await store.toggleFavorite(localItem);
        await sync.syncNow();
        final deleted =
            (await clients[0]
                    .from('mitv_library')
                    .select()
                    .eq('item_key', localItem.ref))
                .single;
        expect(deleted['deleted'], isTrue);
        expect(store.pendingCloudRows, isEmpty);
        proof['sdk_local_store_sync_delete_acked'] = true;
        final output = Platform.environment['MITV_QA_PROOF'];
        if (output != null) {
          await File(
            output,
          ).writeAsString(const JsonEncoder.withIndent('  ').convert(proof));
        }
        // All output is deliberately token-free. Session files remain outside Git.
        stdout.writeln(jsonEncode(proof));
      } finally {
        await sync?.close();
        store?.dispose();
        await restored?.dispose();
        for (final client in clients) {
          await client.dispose();
        }
        HttpOverrides.global = previousOverrides;
      }
    },
    skip: !_live,
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
