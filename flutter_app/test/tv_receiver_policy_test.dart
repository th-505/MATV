import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/account_settings.dart';
import 'package:mitv/src/app_target.dart';
import 'package:mitv/src/cloud_library.dart';

void main() {
  testWidgets(
    'TV link panel exposes receive controls without create or send controls',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: NajdLinkPanel(receiverOnly: true),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('إنشاء طلب ربط'), findsNothing);
      expect(find.text('نسخ رابط الربط'), findsNothing);
      expect(find.text('طلب الانضمام'), findsOneWidget);
      expect(find.textContaining('دون تسجيل دخول يدوي'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test(
    'TV account bridge refuses sender operations before contacting Supabase',
    () async {
      if (!isTvTarget) return;
      for (final method in ['najd_link_create', 'najd_link_approve']) {
        await expectLater(
          CloudLibrarySync.accountRpc(method),
          throwsA(
            isA<StateError>().having(
              (e) => e.message,
              'reason',
              'TV_RECEIVER_ONLY',
            ),
          ),
        );
      }
    },
  );
}
