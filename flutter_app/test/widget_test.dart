import 'package:mitv/main.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Al-Qahtani app root is a Flutter widget', () {
    expect(const MitvApp(), isA<Widget>());
  });
}
