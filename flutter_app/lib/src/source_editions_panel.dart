import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_target.dart';

String sourceHarvestMessage(String? reason) => switch (reason) {
  'ACCESS_BLOCKED' || 'SOURCE_ENTRY_REQUIRED' =>
    'المصدر يطلب الدخول أو يرفض الاتصال؛ لم يصل رابط فيديو مباشر.',
  'NETWORK_TIMEOUT' => 'لم يرد المصدر في الوقت المحدد.',
  'IDENTITY_UNCONFIRMED' ||
  'YEAR_CONFLICT' => 'مطابقة بيانات العمل غير مؤكدة؛ لم تُدمج النسخ.',
  'SOURCE_PLAYBACK_STILL_PENDING' =>
    'لم يكتمل تجهيز الرابط بعد. يمكنك إعادة المحاولة.',
  'SOURCE_REFERENCE_MISSING' =>
    'تعذر استعادة مرجع هذه النسخة. افتحها من نتائج البحث مجددًا.',
  _ => 'تعذر إكمال فحص المصادر الآن. أعد المحاولة أو نزّل تقرير التشخيص من لوحة التحكم.',
};

/// The TMDB card remains readable while each actual source edition is indexed.
/// No source numbering or dubbed cut is merged by title or list position.
class SourceEditionsPanel extends StatefulWidget {
  const SourceEditionsPanel({
    super.key,
    required this.api,
    required this.workRef,
    required this.onOpen,
    this.pollBudget = const Duration(minutes: 3),
    this.pollInterval = const Duration(seconds: 3),
    this.clock,
  });
  final MitvApi api;
  final String workRef;
  final ValueChanged<Map<String, dynamic>> onOpen;
  final Duration pollBudget;
  final Duration pollInterval;
  final DateTime Function()? clock;
  @override
  State<SourceEditionsPanel> createState() => _SourceEditionsPanelState();
}

class _SourceEditionsPanelState extends State<SourceEditionsPanel> {
  DateTime _now() => widget.clock?.call() ?? DateTime.now();
  Timer? _timer;
  DateTime? _deadline;
  int _generation = 0;
  bool _busy = false;
  bool _timedOut = false;
  String? _error;
  Map<String, dynamic>? _snapshot;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  @override
  void didUpdateWidget(covariant SourceEditionsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workRef != widget.workRef || oldWidget.api != widget.api) {
      _generation++;
      _timer?.cancel();
      _busy = false;
      _snapshot = null;
      _error = null;
      unawaited(_start());
    }
  }

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _start({bool retry = false}) async {
    if (_busy) return;
    _timer?.cancel();
    final generation = ++_generation;
    _deadline = _now().add(widget.pollBudget);
    setState(() {
      _busy = true;
      _timedOut = false;
      _error = null;
    });
    try {
      await widget.api
          .requestHarvest(widget.workRef, reason: retry ? 'retry' : 'card_open')
          .timeout(widget.pollBudget);
      if (!mounted || generation != _generation) return;
      await _poll(generation);
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _busy = false;
        _error = sourceHarvestMessage(null);
      });
    }
  }

  Future<void> _poll(int generation) async {
    if (!mounted || generation != _generation) return;
    final remaining = _deadline!.difference(_now());
    if (remaining <= Duration.zero) {
      _finishTimeout();
      return;
    }
    try {
      final data = await widget.api
          .harvestStatus(widget.workRef)
          .timeout(remaining);
      if (!mounted || generation != _generation) return;
      final state = '${data['state'] ?? ''}';
      final counts = data['counts'] is Map ? data['counts'] as Map : const {};
      final pending =
          ((counts['queued'] as num?)?.toInt() ?? 0) +
          ((counts['running'] as num?)?.toInt() ?? 0);
      final done =
          ['failed', 'unavailable'].contains(state) ||
          state == 'ready' && pending == 0;
      setState(() {
        _snapshot = data;
        _busy = !done;
        _error = state == 'failed'
            ? sourceHarvestMessage('${data['reason'] ?? ''}')
            : null;
      });
      if (done) return;
      final left = _deadline!.difference(_now());
      if (left <= Duration.zero) {
        _finishTimeout();
        return;
      }
      _timer = Timer(
        left < widget.pollInterval ? left : widget.pollInterval,
        () => unawaited(_poll(generation)),
      );
    } on TimeoutException {
      if (mounted && generation == _generation) _finishTimeout();
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _busy = false;
        _error = sourceHarvestMessage(null);
      });
    }
  }

  void _finishTimeout() {
    if (!mounted) return;
    setState(() {
      _busy = false;
      _timedOut = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final editions = (_snapshot?['source_editions'] as List? ?? const [])
        .whereType<Map>()
        .map((row) => row.cast<String, dynamic>())
        .toList();
    final issues = (_snapshot?['issues'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('نسخ المصادر', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'المواسم والحلقات تتبع فهرس كل موقع. المدبلج مستقل لكل مصدر، والفهرسة وحدها لا تعني أن التشغيل اجتاز الفحص.',
            ),
            if (_busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'جارٍ فحص المصادر؛ يمكنك متابعة قراءة بيانات العمل.',
                      ),
                    ),
                  ],
                ),
              ),
            if (_timedOut)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'استغرق الفحص وقتًا أطول. توقفت المتابعة التلقائية؛ يمكنك تحديث الحالة لاحقًا.',
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(_error!),
              ),
            for (final edition in editions) _edition(context, edition),
            if (!_busy && editions.isEmpty && _error == null && !_timedOut)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'لم تصل نسخة مفهرسة حتى الآن. هذا لا يثبت أن العمل غير موجود في المواقع.',
                ),
              ),
            for (final issue in issues.take(8))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  '${issue['provider'] ?? 'مصدر'}: ${sourceHarvestMessage('${issue['reason'] ?? ''}')}',
                ),
              ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _busy ? null : () => unawaited(_start(retry: true)),
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة فحص المصادر'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _edition(BuildContext context, Map<String, dynamic> edition) {
    final available = edition['available'] == true;
    final kind = switch (edition['edition']) {
      'dubbed' => 'مدبلج — نسخة مستقلة',
      'subtitled' => 'مترجم',
      _ => 'نسخة المصدر',
    };
    final seasons = (edition['seasons'] as List? ?? const []).whereType<Map>();
    final summary = seasons
        .map(
          (s) =>
              'الموسم ${s['season'] ?? s['season_number']}: ${s['episode_count'] ?? s['distinct_episodes']} حلقة',
        )
        .join(' • ');
    final id = '${edition['provider'] ?? ''}';
    final provider =
        '${edition['provider_name'] ?? widget.api.explorationSourceLabel(id)}';
    final domain = edition['domain'] is String
        ? edition['domain'] as String
        : '';
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: OutlinedButton(
        key: ValueKey('source-edition-${edition['ref']}'),
        style: OutlinedButton.styleFrom(
          minimumSize: Size(48, isTvTarget ? 64 : 48),
          padding: const EdgeInsets.all(14),
          alignment: AlignmentDirectional.centerStart,
        ),
        onPressed: available ? () => widget.onOpen(edition) : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${edition['title'] ?? 'العمل'} — $provider'),
            Text(kind),
            if (domain.isNotEmpty) Text(domain),
            if (summary.isNotEmpty) Text(summary),
            Text(
              available ? 'فتح فهرس هذه النسخة' : 'قيد الفهرسة أو غير متاح بعد',
            ),
            if (edition['reason'] != null)
              Text(sourceHarvestMessage('${edition['reason']}')),
          ],
        ),
      ),
    );
  }
}
