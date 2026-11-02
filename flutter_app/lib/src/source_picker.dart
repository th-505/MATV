import 'package:flutter/material.dart';

import 'app_target.dart';
import 'models.dart';
import 'stitch_design.dart';

class SourcePickerButton extends StatelessWidget {
  const SourcePickerButton({
    super.key,
    required this.sources,
    required this.selected,
    required this.onSelected,
    this.onOpened,
    this.onClosed,
  });
  final List<PlaybackSource> sources;
  final int selected;
  final Future<void> Function(int) onSelected;
  final VoidCallback? onOpened, onClosed;
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'السيرفر / الجودة',
    icon: const Icon(Icons.dns_outlined),
    onPressed: () async {
      onOpened?.call();
      try {
        final value = await showDialog<int>(
          context: context,
          builder: (context) => Dialog(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720, maxHeight: 600),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.dns_outlined),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'مصادر التشغيل',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'إغلاق',
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text('اختر المصدر المتاح لمتابعة المشاهدة'),
                    ),
                    const SizedBox(height: 14),
                    Flexible(
                      child: sources.isEmpty
                          ? const NajdEmptyState(kind: NajdEmptyKind.source)
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: sources.length,
                              itemBuilder: (context, index) => NajdSurface(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      minTileHeight: isTvTarget ? 72 : 56,
                                      autofocus: index == selected,
                                      onTap: index == selected
                                          ? null
                                          : () => Navigator.pop(context, index),
                                      leading: Icon(
                                        index == selected
                                            ? Icons.play_circle
                                            : Icons.dns_outlined,
                                        color: NajdDesign.primary,
                                      ),
                                      title: Text(sources[index].displayLabel),
                                      subtitle: Text(
                                        index == selected
                                            ? 'قيد التشغيل'
                                            : 'مصدر متاح',
                                      ),
                                      trailing: index == selected
                                          ? const Icon(
                                              Icons.check_circle,
                                              color: NajdDesign.primary,
                                            )
                                          : null,
                                    ),
                                    if (index != selected)
                                      FilledButton.icon(
                                        onPressed: () =>
                                            Navigator.pop(context, index),
                                        icon: const Icon(Icons.swap_horiz),
                                        label: const Text('اختيار المصدر'),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        if (value != null) await onSelected(value);
      } finally {
        onClosed?.call();
      }
    },
  );
}
