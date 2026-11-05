import 'najd_panels.dart';
import 'stitch_design.dart';

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_selector/file_selector.dart';
import 'package:url_launcher/url_launcher.dart';

import 'cloud_library.dart';
import 'app_target.dart';

class NajdAccountPage extends StatefulWidget {
  const NajdAccountPage({super.key});
  @override
  State<NajdAccountPage> createState() => _NajdAccountPageState();
}

class _NajdAccountPageState extends State<NajdAccountPage> {
  final name = TextEditingController();
  String avatar = '', message = '', installationId = '';
  bool busy = true;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final data = await CloudLibrarySync.profile();
      if (!mounted) return;
      installationId = await CloudLibrarySync.installationOwnerId() ?? '';
      if (!mounted) return;
      name.text = '${data['display_name'] ?? 'مشاهد نجد'}';
      avatar = '${data['avatar_data'] ?? ''}';
    } catch (_) {
      message = 'تعذر تحميل الحساب؛ بيانات المكتبة المحلية محفوظة';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save({String? image}) async {
    final title = name.text.trim();
    if (title.isEmpty || title.length > 64) return;
    setState(() => busy = true);
    try {
      await CloudLibrarySync.profile(name: title, avatar: image);
      if (mounted) {
        setState(() {
          if (image != null) avatar = image;
          message = 'حُفظ الحساب';
        });
      }
    } catch (_) {
      if (mounted) setState(() => message = 'تعذر حفظ الحساب؛ حاول مجددًا');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseAvatar() async {
    try {
      final file = await openFile(
        acceptedTypeGroups: [
          const XTypeGroup(
            label: 'صورة',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
            mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
            uniformTypeIdentifiers: ['public.image'],
          ),
        ],
      );
      if (file == null) return;
      if (await file.length() > 128 * 1024) {
        throw const FormatException('IMAGE_TOO_LARGE');
      }
      final bytes = await file.readAsBytes();
      final png =
          bytes.length >= 8 &&
          bytes[0] == 137 &&
          bytes[1] == 80 &&
          bytes[2] == 78 &&
          bytes[3] == 71;
      final jpeg =
          bytes.length >= 3 &&
          bytes[0] == 255 &&
          bytes[1] == 216 &&
          bytes[2] == 255;
      final webp =
          bytes.length >= 12 &&
          ascii.decode(bytes.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
          ascii.decode(bytes.sublist(8, 12), allowInvalid: true) == 'WEBP';
      if (!png && !jpeg && !webp) throw const FormatException('INVALID_IMAGE');
      await save(
        image:
            'data:image/${png
                ? 'png'
                : jpeg
                ? 'jpeg'
                : 'webp'};base64,${base64Encode(bytes)}',
      );
    } catch (_) {
      if (mounted) {
        setState(
          () => message = 'اختر صورة PNG أو JPEG أو WebP أصغر من128 كيلوبايت',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('حساب نجد')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (busy) const LinearProgressIndicator(),
        if (avatar.isNotEmpty)
          Center(
            child: ClipOval(
              child: Image.memory(
                base64Decode(avatar.split(',').last),
                width: 88,
                height: 88,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const Icon(Icons.person, size: 88),
              ),
            ),
          )
        else
          const Icon(Icons.account_circle, size: 88),
        TextButton.icon(
          onPressed: busy ? null : chooseAvatar,
          icon: const Icon(Icons.image),
          label: const Text('تغيير الصورة'),
        ),
        TextField(
          controller: name,
          maxLength: 64,
          decoration: const InputDecoration(labelText: 'الاسم'),
        ),
        FilledButton(
          onPressed: busy ? null : () => save(),
          child: const Text('حفظ الحساب'),
        ),
        if (message.isNotEmpty)
          Padding(padding: const EdgeInsets.all(12), child: Text(message)),
        if (installationId.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(12),
            child: SelectableText('معرّف هذه النسخة: $installationId'),
          ),
        const SizedBox(height: 20),
        const NajdSurface(child: NajdLinkPanel()),
      ],
    ),
  );
}

class NajdLinkPanel extends StatefulWidget {
  const NajdLinkPanel({super.key, this.receiverOnly});
  final bool? receiverOnly;
  @override
  State<NajdLinkPanel> createState() => _NajdLinkPanelState();
}

class _NajdLinkPanelState extends State<NajdLinkPanel> {
  bool get _receiverOnly => widget.receiverOnly ?? isTvTarget;
  final incoming = TextEditingController();
  Timer? poll;
  Map<String, dynamic>? ticket, status;
  String message = '', kind = 'browser';
  bool busy = false, ownsTicket = false;
  bool _checking = false;
  List<Map<String, dynamic>> members = [];
  Future<void> loadMembers() async {
    try {
      final value = await CloudLibrarySync.accountRpc('najd_link_members');
      if (mounted && value is List) {
        setState(
          () => members = value
              .whereType<Map>()
              .map((row) => Map<String, dynamic>.from(row))
              .toList(),
        );
      }
    } catch (_) {
      /* Offline account remains usable locally. */
    }
  }

  String get link {
    const base = String.fromEnvironment(
      'MITV_INTERNAL_WEB_BASE',
      defaultValue: 'https://th-505.github.io/NajdTV/',
    );
    return Uri.parse(base)
        .replace(
          fragment: Uri(
            queryParameters: {
              'najd_link': '${ticket!['id']}',
              'ticket': '${ticket!['token']}',
            },
          ).query,
        )
        .toString();
  }

  @override
  void initState() {
    super.initState();
    unawaited(loadMembers());
    try {
      final fragment = Uri.splitQueryString(Uri.base.fragment);
      if (fragment.containsKey('najd_link')) {
        incoming.text = Uri.base.toString();
      }
    } catch (_) {
      message = 'رابط الربط غير صالح';
    }
  }

  @override
  void dispose() {
    poll?.cancel();
    incoming.dispose();
    super.dispose();
  }

  Future<void> action(Future<void> Function() work) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await work();
    } catch (error) {
      if (mounted) {
        final detail = error.toString();
        setState(
          () => message = detail.contains('LINK_RATE_LIMITED')
              ? 'انتظر قليلاً قبل إنشاء أو إدخال طلب آخر'
              : detail.contains('LINK_OWNER_REQUIRED') ||
                    detail.contains('LINK_OWNER_CONFLICT')
              ? 'هذا الجهاز مرتبط بمكتبة جهاز آخر؛ أنشئ الطلب من الجهاز الأصلي'
              : detail.contains('ACCOUNT_UNAVAILABLE') ||
                    detail.contains('NAJD_AUTH_REQUIRED')
              ? 'لم يكتمل اتصال حساب نجد. أعد المحاولة بعد اتصال الجهاز'
              : detail.contains('LINK_NOT_APPROVABLE')
              ? 'انتهى الطلب أو لم يستقبله الجهاز الآخر؛ أنشئ طلباً جديداً'
              : 'تعذر إكمال الربط؛ تحقق من الاتصال وصلاحية الطلب',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> create() => action(() async {
    if (_receiverOnly) throw StateError('TV_RECEIVER_ONLY');
    final value = await CloudLibrarySync.accountRpc('najd_link_create', {
      'p_kind': kind,
    });
    if (!mounted) return;
    setState(() {
      ticket = Map<String, dynamic>.from(value as Map);
      ownsTicket = true;
      status = null;
      message = 'افتح الطلب على الجهاز الآخر، ثم وافق عليه هنا';
    });
    poll?.cancel();
    poll = Timer.periodic(
      const Duration(seconds: 3),
      (_) => unawaited(check()),
    );
  });
  Future<void> check() async {
    if (ticket == null || _checking) return;
    _checking = true;
    try {
      final value = await CloudLibrarySync.accountRpc('najd_link_status', {
        'p_id': ticket!['id'],
      });
      if (!mounted) return;
      setState(() => status = Map<String, dynamic>.from(value as Map));
      if (status?['approved'] == true) {
        await CloudLibrarySync.refreshAccountContext();
        await loadMembers();
      }
      if (status?['expired'] == true || status?['approved'] == true) {
        poll?.cancel();
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => message = 'تعذر تحديث حالة الطلب؛ سنحاول مجدداً تلقائياً',
        );
      }
    } finally {
      _checking = false;
    }
  }

  Future<void> claim() => action(() async {
    final uri = Uri.parse(incoming.text.trim());
    if (uri.scheme != 'https' && uri.scheme != 'http') {
      throw const FormatException('INVALID_LINK');
    }
    final values = Uri.splitQueryString(uri.fragment);
    if (!RegExp(r'^[a-f0-9-]{36}$').hasMatch(values['najd_link'] ?? '') ||
        !RegExp(r'^[a-f0-9]{48}$').hasMatch(values['ticket'] ?? '')) {
      throw const FormatException('INVALID_LINK');
    }
    final value = await CloudLibrarySync.accountRpc('najd_link_claim', {
      'p_id': values['najd_link'],
      'p_token': values['ticket'],
      'p_label': 'متصفح أو جهاز نجد',
    });
    if (value['claimed'] == true && mounted) {
      ownsTicket = false;
      setState(
        () => ticket = {
          'id': values['najd_link'],
          'token': values['ticket'],
          'expires_at': 'بعد ثلاث دقائق',
        },
      );
      poll?.cancel();
      poll = Timer.periodic(
        const Duration(seconds: 3),
        (_) => unawaited(check()),
      );
    }
    if (mounted) {
      setState(
        () => message = value['claimed'] == true
            ? 'بانتظار موافقة الجهاز الأصلي؛ افتحه لإكمال الربط'
            : 'الطلب منتهٍ أو غير صالح',
      );
    }
  });
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const NajdSectionHeading('ربط أجهزتك'),
      Text(
        _receiverOnly
            ? 'يعمل التلفاز مستقلًا دون تسجيل دخول يدوي. لعرض مكتبتك وتقدم حلقاتك، أنشئ رابط الربط من الجوال أو الكمبيوتر والصقه هنا، ثم وافق من الجهاز الأصلي. التلفاز يستقبل طلبات الربط فقط.'
            : 'شارك قائمتي وتقدم المشاهدة مع جهاز آخر. التحميلات تبقى على كل جهاز.\n1. أنشئ الطلب على الجهاز الذي يحتوي مكتبتك.\n2. انسخ الرابط وافتحه أو الصقه في الجهاز الآخر واضغط استقبال الطلب.\n3. ارجع للجهاز الأصلي ووافق على الربط.\nالطلب صالح 3 دقائق. مدة الربط أسبوع أو مستمرة حتى تلغيه بحسب اختيارك.',
      ),
      if (!_receiverOnly) ...[
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: OutlinedButton.icon(
            icon: const Icon(Icons.devices_outlined),
            label: Text(
              kind == 'browser' ? 'ربط مستمر حتى الإلغاء' : 'ربط مؤقت — 7 أيام',
            ),
            onPressed: busy
                ? null
                : () async {
                    final value = await showNajdOptions<String>(
                      context,
                      title: 'نوع الربط',
                      icon: Icons.devices_outlined,
                      options: [
                        NajdOption(
                          'browser',
                          'ربط مستمر حتى الإلغاء',
                          selected: kind == 'browser',
                          icon: Icons.web,
                        ),
                        NajdOption(
                          'device',
                          'ربط مؤقت — 7 أيام',
                          selected: kind == 'device',
                          icon: Icons.devices_outlined,
                        ),
                      ],
                    );
                    if (mounted && value != null) setState(() => kind = value);
                  },
          ),
        ),
        FilledButton.tonal(
          onPressed: busy ? null : create,
          child: const Text('إنشاء طلب ربط'),
        ),
      ],
      if (ticket != null) ...[
        Text('ينتهي الطلب: ${ticket!['expires_at']}'),
        if (ownsTicket && !_receiverOnly)
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: link));
                  if (mounted) {
                    setState(
                      () => message =
                          'نُسخ الرابط؛ افتحه على الجهاز الآخر ثم استقبل الطلب',
                    );
                  }
                },
                child: const Text('نسخ رابط الربط'),
              ),
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(link),
                  mode: LaunchMode.externalApplication,
                ),
                child: const Text('فتح نسختي في المتصفح'),
              ),
            ],
          ),
        if (!_receiverOnly &&
            ownsTicket &&
            status?['claimed'] == true &&
            status?['approved'] != true &&
            status?['expired'] != true)
          FilledButton(
            onPressed: busy
                ? null
                : () => action(() async {
                    await CloudLibrarySync.accountRpc('najd_link_approve', {
                      'p_id': ticket!['id'],
                    });
                    await check();
                    if (mounted) {
                      setState(
                        () => message =
                            'تم الربط؛ المزامنة ستظهر على الجهاز الآخر',
                      );
                    }
                  }),
            child: Text(
              'موافقة على ربط ${status?['receiver_label'] ?? 'الجهاز'}',
            ),
          ),
        if (status?['expired'] == true)
          Text(
            _receiverOnly
                ? 'انتهت صلاحية الطلب؛ أنشئ رابطًا جديدًا من الجوال أو الكمبيوتر'
                : 'انتهت صلاحية الطلب؛ أنشئ طلبًا جديدًا',
          ),
      ],
      const SizedBox(height: 16),
      TextField(
        controller: incoming,
        decoration: const InputDecoration(
          labelText: 'رابط الربط من الجهاز الأصلي',
        ),
      ),
      TextButton(
        onPressed: busy ? null : claim,
        child: const Text('طلب الانضمام'),
      ),
      TextButton(
        onPressed: busy
            ? null
            : () => action(() async {
                await CloudLibrarySync.accountRpc('najd_link_revoke');
                await CloudLibrarySync.refreshAccountContext();
                if (mounted) setState(() => message = 'أُلغي ربط هذا الجهاز');
              }),
        child: const Text('إلغاء ربط هذا الجهاز'),
      ),
      TextButton(
        onPressed: busy ? null : loadMembers,
        child: const Text('تحديث الأجهزة المرتبطة'),
      ),
      for (final member in members)
        ListTile(
          title: Text('${member['display_name'] ?? 'جهاز نجد'}'),
          subtitle: Text(
            member['expires_at'] == null
                ? 'ربط مستمر'
                : 'ينتهي: ${member['expires_at']}',
          ),
          trailing: TextButton(
            onPressed: busy
                ? null
                : () => action(() async {
                    await CloudLibrarySync.accountRpc('najd_link_revoke', {
                      'p_member': member['member_id'],
                    });
                    await loadMembers();
                  }),
            child: const Text('إلغاء الربط'),
          ),
        ),
      if (message.isNotEmpty) Text(message),
    ],
  );
}
