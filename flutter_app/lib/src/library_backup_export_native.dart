import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:share_plus/share_plus.dart';

import 'app_target.dart';

Future<void> exportLibraryJson(String text, String name) async {
  final file = XFile.fromData(
    utf8.encode(text),
    name: name,
    mimeType: 'application/json',
  );
  if (isDesktopTarget) {
    final target = await getSaveLocation(suggestedName: name);
    if (target != null) await file.saveTo(target.path);
  } else {
    await Share.shareXFiles(
      [file],
      fileNameOverrides: [name],
      subject: 'نسخة مكتبة نجد',
    );
  }
}
