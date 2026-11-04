import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mitv/src/najd_theme.dart';
import 'package:mitv/src/viewport_profile.dart';
import 'package:mitv/src/app_target.dart';

void main() {
  testWidgets(
    'live resize replaces hidden local metrics and keeps physical inches unknown',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      Future<Map<String, dynamic>> mount(Size size, EdgeInsets padding) async {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: size,
                devicePixelRatio: 2,
                viewPadding: padding,
                textScaler: const TextScaler.linear(1.25),
              ),
              child: const NajdTvViewport(child: SizedBox()),
            ),
          ),
        );
        await tester.pump();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        final prefs = await SharedPreferences.getInstance();
        return (jsonDecode(
          prefs.getString(NajdViewportProfile.storageKey)!,
        ) as Map).cast<String, dynamic>();
      }

      final small = await mount(
        const Size(390, 844),
        const EdgeInsets.only(top: 44, bottom: 24),
      );
      expect(small['logical_width'], 390);
      expect(small['physical_width'], 780);
      expect(small['safe_top'], 44);
      expect(small['layout'], isTvTarget ? 'tv' : 'compact');
      final wide = await mount(
        const Size(1920, 1080),
        const EdgeInsets.only(left: 16),
      );
      expect(wide['logical_width'], 1920);
      expect(wide['physical_height'], 2160);
      expect(wide['safe_top'], 0);
      expect(wide['safe_left'], 16);
      expect(wide['orientation'], 'landscape');
      expect(wide['layout'], isTvTarget ? 'tv' : 'wide');
      expect(wide['tv_text_multiplier'], isTvTarget ? 1.5 : 1.0);
      expect(
        wide.keys.any((key) => key.contains('inch') || key.contains('serial')),
        false,
      );
      expect(
        find.byType(Text),
        findsNothing,
        reason: 'diagnostic settings are hidden',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
