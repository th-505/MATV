import 'package:flutter/material.dart';

import 'app_target.dart';
import 'models.dart';

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
    icon: const Icon(Icons.high_quality),
    onPressed: () async {
      onOpened?.call();
      final value = await showGeneralDialog<int>(
        context: context,
        barrierDismissible: true,
        barrierLabel: 'إغلاق السيرفرات',
        barrierColor: Colors.black26,
        transitionDuration: const Duration(milliseconds: 180),
        pageBuilder: (context, _, _) => Align(
          alignment: Alignment.centerRight,
          child: SafeArea(
            child: SizedBox(
              width: (MediaQuery.sizeOf(context).width * .76).clamp(220, 420),
              child: Material(
                color: const Color(0xED14131F),
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(20),
                ),
                child: Column(
                  children: [
                    ListTile(
                      title: const Text(
                        'السيرفرات المتاحة',
                        style: TextStyle(color: Colors.white),
                      ),
                      trailing: IconButton(
                        tooltip: 'إغلاق',
                        color: Colors.white,
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                    Expanded(
                      child: ListView.builder(
                        itemCount: sources.length,
                        itemBuilder: (context, index) => ListTile(
                          minTileHeight: isTvTarget ? 72 : 56,
                          autofocus: index == selected,
                          selected: index == selected,
                          selectedTileColor: const Color(0x338280FF),
                          textColor: Colors.white,
                          selectedColor: const Color(0xFFB4B2FF),
                          leading: Icon(
                            index == selected
                                ? Icons.check_circle
                                : Icons.play_circle_outline,
                            color: const Color(0xFFB4B2FF),
                          ),
                          title: Text(sources[index].displayLabel),
                          onTap: () => Navigator.pop(context, index),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      if (value != null) await onSelected(value);
      onClosed?.call();
    },
  );
}
