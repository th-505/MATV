import 'dart:typed_data' show Endian;
import 'package:archive/archive.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/font_addons.dart';

Uint8List package(String name, List<int> content) => Uint8List.fromList(
  ZipEncoder().encode(
    Archive()..addFile(ArchiveFile(name, content.length, content)),
  ),
);
void main() {
  test('reads a bounded local SFNT candidate without extracting a path', () {
    final font = Uint8List.fromList([79, 84, 84, 79, ...List.filled(12, 0)]);
    expect(
      readFontZip(package('Thmanyah Sans/thmanyahsans-Regular.otf', font))
          .single,
      font,
    );
  });
  test('rejects traversal, non-font scripts and expansion bombs', () {
    expect(
      () => readFontZip(package('../font.otf', List.filled(16, 0))),
      throwsFormatException,
    );
    expect(
      () => readFontZip(package('run.js', [1, 2, 3])),
      throwsFormatException,
    );
    expect(
      () => readFontZip(package('huge.otf', List.filled(9 * 1024 * 1024, 0))),
      throwsFormatException,
    );
  });
  test('a lying uncompressed size cannot bypass the decompression bound', () {
    final zip = package('font.otf', List.filled(1024 * 1024, 0));
    for (var i = 0; i < zip.length - 28; i++) {
      if (zip[i] == 0x50 &&
          zip[i + 1] == 0x4b &&
          zip[i + 2] == 1 &&
          zip[i + 3] == 2) {
        ByteData.sublistView(zip).setUint32(i + 24, 12, Endian.little);
        break;
      }
    }
    expect(() => readFontZip(zip), throwsA(anything));
  });
}
