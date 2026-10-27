import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/najd_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance(), y = b.computeLuminance();
  return ((x > y ? x : y) + .05) / ((x > y ? y : x) + .05);
}

void main() {
  for (final brightness in Brightness.values) {
    test('readable semantic text and buttons in $brightness', () {
      final theme = NajdThemes.forBrightness(brightness);
      final colors = theme.colorScheme;
      expect(
        contrast(colors.onSurface, colors.surface),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(colors.onSurfaceVariant, colors.surface),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(colors.primary, colors.surface),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(colors.onPrimary, colors.primary),
        greaterThanOrEqualTo(4.5),
      );
    });
  }
  test('theme selection persists without touching the user library', () async {
    SharedPreferences.setMockInitialValues({'library.v1': 'keep'});
    await NajdAppearance.instance.setMode(ThemeMode.light);
    NajdAppearance.instance.mode = ThemeMode.dark;
    await NajdAppearance.instance.load();
    expect(NajdAppearance.instance.mode, ThemeMode.light);
    expect(
      (await SharedPreferences.getInstance()).getString('library.v1'),
      'keep',
    );
  });
  for (final size in [
    const Size(320, 568),
    const Size(390, 844),
    const Size(1365, 768),
    const Size(1920, 1080),
  ]) {
    testWidgets('poetry remains scrollable and skip works at $size', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: NajdThemes.light,
          home: const NajdIntro(child: Text('الصفحة الرئيسية')),
        ),
      );
      expect(find.text('محمد بن قرملة'), findsOneWidget);
      final skip = find.text('متابعة إلى نجد');
      await tester.ensureVisible(skip);
      await tester.tap(skip);
      await tester.pump();
      expect(find.text('الصفحة الرئيسية'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
