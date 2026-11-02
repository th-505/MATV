import 'dart:io';

import 'stitch_design.dart';
import 'download_activity.dart';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'app_target.dart';
import 'download_service.dart';
import 'local_download_player_page.dart';

typedef DownloadOpenHandler = Future<void> Function(DownloadedFileInfo item);
typedef DownloadShareHandler = Future<void> Function(DownloadedFileInfo item);

class DownloadLibrarySection extends StatefulWidget {
  const DownloadLibrarySection({
    super.key,
    this.service,
    this.onOpen,
    this.onShare,
  });

  final DownloadService? service;
  final DownloadOpenHandler? onOpen;
  final DownloadShareHandler? onShare;

  @override
  State<DownloadLibrarySection> createState() => _DownloadLibrarySectionState();
}

class _DownloadLibrarySectionState extends State<DownloadLibrarySection> {
  late final DownloadService _service;
  late final bool _ownsService;
  List<DownloadedFileInfo> _items = const [];
  bool _loading = true;
  bool _activeTab = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ownsService = widget.service == null;
    _service = widget.service ?? DownloadService();
    _reload();
  }

  @override
  void dispose() {
    if (_ownsService) _service.close();
    super.dispose();
  }

  Future<void> _reload() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await _service.listDownloads();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'تعذر قراءة التنزيلات المحلية';
      });
    }
  }

  Future<File?> _verifiedFile(DownloadedFileInfo item) async {
    final file = await _service.resolveStoredReference(item.path);
    if (file != null) return file;
    if (!mounted) return null;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'الملف المحمّل غير موجود أو غير صالح. حدّث القائمة أو أعد التنزيل.',
        ),
      ),
    );
    await _reload();
    return null;
  }

  Future<void> _open(DownloadedFileInfo item) async {
    final file = await _verifiedFile(item);
    if (file == null || !mounted) return;
    final handler = widget.onOpen;
    if (handler != null) {
      await handler(item);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LocalDownloadPlayerPage(file: file, title: item.name),
      ),
    );
  }

  Future<void> _share(DownloadedFileInfo item) async {
    final file = await _verifiedFile(item);
    if (file == null) return;
    final handler = widget.onShare;
    if (handler != null) {
      await handler(item);
      return;
    }
    await Share.shareXFiles(
      [XFile(file.path)],
      subject: item.name,
      text: 'ملف محمّل من نجد تي في',
    );
  }

  Future<void> _delete(DownloadedFileInfo item) async {
    if (!await najdConfirm(
      context,
      title: 'حذف الملف المحمّل؟',
      description:
          'سيتم حذف هذا الملف من الجهاز فقط. لن يتأثر العمل في قائمتي.',
      confirm: 'حذف من الجهاز',
    )) {
      return;
    }
    try {
      await _service.deleteDownload(item.name);
      await _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('تم حذف التنزيل من الجهاز')));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذر حذف التنزيل')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<List<NajdDownloadJob>>(
      valueListenable: NajdDownloadActivity.instance,
      builder: (context, jobs, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'التحميلات',
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              IconButton(
                tooltip: 'تحديث التنزيلات',
                onPressed: _loading ? null : _reload,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: Text('المكتملة (${_items.length})'),
                  selected: !_activeTab,
                  onSelected: (_) => setState(() => _activeTab = false),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ChoiceChip(
                  label: Text('قيد التحميل (${jobs.length})'),
                  selected: _activeTab,
                  onSelected: (_) => setState(() => _activeTab = true),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            NajdEmptyState(
              kind: NajdEmptyKind.offline,
              message: _error,
              onRetry: _reload,
            ),
          if (_activeTab) ...[
            if (jobs.isEmpty)
              const NajdEmptyState(kind: NajdEmptyKind.downloads),
            for (final job in jobs)
              NajdSurface(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Icon(
                          job.failed ? Icons.error_outline : Icons.downloading,
                          color: job.failed
                              ? Theme.of(context).colorScheme.error
                              : NajdDesign.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            job.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Directionality(
                      textDirection: TextDirection.ltr,
                      child: LinearProgressIndicator(
                        value: job.fraction,
                        minHeight: 5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      job.failed
                          ? 'تعذر إكمال التحميل. حاول مجددًا.'
                          : '${_formatBytes(job.received)}${job.total != null ? ' من ${_formatBytes(job.total!)}' : ''}',
                    ),
                    if (job.failed)
                      TextButton.icon(
                        onPressed: job.retry,
                        icon: const Icon(Icons.refresh),
                        label: const Text('إعادة المحاولة'),
                      )
                    else
                      TextButton.icon(
                        onPressed: () async {
                          if (await najdConfirm(
                            context,
                            title: 'إلغاء التحميل الجاري؟',
                            description: 'سيتم إيقاف التنزيل وحذف الملف الجزئي من الجهاز.',
                            confirm: 'إلغاء التحميل',
                            cancel: 'متابعة التحميل',
                          )) {
                            job.cancel?.call();
                          }
                        },
                        icon: const Icon(Icons.close),
                        label: const Text('إلغاء التحميل'),
                      ),
                  ],
                ),
              ),
          ] else ...[
            if (!_loading && _error == null && _items.isEmpty)
              const NajdEmptyState(kind: NajdEmptyKind.downloads),
            if (_items.isNotEmpty)
              NajdSurface(
                child: Row(
                  children: [
                    const Icon(Icons.storage, color: NajdDesign.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'حجم الملفات المحمّلة: ${_formatBytes(_items.fold(0, (total, item) => total + item.bytes))}',
                      ),
                    ),
                  ],
                ),
              ),
            for (final item in _items)
              NajdSurface(
                child: Row(
                  children: [
                    Container(
                      width: 60,
                      height: 76,
                      decoration: BoxDecoration(
                        color: NajdDesign.primary.withAlpha(25),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.movie_outlined,
                        color: NajdDesign.primary,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          InkWell(
                            onTap: () => _open(item),
                            child: Text(
                              item.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Text(_formatBytes(item.bytes)),
                          Text(
                            'جاهز للمشاهدة دون إنترنت',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'تشغيل التحميل',
                      onPressed: () => _open(item),
                      icon: const Icon(
                        Icons.play_circle_fill,
                        color: NajdDesign.primary,
                        size: 36,
                      ),
                    ),
                    PopupMenuButton<String>(
                      tooltip: 'خيارات التحميل',
                      onSelected: (v) =>
                          v == 'delete' ? _delete(item) : _share(item),
                      itemBuilder: (_) => [
                        if (!isTvTarget)
                          const PopupMenuItem(
                            value: 'share',
                            child: Text('حفظ في الملفات / مشاركة'),
                          ),
                        const PopupMenuItem(
                          value: 'delete',
                          child: Text('حذف من الجهاز'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  static String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '$bytes B';
  }
}
