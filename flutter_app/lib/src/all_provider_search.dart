import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'models.dart';
import 'search_work_groups.dart';

/// Broad search preserves the current family but never pins the current origin.
class AllProviderSearchPanel extends StatefulWidget {
  const AllProviderSearchPanel({
    super.key,
    required this.api,
    required this.query,
    required this.onOpen,
  });
  final MitvApi api;
  final String query;
  final ValueChanged<CatalogItem> onOpen;
  @override
  State<AllProviderSearchPanel> createState() => _AllProviderSearchPanelState();
}

class _AllProviderSearchPanelState extends State<AllProviderSearchPanel> {
  late final TextEditingController _query;
  List<CatalogItem> _rows = [];
  bool _busy = false;
  String? _error;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    _query = TextEditingController(text: widget.query);
    unawaited(_search());
  }

  @override
  void dispose() {
    _generation++;
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    if (_busy) return;
    final q = _query.text.trim();
    if (q.length < 2 || q.length > 120) {
      setState(() => _error = 'أدخل اسم العمل بين حرفين و120 حرفًا');
      return;
    }
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = null;
      _rows = [];
    });
    try {
      await widget.api.exploreParallel(
        q,
        isCurrent: () => mounted && generation == _generation,
        onResults: (rows) {
          if (mounted && generation == _generation) {
            setState(() => _rows = rows);
          }
        },
      );
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(
          () => _error = 'لم يكتمل البحث في بعض المصادر. يمكنك إعادة المحاولة.',
        );
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextField(
        controller: _query,
        decoration: InputDecoration(
          labelText: 'البحث في جميع المصادر',
          suffixIcon: IconButton(
            tooltip: 'بحث',
            onPressed: _busy ? null : _search,
            icon: const Icon(Icons.search),
          ),
        ),
        onSubmitted: (_) => _search(),
      ),
      if (_busy) const LinearProgressIndicator(),
      if (_error != null) Text(_error!),
      if (!_busy && _rows.isEmpty && _error == null)
        const Padding(
          padding: EdgeInsets.all(12),
          child: Text('لم تصل نتائج مؤكدة لهذا البحث.'),
        ),
      for (final group in groupSearchWorks(_rows))
        for (final item in group.providerChoices)
          ListTile(
            key: ValueKey('all-provider-${item.source}-${item.ref}'),
            leading: const Icon(Icons.video_library_outlined),
            title: Text(item.title),
            subtitle: Text(widget.api.explorationSourceLabel(item.source)),
            trailing: const Icon(Icons.chevron_left),
            onTap: () => widget.onOpen(item),
          ),
    ],
  );
}
