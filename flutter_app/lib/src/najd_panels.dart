import 'package:flutter/material.dart';

import 'app_target.dart';
import 'stitch_design.dart';

class NajdOption<T extends Object> {
  const NajdOption(
    this.value,
    this.label, {
    this.subtitle,
    this.icon = Icons.radio_button_unchecked,
    this.selected = false,
    this.enabled = true,
    this.key,
  });
  final Key? key;
  final T value;
  final String label;
  final String? subtitle;
  final IconData icon;
  final bool selected, enabled;
}

Future<T?> showNajdPanel<T>(
  BuildContext context, {
  required String title,
  String? description,
  required WidgetBuilder body,
  IconData icon = Icons.tune,
}) {
  final wide = MediaQuery.sizeOf(context).width >= 700 || isTvTarget;
  Widget panel(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!wide)
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.outline.withAlpha(100),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  tooltip: 'إغلاق',
                  onPressed: () => Navigator.pop(context),
                  icon: Icon(
                    Icons.close,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            if (description != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  description,
                  style: TextStyle(
                    height: 1.6,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            Flexible(child: SingleChildScrollView(child: body(context))),
          ],
        ),
      ),
    ),
  );
  if (wide) {
    return showDialog<T>(
      context: context,
      builder: (context) => Dialog(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 680,
            maxHeight: MediaQuery.sizeOf(context).height * .88,
          ),
          child: panel(context),
        ),
      ),
    );
  }
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .9,
      ),
      child: panel(context),
    ),
  );
}

Future<T?> showNajdOptions<T extends Object>(
  BuildContext context, {
  required String title,
  String? description,
  required List<NajdOption<T>> options,
  IconData icon = Icons.tune,
  Widget? empty,
}) => showNajdPanel<T>(
  context,
  title: title,
  description: description,
  icon: icon,
  body: (context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (options.isEmpty) empty ?? const Text('لا توجد خيارات متاحة حالياً'),
      for (var i = 0; i < options.length; i++)
        _OptionTile(
          option: options[i],
          autofocus:
              options[i].selected || i == 0 && !options.any((o) => o.selected),
        ),
    ],
  ),
);

class _OptionTile<T extends Object> extends StatelessWidget {
  const _OptionTile({required this.option, required this.autofocus});
  final NajdOption<T> option;
  final bool autofocus;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Material(
        color: option.selected
            ? NajdDesign.primary.withAlpha(20)
            : colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: option.selected
                ? NajdDesign.primary
                : colors.outline.withAlpha(85),
            width: option.selected ? 1.5 : 1,
          ),
        ),
        child: Semantics(
          selected: option.selected,
          child: ListTile(
            key: option.key,
            enabled: option.enabled,
            autofocus: autofocus,
            minTileHeight: isTvTarget ? 76 : 64,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 6,
            ),
            leading: Icon(option.icon, color: colors.primary),
            title: Text(
              option.label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: option.subtitle == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(
                      option.subtitle!,
                      style: const TextStyle(height: 1.5),
                    ),
                  ),
            trailing: option.selected
                ? Icon(Icons.check_circle, color: colors.primary)
                : Icon(Icons.chevron_left, color: colors.onSurfaceVariant),
            onTap: option.enabled
                ? () => Navigator.pop(context, option.value)
                : null,
          ),
        ),
      ),
    );
  }
}

class NajdChoiceButton<T extends Object> extends StatelessWidget {
  const NajdChoiceButton({
    super.key,
    required this.label,
    required this.icon,
    required this.options,
    required this.onSelected,
    this.focusNode,
    this.onOpened,
    this.onClosed,
    this.description,
    this.overlay = false,
  });
  final bool overlay;
  final String label;
  final IconData icon;
  final List<NajdOption<T>> options;
  final Future<void> Function(T) onSelected;
  final FocusNode? focusNode;
  final VoidCallback? onOpened, onClosed;
  final String? description;
  @override
  Widget build(BuildContext context) => Tooltip(
    message: label,
    child: OutlinedButton.icon(
      focusNode: focusNode,
      style: OutlinedButton.styleFrom(
        foregroundColor: overlay
            ? Colors.white
            : Theme.of(context).colorScheme.onSurface,
        minimumSize: Size(48, isTvTarget ? 64 : 48),
      ),
      icon: Icon(icon, size: 20),
      label: Text(label),
      onPressed: options.isEmpty
          ? null
          : () async {
              onOpened?.call();
              try {
                final value = await showNajdOptions(
                  context,
                  title: label,
                  description: description,
                  icon: icon,
                  options: options,
                );
                if (value != null) await onSelected(value);
              } finally {
                onClosed?.call();
              }
            },
    ),
  );
}
