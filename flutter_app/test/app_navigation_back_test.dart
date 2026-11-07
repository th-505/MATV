import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
    'native system back pops the owned navigator instead of exiting the application',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(const MitvApp());
      await tester.pump(const Duration(seconds: 11));
      await tester.pump();
      final navigator = tester.state<NavigatorState>(
        find.byType(Navigator).first,
      );
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('native-back-fixture')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('native-back-fixture'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('native-back-fixture'), findsNothing);
      expect(find.byType(MitvApp), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
