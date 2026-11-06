import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:file_selector/file_selector.dart';

import 'library_store.dart';
import 'library_backup_export_native.dart'
    if (dart.library.js_interop) 'library_backup_export_web.dart';

class LibraryBackupControl extends StatefulWidget {
  const LibraryBackupControl({super.key, required this.store});
  final LocalLibraryStore store;
  @override
  State<LibraryBackupControl> createState() => _LibraryBackupControlState();
}

class _LibraryBackupControlState extends State<LibraryBackupControl> {
  bool busy = false;
  String message = '';
  Future<void> action(Future<void> Function() work) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await work();
    } catch (_) {
      if (mounted) {
        setState(
          () => message = 'تعذر إتمام النسخ. استخدم ملف JSON الخاص بنجد ضمن 8 ميجابايت وتحقق من مساحة التخزين.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      const ListTile(
        leading: Icon(Icons.backup_outlined),
        title: Text('نسخة احتياطية للمكتبة'),
        subtitle: Text(
          'قائمتي ونقاط الحلقات فقط؛ لا تشمل ملفات الفيديو أو مفاتيح الحساب.',
        ),
      ),
      TextButton.icon(
        onPressed: busy
            ? null
            : () => action(() async {
                final data = jsonEncode(widget.store.backupSnapshot());
                await exportLibraryJson(
                  data,
                  'Najd-library-${DateTime.now().millisecondsSinceEpoch}.json',
                );
                if (mounted) {
                  setState(
                    () => message = 'جهزت نسخة المكتبة. احفظ الملف وتحقق منه قبل حذف أي تطبيق قديم.',
                  );
                }
              }),
        icon: const Icon(Icons.download_outlined),
        label: const Text('تصدير المكتبة'),
      ),
      TextButton.icon(
        onPressed: busy
            ? null
            : () => action(() async {
                final file = await openFile(
                  acceptedTypeGroups: [
                    const XTypeGroup(
                      label: 'Najd library JSON',
                      extensions: ['json'],
                      mimeTypes: ['application/json'],
                      uniformTypeIdentifiers: ['public.json'],
                    ),
                  ],
                );
                if (file == null) return;
                if (await file.length() > 8 * 1024 * 1024) {
                  throw const FormatException('BACKUP_TOO_LARGE');
                }
                final data = jsonDecode(await file.readAsString());
                if (data is! Map) throw const FormatException('INVALID_BACKUP');
                if (!context.mounted) return;
                final accept = await showDialog<bool>(
                  context: context,
                  builder: (c) => AlertDialog(
                    title: const Text('استيراد المكتبة؟'),
                    content: const Text(
                      'ستُدمج القائمة ونقاط الحلقات مع المكتبة المتزامنة حاليًا. تبقى النقاط الأحدث والحذف المحلي محفوظين.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('إلغاء'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('دمج'),
                      ),
                    ],
                  ),
                );
                if (accept != true) return;
                final result = await widget.store.importBackup(
                  Map<String, dynamic>.from(data),
                );
                if (mounted) {
                  setState(
                    () => message =
                        'أضيف ${result.favorites} للقائمة و${result.history} للسجل؛ تُرك ${result.skipped} دون تغيير.',
                  );
                }
              }),
        icon: const Icon(Icons.upload_file_outlined),
        label: const Text('استيراد المكتبة'),
      ),
      if (busy) const LinearProgressIndicator(),
      if (message.isNotEmpty) Text(message),
    ],
  );
}
