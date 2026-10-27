import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'najd_theme.dart';

/// Parse before decompressing; no extraction paths, scripts, symlinks or network.
List<Uint8List> readFontZip(Uint8List bytes) {
  if (bytes.length > 24 * 1024 * 1024) {
    throw const FormatException('FONT_ZIP_TOO_LARGE');
  }
  final directory = ZipDirectory()..read(InputMemoryStream(bytes));
  if (directory.fileHeaders.isEmpty || directory.fileHeaders.length > 160) {
    throw const FormatException('FONT_ZIP_ENTRY_LIMIT');
  }
  int total = 0;
  for (final header in directory.fileHeaders) {
    final path = header.filename.replaceAll('\\', '/');
    if (path.startsWith('/') ||
        path.split('/').contains('..') ||
        path.contains(':') ||
        (header.externalFileAttributes >> 16) & 0xf000 == 0xa000) {
      throw const FormatException('FONT_ZIP_UNSAFE_ENTRY');
    }
    total += header.uncompressedSize;
    if (total > 48 * 1024 * 1024 ||
        (RegExp(r'\.(otf|ttf)$', caseSensitive: false).hasMatch(path) &&
            header.uncompressedSize > 8 * 1024 * 1024)) {
      throw const FormatException('FONT_ZIP_EXPANSION_LIMIT');
    }
  }
  final candidates = directory.fileHeaders
      .where(
        (header) =>
            !header.filename.contains('__MACOSX') &&
            RegExp(
              r'\.(otf|ttf)$',
              caseSensitive: false,
            ).hasMatch(header.filename),
      )
      .toList();
  candidates.sort((a, b) {
    int rank(String name) =>
        RegExp('sans.*regular', caseSensitive: false).hasMatch(name)
        ? 0
        : RegExp('sans.*medium', caseSensitive: false).hasMatch(name)
        ? 1
        : RegExp('sans.*bold', caseSensitive: false).hasMatch(name)
        ? 2
        : 3;
    return rank(a.filename).compareTo(rank(b.filename));
  });
  final fonts = <Uint8List>[];
  int selectedBytes = 0;
  for (final header in candidates.take(3)) {
    selectedBytes += header.uncompressedSize;
    if (selectedBytes > 3 * 1024 * 1024) {
      throw const FormatException('SELECTED_FONTS_TOO_LARGE');
    }
    final stream = OutputMemoryStream();
    header.file!.decompress(stream);
    final font = Uint8List.fromList(stream.getBytes());
    if (font.length != header.uncompressedSize ||
        font.length < 12 ||
        !(ascii.decode(font.sublist(0, 4), allowInvalid: true) == 'OTTO' ||
            font[0] == 0 && font[1] == 1 && font[2] == 0 && font[3] == 0)) {
      throw const FormatException('INVALID_FONT_SIGNATURE');
    }
    fonts.add(font);
  }
  if (fonts.isEmpty) throw const FormatException('ZIP_HAS_NO_OTF_OR_TTF');
  return fonts;
}

class NajdFontAddon {
  static const key = 'najd.local.fonts.v1';
  static Future<void> load(List<Uint8List> fonts) async {
    final family = 'NajdLocal${DateTime.now().microsecondsSinceEpoch}';
    final loader = FontLoader(family);
    for (final bytes in fonts) {
      loader.addFont(Future.value(ByteData.sublistView(bytes)));
    }
    await loader.load();
    NajdAppearance.instance.setFontFamily(family);
  }

  static Future<void> restore() async {
    try {
      final values = (await SharedPreferences.getInstance()).getStringList(key);
      if (values == null ||
          values.length > 3 ||
          values.fold<int>(0, (n, s) => n + s.length) > 4 * 1024 * 1024) {
        return;
      }
      await load(values.map(base64Decode).toList());
    } catch (_) {
      /* Keep the system/private default if a local font is unavailable. */
    }
  }
}

class NajdFontAddonControl extends StatefulWidget {
  const NajdFontAddonControl({super.key});
  @override
  State<NajdFontAddonControl> createState() => _NajdFontAddonControlState();
}

class _NajdFontAddonControlState extends State<NajdFontAddonControl> {
  bool busy = false;
  Future<void> import() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final file = await openFile(
        acceptedTypeGroups: [
          const XTypeGroup(
            label: 'Font ZIP',
            extensions: ['zip'],
            mimeTypes: ['application/zip'],
            uniformTypeIdentifiers: ['public.zip-archive'],
          ),
        ],
      );
      if (file == null) return;
      if (await file.length() > 24 * 1024 * 1024) {
        throw const FormatException('FONT_ZIP_TOO_LARGE');
      }
      final fonts = readFontZip(await file.readAsBytes());
      await NajdFontAddon.load(fonts);
      if (!await (await SharedPreferences.getInstance()).setStringList(
        NajdFontAddon.key,
        fonts.map(base64Encode).toList(),
      )) {
        throw StateError('FONT_NOT_SAVED');
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('طُبق الخط محليًا؛ لم تُرفع ملفاته إلى أي خادم'),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'تعذر استيراد الخط؛ اختر ZIP سليمًا يحتوي خطوط OTF أو TTF ضمن الحجم المسموح',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ListTile(
        leading: const Icon(Icons.font_download_outlined),
        title: const Text('إضافة خط من ZIP'),
        subtitle: const Text('على هذا الجهاز فقط · دون نشر ملفات الخط'),
        enabled: !busy,
        onTap: import,
      ),
      ListTile(
        leading: const Icon(Icons.restore),
        title: const Text('استعادة الخط الافتراضي'),
        onTap: () async {
          await (await SharedPreferences.getInstance()).remove(
            NajdFontAddon.key,
          );
          NajdAppearance.instance.setFontFamily(null);
        },
      ),
    ],
  );
}
