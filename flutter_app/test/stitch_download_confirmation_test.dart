import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/download_activity.dart';
import 'package:mitv/src/download_library_section.dart';
import 'package:mitv/src/download_service.dart';
import 'package:mitv/src/najd_theme.dart';

class _Files extends DownloadService {
  bool deleted = false;
  @override
  Future<List<DownloadedFileInfo>> listDownloads() async => deleted
      ? []
      : [
          DownloadedFileInfo(
            name: 'film.mp4',
            path: '/app/film.mp4',
            bytes: 650,
            modifiedAt: DateTime(2026),
          ),
        ];
  @override
  Future<bool> deleteDownload(String name) async {
    expect(name, 'film.mp4');
    deleted = true;
    return true;
  }
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      'download cancellation and device deletion require confirmation dark=$dark',
      (tester) async {
        final service = _Files();
        addTearDown(() {
          service.close();
          NajdDownloadActivity.instance.value = [];
        });
        var cancellations = 0;
        NajdDownloadActivity.instance.put(
          NajdDownloadJob(
            id: 'job',
            title: 'تحميل تجريبي',
            received: 65,
            total: 100,
            cancel: () => cancellations++,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            theme: dark ? NajdThemes.dark : NajdThemes.light,
            home: Scaffold(
              body: SingleChildScrollView(
                child: DownloadLibrarySection(service: service),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('قيد التحميل (1)'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('إلغاء التحميل'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('متابعة التحميل'));
        await tester.pumpAndSettle();
        expect(cancellations, 0);
        await tester.tap(find.text('إلغاء التحميل'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'إلغاء التحميل'));
        await tester.pumpAndSettle();
        expect(cancellations, 1);
        await tester.tap(find.text('المكتملة (1)'));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('خيارات التحميل'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('حذف من الجهاز'));
        await tester.pumpAndSettle();
        expect(find.textContaining('من الجهاز فقط'), findsOneWidget);
        await tester.tap(find.text('إلغاء'));
        await tester.pumpAndSettle();
        expect(service.deleted, isFalse);
        await tester.tap(find.byTooltip('خيارات التحميل'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('حذف من الجهاز'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'حذف من الجهاز'));
        await tester.pumpAndSettle();
        expect(service.deleted, isTrue);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
