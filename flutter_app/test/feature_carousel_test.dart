import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/stitch_design.dart';

void main() {
  testWidgets(
    'carousel rotates real works and pauses after explicit navigation',
    (tester) async {
      final items = List.generate(
        3,
        (i) => CatalogItem(
          id: '$i',
          title: 'العمل $i',
          poster: '',
          type: 'movie',
          ref: 'tmdb:movie:$i',
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: NajdFeatureCarousel(
                items: items,
                isSaved: (_) => false,
                onWatch: (_) {},
                onSave: (_) {},
              ),
            ),
          ),
        ),
      );
      expect(find.text('1 / 3'), findsOneWidget);
      await tester.pump(const Duration(seconds: 8));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('2 / 3'), findsOneWidget);
      await tester.tap(find.byTooltip('العمل التالي'));
      await tester.pumpAndSettle();
      expect(find.text('3 / 3'), findsOneWidget);
      await tester.pump(const Duration(seconds: 9));
      expect(find.text('3 / 3'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
