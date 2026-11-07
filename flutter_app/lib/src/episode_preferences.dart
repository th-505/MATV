import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_preferences.dart';

class EpisodePreferencesTile extends StatelessWidget {
  const EpisodePreferencesTile({super.key});
  Future<void> _edit(BuildContext context) async {
    final input = TextEditingController(
      text: '${NajdPreferences.instance.episodeGroupSize}',
    );
    String? error;
    final selected = await showDialog<int>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('عدد الحلقات في المجموعة'),
          content: TextField(
            key: const Key('episode-group-size-input'),
            controller: input,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: 'عدد الحلقات',
              helperText: 'من 1 إلى 500 حلقة. مثلًا: 12 أو 24 أو 48.',
              errorText: error,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () {
                final value = int.tryParse(input.text);
                if (value == null || value < 1 || value > 500) {
                  setState(() => error = 'أدخل عددًا بين 1 و500');
                  return;
                }
                Navigator.pop(context, value);
              },
              child: const Text('حفظ'),
            ),
          ],
        ),
      ),
    );
    // The dialog's reverse animation can still hold the field for one frame.
    await Future<void>.delayed(const Duration(milliseconds: 350));
    input.dispose();
    if (selected != null) {
      await NajdPreferences.instance.setEpisodeGroupSize(selected);
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: NajdPreferences.instance,
    builder: (context, _) => ListTile(
      key: const Key('setting-episode-group-size'),
      leading: const Icon(Icons.view_module_outlined),
      title: const Text('عدد الحلقات في المجموعة'),
      subtitle: Text(
        '${NajdPreferences.instance.episodeGroupSize} حلقة • يطبق على كل المصادر والمشغل',
      ),
      onTap: () => _edit(context),
    ),
  );
}
