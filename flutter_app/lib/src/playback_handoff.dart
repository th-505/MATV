import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app_target.dart';
import 'cloud_library.dart';
import 'library_store.dart';
import 'library_sync_record.dart';
import 'cloud_runtime_stub.dart' if (dart.library.io) 'cloud_runtime_io.dart';

String get playbackDeviceTarget => kIsWeb
    ? 'web'
    : isTvTarget
    ? 'tv'
    : isDesktopTarget
    ? 'desktop'
    : appTarget == AppTarget.ios
    ? 'ios'
    : 'mobile';
String get playbackDeviceLabel => switch (playbackDeviceTarget) {
  'tv' => 'نجد TV — التلفزيون',
  'desktop' => 'نجد — الكمبيوتر',
  'web' => 'نجد — المتصفح',
  'ios' => 'نجد — iPhone',
  _ => 'نجد — الجوال',
};

typedef PlaybackRpc = Future<dynamic> Function(
  String name,
  Map<String, dynamic> params,
);

class PlaybackHandoff {
  PlaybackHandoff({PlaybackRpc? rpc})
    : _rpc =
          rpc ?? ((name, params) => CloudLibrarySync.playbackRpc(name, params));
  final PlaybackRpc _rpc;
  Future<void> register() async {
    await _rpc('najd_playback_register', {
      'p_target': playbackDeviceTarget,
      'p_label': playbackDeviceLabel,
    });
  }

  Future<List<Map<String, dynamic>>> targets() async {
    if (isTvTarget) throw StateError('TV_RECEIVER_ONLY');
    await register();
    final result = await _rpc('najd_playback_targets', {});
    return result is List
        ? result
              .whereType<Map>()
              .map((r) => Map<String, dynamic>.from(r))
              .toList()
        : [];
  }

  Future<void> send(String target, WatchEntry entry) async {
    if (isTvTarget) throw StateError('TV_RECEIVER_ONLY');
    final payload = entry.toJson();
    final row = LibrarySyncRecord(
      kind: 'history',
      itemKey: entry.contentRef,
      metadata: payload,
      updatedAt: DateTime.now().toUtc(),
    );
    if (!row.fitsCloudBudget || entry.contentRef.isEmpty) {
      throw const FormatException('INVALID_PLAYBACK_REQUEST');
    }
    await _rpc('najd_playback_send', {
      'p_target': target,
      'p_payload': payload,
    });
  }

  Future<Map<String, dynamic>?> inbox() async {
    final value = await _rpc('najd_playback_inbox', {});
    if (value is! List || value.isEmpty || value.first is! Map) return null;
    return Map<String, dynamic>.from(value.first as Map);
  }

  Future<void> acknowledge(String id, bool accept) async {
    await _rpc('najd_playback_ack', {'p_id': id, 'p_accept': accept});
  }
}

Future<void> showPlaybackTargets(
  BuildContext context,
  WatchEntry entry, {
  PlaybackHandoff? transport,
}) async {
  if (isTvTarget) return;
  final bridge = transport ?? PlaybackHandoff();
  try {
    final targets = await bridge.targets();
    if (!context.mounted) return;
    final target = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('إرسال التشغيل'),
        content: SizedBox(
          width: 400,
          child: targets.isEmpty
              ? const Text(
                  'اربط التلفزيون أو الكمبيوتر من الإعدادات، وافتح تطبيق نجد عليه ليستقبل التشغيل.',
                )
              : SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final device in targets)
                        ListTile(
                          leading: Icon(
                            device['target'] == 'tv'
                                ? Icons.tv
                                : Icons.computer,
                          ),
                          title: Text('${device['label']}'),
                          subtitle: Text(
                            device['online'] == true ? 'متصل الآن' : 'قد يكون التطبيق مغلقًا — الطلب صالح لدقيقتين',
                          ),
                          onTap: () =>
                              Navigator.pop(context, '${device['id']}'),
                        ),
                    ],
                  ),
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
        ],
      ),
    );
    if (target == null) return;
    await bridge.send(target, entry);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'أُرسل طلب التشغيل عند نفس الدقيقة. وافق عليه في الجهاز الآخر.',
          ),
        ),
      );
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'تعذر إرسال التشغيل. تحقق من اتصال الجهازين والربط بينهما.',
          ),
        ),
      );
    }
  }
}

class PlaybackInbox extends StatefulWidget {
  const PlaybackInbox({
    super.key,
    required this.child,
    required this.onOpen,
    this.transport,
    this.enabled = true,
  });
  final Widget child;
  final ValueChanged<WatchEntry> onOpen;
  final PlaybackHandoff? transport;
  final bool enabled;
  @override
  State<PlaybackInbox> createState() => _PlaybackInboxState();
}

class _PlaybackInboxState extends State<PlaybackInbox>
    with WidgetsBindingObserver {
  late final PlaybackHandoff bridge = widget.transport ?? PlaybackHandoff();
  Timer? timer;
  bool busy = false, active = true, registered = false;
  DateTime? retryAt;
  final seen = <String>{};
  bool get receiver =>
      playbackDeviceTarget == 'tv' ||
      playbackDeviceTarget == 'desktop' ||
      playbackDeviceTarget == 'web';
  @override
  void initState() {
    super.initState();
    if (!widget.enabled ||
        ((cloudRuntimeIsTest || const bool.fromEnvironment('FLUTTER_TEST')) &&
            widget.transport == null)) {
      return;
    }
    WidgetsBinding.instance.addObserver(this);
    unawaited(tick());
    timer = Timer.periodic(
      const Duration(seconds: 8),
      (_) => unawaited(tick()),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    active = state == AppLifecycleState.resumed;
    if (active) unawaited(tick());
  }

  Future<void> tick() async {
    if (busy ||
        !active ||
        !mounted ||
        (retryAt != null && DateTime.now().isBefore(retryAt!))) {
      return;
    }
    busy = true;
    try {
      if (!registered) {
        await bridge.register();
        registered = true;
      }
      if (!receiver) return;
      final request = await bridge.inbox();
      if (request == null || !mounted || !active) return;
      final id = '${request['id'] ?? ''}';
      if (id.isEmpty || !seen.add(id)) return;
      if (seen.length > 64) seen.remove(seen.first);
      final entry = WatchEntry.fromJson(
        Map<String, dynamic>.from(request['payload'] as Map),
      );
      if (entry.contentRef.isEmpty) return;
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('طلب تشغيل من جهازك'),
          content: Text(
            '${entry.title}\n${entry.seasonNumber == null ? '' : 'الموسم ${entry.seasonNumber} · '}${entry.episodeNumber == null ? '' : 'الحلقة ${entry.episodeNumber} · '}عند ${Duration(milliseconds: entry.positionMs).inMinutes} دقيقة',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('تجاهل'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('تشغيل هنا'),
            ),
          ],
        ),
      );
      await bridge.acknowledge(id, accepted == true);
      if (accepted == true && mounted && active) widget.onOpen(entry);
      retryAt = null;
    } catch (_) {
      retryAt = DateTime.now().add(const Duration(seconds: 30));
    } finally {
      busy = false;
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
