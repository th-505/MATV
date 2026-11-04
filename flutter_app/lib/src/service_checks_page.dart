import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'cloud_library.dart';
import 'library_store.dart';
import 'stitch_design.dart';

class ServiceChecksPage extends StatefulWidget {
  const ServiceChecksPage({super.key, required this.api, required this.store});
  final MitvApi api;
  final LocalLibraryStore store;
  @override
  State<ServiceChecksPage> createState() => _ServiceChecksPageState();
}

class _ServiceChecksPageState extends State<ServiceChecksPage> {
  String _scope = 'all', _cloud = 'لم يُفحص بعد';
  Map<String, dynamic>? _report;
  String? _error;
  bool _busy = false;
  int _generation = 0;
  static const _scopes = {
    'all': 'فحص الكل',
    'najd': 'قواشط نجد',
    'beta': 'قواشط بيتا',
    'tmdb': 'TMDB',
    'subtitles': 'الترجمة',
    'database': 'قاعدة البيانات',
  };
  @override
  void dispose() {
    _generation++;
    super.dispose();
  }

  Future<void> _cloudCheck() async {
    try {
      final sync = await CloudLibrarySync.startDefault(widget.store);
      if (sync == null) {
        if (mounted) setState(() => _cloud = 'المزامنة غير مهيأة');
        return;
      }
      await sync.syncNow();
      if (mounted) {
        setState(
          () => _cloud = sync.lastErrorCode != null
              ? 'تعذر الوصول إلى المزامنة السحابية'
              : widget.store.pendingCloudRows.isEmpty
              ? 'متصل · القائمة والسجل متزامنان'
              : 'متصل · توجد تغييرات بانتظار الرفع',
        );
      }
    } catch (_) {
      if (mounted) setState(() => _cloud = 'تعذر فحص المزامنة');
    }
  }

  Future<void> _run() async {
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = null;
      _report = null;
      _cloud = 'جاري فحص المزامنة…';
    });
    unawaited(_cloudCheck());
    try {
      var report = await widget.api.startServiceCheck(_scope);
      while (mounted && generation == _generation) {
        setState(() => _report = report);
        if (report['state'] == 'ready') break;
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted || generation != _generation) return;
        report = await widget.api.serviceCheckStatus('${report['id']}');
      }
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(
          () => _error =
              'تعذر استكمال الفحص الآن. النتائج السابقة محفوظة على هذه الصفحة.',
        );
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final checks = (_report?['checks'] as List? ?? const []).whereType<Map>();
    const labels = {
      'queued': 'في الانتظار',
      'running': 'جاري الفحص',
      'passed': 'اجتاز الفحص',
      'partial': 'يحتاج مراجعة',
      'failed': 'تعذر الفحص',
      'disabled': 'معطّل',
    };
    return Scaffold(
      appBar: AppBar(title: const Text('فحص الخدمات والقواشط')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'يفحص نجد وبيتا بشكل مستقل. نجاح الفهرسة وحده لا يعني نجاح تشغيل الفيديو.',
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _scope,
            items: [
              for (final e in _scopes.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: _busy ? null : (v) => setState(() => _scope = v!),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _busy ? null : _run,
            icon: const Icon(Icons.fact_check_outlined),
            label: Text(_busy ? 'الفحص جارٍ…' : 'بدء الفحص'),
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_report != null)
            Text('${_report!['finished']} من ${_report!['total']}'),
          if (_error != null) Text(_error!),
          NajdSurface(
            child: ListTile(
              leading: const Icon(Icons.cloud_sync_outlined),
              title: const Text('المزامنة السحابية'),
              subtitle: Text(_cloud),
            ),
          ),
          const NajdSurface(
            child: ListTile(
              leading: Icon(Icons.download_outlined),
              title: Text('التحميلات'),
              subtitle: Text(
                'يُفحص رابط الوسائط مع المصدر. صلاحية حفظ الملف واستئنافه تحتاج اختبارًا على هذا الجهاز.',
              ),
            ),
          ),
          for (final check in checks)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: NajdSurface(
                child: ExpansionTile(
                  title: Text('${check['label']}'),
                  subtitle: Text(labels[check['state']] ?? 'غير محسوم'),
                  children: [
                    if (check['duration_ms'] != null)
                      Text('${check['duration_ms']} مللي ثانية'),
                    if (check['reason'] != null) Text('${check['reason']}'),
                    for (final stage
                        in (check['stages'] as List? ?? const [])
                            .whereType<Map>())
                      ListTile(
                        title: Text(
                          const {
                                'catalog': 'قائمة الأعمال',
                                'search': 'البحث',
                                'details': 'تفاصيل العمل',
                                'media': 'رابط الفيديو وحاويته',
                              }[stage['stage']] ??
                              'فحص المصدر',
                        ),
                        subtitle: Text(
                          stage['reason']?.toString() ??
                              labels[stage['state']] ??
                              'غير محسوم',
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
