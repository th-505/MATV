import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> selectShellDestination(WidgetTester tester, String id) async {
  final menu = find.byKey(const Key('tatv-open-navigation'));
  if (menu.evaluate().isNotEmpty) {
    await tester.tap(menu);
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
  }
  // Cached TV rows are built outside the visible viewport; reveal the real row.
  final destination = find.byKey(ValueKey('nav-$id'), skipOffstage: false);
  if (destination.evaluate().isEmpty) {
    final sidebar = find.byKey(const Key('tatv-right-sidebar'));
    await tester.scrollUntilVisible(
      destination,
      180,
      scrollable: find
          .descendant(of: sidebar, matching: find.byType(Scrollable))
          .first,
    );
  }
  await tester.ensureVisible(destination);
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
  expect(destination.hitTestable(), findsOneWidget);
  await tester.tap(destination);
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
}
