import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'app_target.dart';
import 'app_preferences.dart';
import 'models.dart';

/// Present only observed episodes. A page is 24 records, never a guessed range.
class EpisodeBrowser extends StatefulWidget {
  const EpisodeBrowser({
    super.key,
    required this.episodes,
    required this.groupKey,
    required this.itemBuilder,
    this.initialEpisodeRef = '',
    this.showSeasons = false,
  });
  final List<EpisodeItem> episodes;
  final Object groupKey;
  final String initialEpisodeRef;
  final bool showSeasons;
  final Widget Function(BuildContext, EpisodeItem, bool) itemBuilder;
  @override
  State<EpisodeBrowser> createState() => _EpisodeBrowserState();
}

class _EpisodeBrowserState extends State<EpisodeBrowser> {
  int get pageSize => NajdPreferences.instance.episodeGroupSize;
  late int _lastGroupSize;
  void _preferencesChanged() {
    if (_lastGroupSize == pageSize) return;
    _lastGroupSize = pageSize;
    if (mounted) setState(() => _page = 0);
  }

  @override
  void dispose() {
    NajdPreferences.instance.removeListener(_preferencesChanged);
    super.dispose();
  }

  int _page = 0;
  int? _season;
  bool _descending = false;
  bool _grid = false;

  @override
  void initState() {
    super.initState();
    _lastGroupSize = pageSize;
    NajdPreferences.instance.addListener(_preferencesChanged);
    for (final ep in widget.episodes) {
      if (ep.ref == widget.initialEpisodeRef) {
        _season = ep.season ?? 1;
        break;
      }
    }
    final local =
        widget.episodes
            .where((ep) => !widget.showSeasons || (ep.season ?? 1) == _season)
            .toList()
          ..sort((a, b) => a.number.compareTo(b.number));
    final index = local.indexWhere((ep) => ep.ref == widget.initialEpisodeRef);
    if (index >= 0) _page = index ~/ pageSize;
  }

  @override
  void didUpdateWidget(covariant EpisodeBrowser oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.groupKey != widget.groupKey) {
      _page = 0;
      _season = null;
    }
  }

  String _label(EpisodeItem ep) =>
      ep.hasEpisodeNumber ? '${ep.number}' : ep.title;

  @override
  Widget build(BuildContext context) {
    final seasons = widget.episodes.map((e) => e.season ?? 1).toSet().toList()
      ..sort();
    final season = _season != null && seasons.contains(_season)
        ? _season
        : seasons.firstOrNull;
    final indexed = widget.episodes
        .asMap()
        .entries
        .where((e) => !widget.showSeasons || (e.value.season ?? 1) == season)
        .toList();
    indexed.sort((a, b) {
      if (a.value.hasEpisodeNumber != b.value.hasEpisodeNumber) {
        return a.value.hasEpisodeNumber ? -1 : 1;
      }
      final compared = a.value.number.compareTo(b.value.number);
      // Unnumbered specials keep their identity and observed order.
      final result =
          a.value.hasEpisodeNumber && b.value.hasEpisodeNumber && compared != 0
          ? compared
          : a.key.compareTo(b.key);
      return _descending ? -result : result;
    });
    final episodes = indexed.map((e) => e.value).toList();
    if (episodes.isEmpty) return const SizedBox.shrink();
    final count = (episodes.length / pageSize).ceil();
    final page = _page.clamp(0, count - 1);
    final visible = episodes.skip(page * pageSize).take(pageSize).toList();
    String range(int index) {
      final start = index * pageSize;
      final end = math.min(start + pageSize, episodes.length) - 1;
      return 'الحلقات ${_label(episodes[start])} – ${_label(episodes[end])}';
    }

    final targetHeight = isTvTarget ? 72.0 : 48.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (widget.showSeasons && seasons.length > 1)
              SizedBox(
                width: 160,
                child: DropdownButtonFormField<int>(
                  key: ValueKey('episode-browser-season-$season'),
                  initialValue: season,
                  itemHeight: targetHeight,
                  decoration: const InputDecoration(labelText: 'الموسم'),
                  items: [
                    for (final s in seasons)
                      DropdownMenuItem(value: s, child: Text('الموسم $s')),
                  ],
                  onChanged: (value) => setState(() {
                    _season = value;
                    _page = 0;
                  }),
                ),
              ),
            SizedBox(
              width: 232,
              child: DropdownButtonFormField<int>(
                key: ValueKey(
                  'episode-browser-range-$page-${episodes.length}-$_descending',
                ),
                initialValue: page,
                itemHeight: targetHeight,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'نطاق الحلقات'),
                items: [
                  for (var i = 0; i < count; i++)
                    DropdownMenuItem(
                      value: i,
                      child: Text(
                        range(i),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (value) => setState(() => _page = value ?? 0),
              ),
            ),
            IconButton.filledTonal(
              key: const Key('episode-browser-sort'),
              tooltip: _descending ? 'الأقدم أولًا' : 'الأحدث أولًا',
              constraints: BoxConstraints(
                minWidth: targetHeight,
                minHeight: targetHeight,
              ),
              onPressed: () => setState(() {
                _descending = !_descending;
                _page = 0;
              }),
              icon: Icon(_descending ? Icons.south : Icons.north),
            ),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: false,
                  icon: Icon(Icons.view_list),
                  tooltip: 'عرض أفقي',
                ),
                ButtonSegment(
                  value: true,
                  icon: Icon(Icons.grid_view),
                  tooltip: 'عرض مربعات',
                ),
              ],
              selected: {_grid},
              onSelectionChanged: (value) =>
                  setState(() => _grid = value.single),
              style: ButtonStyle(
                minimumSize: WidgetStatePropertyAll(
                  Size(targetHeight, targetHeight),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_grid)
          LayoutBuilder(
            builder: (context, box) {
              final columns = (box.maxWidth / (isTvTarget ? 150 : 84))
                  .floor()
                  .clamp(2, 8);
              final width = (box.maxWidth - (columns - 1) * 8) / columns;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final ep in visible)
                    SizedBox(
                      width: width,
                      child: widget.itemBuilder(context, ep, true),
                    ),
                ],
              );
            },
          )
        else
          for (final ep in visible) widget.itemBuilder(context, ep, false),
        if (count > 1)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                IconButton(
                  key: const Key('episode-browser-previous'),
                  tooltip: 'المجموعة السابقة',
                  constraints: BoxConstraints(
                    minWidth: targetHeight,
                    minHeight: targetHeight,
                  ),
                  onPressed: page > 0
                      ? () => setState(() => _page = page - 1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
                Expanded(child: Text(range(page), textAlign: TextAlign.center)),
                IconButton(
                  key: const Key('episode-browser-next'),
                  tooltip: 'المجموعة التالية',
                  constraints: BoxConstraints(
                    minWidth: targetHeight,
                    minHeight: targetHeight,
                  ),
                  onPressed: page + 1 < count
                      ? () => setState(() => _page = page + 1)
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
