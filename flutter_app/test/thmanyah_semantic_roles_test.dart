import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/najd_theme.dart';

void main() {
  test('three Thmanyah families cover all fifteen semantic roles and ignores retired custom-font overrides', () {
    final appearance = NajdAppearance.instance;
    appearance.fontFamily = null;
    appearance.markBundledFontReady(serif: true);
    final t = NajdThemes.forBrightness(Brightness.dark).textTheme;
    final roles = [
      t.displayLarge,
      t.displayMedium,
      t.displaySmall,
      t.headlineLarge,
      t.headlineMedium,
      t.headlineSmall,
      t.titleLarge,
      t.titleMedium,
      t.titleSmall,
      t.bodyLarge,
      t.bodyMedium,
      t.bodySmall,
      t.labelLarge,
      t.labelMedium,
      t.labelSmall,
    ];
    final pairs = roles
        .map((s) => '${s!.fontFamily}:${s.fontWeight!.value}')
        .toSet();
    expect(pairs.length, 15);
    for (final family in [
      'ThmanyahSans',
      'ThmanyahSerifText',
      'ThmanyahSerifDisplay',
    ]) {
      for (final weight in [300, 400, 500, 700, 900]) {
        expect(pairs, contains('$family:$weight'));
      }
    }
    appearance.setFontFamily('UserLocalFont');
    expect(
      NajdThemes.forBrightness(Brightness.light)
          .textTheme
          .bodyMedium!
          .fontFamily,
      'ThmanyahSans',
    );
    appearance.fontFamily = null;
    appearance.bundledFontReady = false;
    appearance.bundledSerifReady = false;
  });
}
