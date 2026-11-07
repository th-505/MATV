import 'support/shell_navigation.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _CleanupApi extends MitvApi {
  final categories = <String>[];
  int clears = 0;
  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    categories.add(categoryId);
    return [];
  }

  @override
  void clearBrowsingCache() {
    clears++;
    super.clearBrowsingCache();
  }
}

Future<void> revealSetting(WidgetTester tester, String label) async {
  if (find.text(label).evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      find.text('التخزين والخصوصية'),
      180,
      scrollable: find
          .descendant(
            of: find.byType(SettingsPage),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(find.text('التخزين والخصوصية'));
    await tester.pumpAndSettle();
  }
  await tester.scrollUntilVisible(
    find.text(label),
    180,
    scrollable: find
        .descendant(
          of: find.byType(SettingsPage),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'clear cache confirms then resets visited pages without deleting user data',
    (tester) async {
      const protectedPreferences = {
        'supabase.auth.token': 'session-kept',
        'mitv.device.uuid': 'device-kept',
        'mitv.auth.owner.v1': 'owner-kept',
        'mitv.device.uuid.v1': 'stable-device-kept',
        'sb-project-auth-token': 'persisted-session-kept',
        'library.cloud.cursor.v2.owner-kept': 'cursor-kept',
        'library.cloud.history.v1.owner-kept': 'watermark-kept',
      };
      SharedPreferences.setMockInitialValues(protectedPreferences);
      final store = await LocalLibraryStore.create();
      final api = _CleanupApi();
      addTearDown(store.dispose);
      addTearDown(api.close);
      const item = CatalogItem(
        id: 'film',
        ref: 'legacy:film',
        title: 'Favorite',
        poster: '',
        type: 'movie',
      );
      await store.toggleFavorite(item);
      await store.recordProgress(
        item: item,
        position: const Duration(seconds: 15),
        duration: const Duration(minutes: 10),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Shell(api: api, store: store),
        ),
      );
      await tester.pumpAndSettle();
      await selectShellDestination(tester, 'movies');
      await tester.pumpAndSettle();
      expect(api.categories, contains('catalog:movie:all'));
      final priorCinemaState = tester.state(find.byType(CatalogPage));
      final requestsBeforeCleanup = List<String>.of(api.categories);
      await selectShellDestination(tester, 'settings');
      await tester.pumpAndSettle();
      expect(find.text('إضافة خط من ZIP'), findsNothing);
      expect(find.text('استعادة الخط الافتراضي'), findsNothing);
      await revealSetting(tester, 'مسح الكاش المحلي');
      await tester.tap(find.text('مسح الكاش المحلي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إلغاء'));
      await tester.pumpAndSettle();
      expect(api.clears, 0);
      await revealSetting(tester, 'مسح الكاش المحلي');
      await tester.tap(find.text('مسح الكاش المحلي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حذف'));
      await tester.pumpAndSettle();
      expect(api.clears, 1);
      expect(
        api.categories,
        requestsBeforeCleanup,
        reason: 'cleanup must not fetch unseen sections',
      );
      final prefs = await SharedPreferences.getInstance();
      for (final entry in protectedPreferences.entries) {
        expect(prefs.getString(entry.key), entry.value, reason: entry.key);
      }
      expect(store.isFavorite(item.ref), isTrue);
      expect(store.resumePosition(item.ref), const Duration(seconds: 15));
      await selectShellDestination(tester, 'home');
      await tester.pumpAndSettle();
      expect(
        api.categories.where((ref) => ref == 'catalog:movie:all').length,
        2,
      );
      await selectShellDestination(tester, 'movies');
      await tester.pumpAndSettle();
      expect(
        tester.state(find.byType(CatalogPage)),
        isNot(same(priorCinemaState)),
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'download cleanup calls the real injected action only after confirmation',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalLibraryStore.create();
      final api = _CleanupApi();
      addTearDown(store.dispose);
      addTearDown(api.close);
      var deletions = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Shell(
            api: api,
            store: store,
            clearDownloads: () async {
              deletions++;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await selectShellDestination(tester, 'settings');
      await tester.pumpAndSettle();
      await revealSetting(tester, 'حذف الملفات المحمّلة');
      await tester.tap(find.text('حذف الملفات المحمّلة'));
      await tester.pumpAndSettle();
      expect(deletions, 0);
      await tester.tap(find.text('إلغاء'));
      await tester.pumpAndSettle();
      expect(deletions, 0);
      await revealSetting(tester, 'حذف الملفات المحمّلة');
      await tester.tap(find.text('حذف الملفات المحمّلة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حذف'));
      await tester.pumpAndSettle();
      expect(deletions, 1);
      expect(api.clears, 0);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('navigation during cache cleanup recreates the current data tab '
      'and preserves the Settings action', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalLibraryStore.create();
    final api = _CleanupApi();
    addTearDown(store.dispose);
    addTearDown(api.close);
    final pending = Completer<void>();
    await tester.pumpWidget(
      MaterialApp(
        home: Shell(api: api, store: store, clearCache: () => pending.future),
      ),
    );
    await tester.pumpAndSettle();
    await selectShellDestination(tester, 'settings');
    await tester.pumpAndSettle();
    final settingsState = tester.state(find.byType(SettingsPage));
    await revealSetting(tester, 'مسح الكاش المحلي');
    await tester.tap(find.text('مسح الكاش المحلي'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حذف'));
    await tester.pump(const Duration(milliseconds: 350));
    await selectShellDestination(tester, 'movies');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    expect(api.categories, contains('catalog:movie:all'));
    final pendingCinemaState = tester.state(find.byType(CatalogPage));
    pending.complete();
    await tester.pumpAndSettle();
    expect(
      tester.state(find.byType(CatalogPage)),
      isNot(same(pendingCinemaState)),
    );
    expect(api.clears, 1);
    await selectShellDestination(tester, 'settings');
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(SettingsPage)), same(settingsState));
    await tester.pumpWidget(const SizedBox());
  });
}
