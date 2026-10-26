import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> selectShellDestination(WidgetTester tester, String id) async {
  final menu = find.byKey(const Key('tatv-open-navigation'));
  if (menu.evaluate().isNotEmpty) {
    await tester.tap(menu);
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
  }
  final destination = find.byKey(ValueKey('nav-$id'));
  await tester.ensureVisible(destination);
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
  await tester.tap(destination);
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
}
