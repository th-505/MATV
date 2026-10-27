import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/font_addons.dart';
import 'package:mitv/src/najd_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final input = Platform.environment['NAJD_PRIVATE_FONT_ZIP'];
  test(
    'owner-provided Thmanyah ZIP loads locally without publishing any bytes',
    () async {
      final fonts = readFontZip(await File(input!).readAsBytes());
      expect(fonts.length, 3);
      await NajdFontAddon.load(fonts);
      expect(NajdAppearance.instance.fontFamily, startsWith('NajdLocal'));
      NajdAppearance.instance.setFontFamily(null);
    },
    skip: input == null,
  );
}
