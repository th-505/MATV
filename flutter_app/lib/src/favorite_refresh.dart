import 'dart:async';

import 'package:flutter/material.dart';

import 'cloud_library.dart';

class FavoriteRefresh extends StatefulWidget {
  const FavoriteRefresh({super.key, required this.ref, this.refresh});
  final String ref;
  final Future<({bool queued, int retryAfter})> Function(String)? refresh;
  @override
  State<FavoriteRefresh> createState() => _FavoriteRefreshState();
}

class _FavoriteRefreshState extends State<FavoriteRefresh> {
  bool busy = false;
  int remaining = 0;
  Timer? ticker;
  @override
  void dispose() {
    ticker?.cancel();
    super.dispose();
  }

  Future<void> run() async {
    if (busy || remaining > 0) return;
    setState(() => busy = true);
    try {
      final result = await (widget.refresh ?? CloudLibrarySync.refreshFavorite)(
        widget.ref,
      );
      if (!mounted) return;
      setState(() => remaining = result.retryAfter);
      ticker?.cancel();
      ticker = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        setState(() => remaining = (remaining - 1).clamp(0, 60));
        if (remaining == 0) timer.cancel();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.queued
                ? 'أُضيف تحديث الحلقات إلى الطابور'
                : 'انتظر $remaining ثانية قبل التحديث',
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'تعذر جدولة التحديث؛ تأكد من مزامنة المفضلة والاتصال',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: remaining > 0 ? 'التحديث بعد $remaining ثانية' : 'تحديث الحلقات',
    onPressed: busy || remaining > 0 ? null : run,
    icon: busy
        ? const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : remaining > 0
        ? Text('$remaining')
        : const Icon(Icons.refresh),
  );
}
