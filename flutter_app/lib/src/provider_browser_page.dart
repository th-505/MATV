import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'source_editions_panel.dart' show sourceHarvestMessage;

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'details_page.dart';
import 'player_page.dart';
import 'library_store.dart';
import 'models.dart';
import 'najd_panels.dart';
import 'stitch_design.dart';

/// A selected site's catalogue, isolated from global discovery preferences.
class ProviderBrowserPage extends StatefulWidget {
  const ProviderBrowserPage({
    super.key,
    required this.api,
    required this.store,
    this.liveOnly = false,
  });
  final MitvApi api;
  final LocalLibraryStore store;
  final bool liveOnly;
  @override
  State<ProviderBrowserPage> createState() => _ProviderBrowserPageState();
}

class _ProviderBrowserPageState extends State<ProviderBrowserPage> {
  final _query = TextEditingController();
  late final MitvApi _browserApi;
  List<Map<String, dynamic>> _sources = [];
  List<CatalogItem> _items = [];
  String? _provider, _error;
  String _category = '';
  bool _loading = true, _hasMore = false;
  int _page = 1, _generation = 0;

  @override
  void initState() {
    super.initState();
    _browserApi = widget.api.browserSession();
    _loadSources();
  }

  @override
  void dispose() {
    ++_generation;
    _query.dispose();
    _browserApi.close();
    super.dispose();
  }

  Future<void> _loadSources() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final sources = (await _browserApi.browserSources())
          .where(
            (s) => widget.liveOnly
                ? s['content_type'] == 'live'
                : s['content_type'] != 'live',
          )
          .toList();
      final prefs = await SharedPreferences.getInstance();
      Map saved = const {};
      try {
        final value = jsonDecode(
          prefs.getString(
                widget.liveOnly
                    ? 'provider.browser.live-selection.v1'
                    : 'provider.browser.selection.v1',
              ) ??
              '{}',
        );
        if (value is Map) saved = value;
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _sources = sources;
        if (_provider == null) {
          final savedId = saved['provider'];
          if (sources.any((s) => s['id'] == savedId)) {
            _provider = savedId as String;
            _category = '${saved['category'] ?? ''}';
          }
        } else if (!sources.any((s) => s['id'] == _provider)) {
          _provider = null;
        }
        if (!_categories.any((c) => c['id'] == _category)) _category = '';
      });
      if (_provider == null) {
        setState(() {
          _loading = false;
          _error = sources.isEmpty ? 'لا يتوفر فهرس مزود حالياً' : null;
        });
        return;
      }
      await _load();
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'تعذر تحميل قائمة المزودين';
        });
      }
    }
  }

  List<Map> get _categories =>
      (_sources.where((s) => s['id'] == _provider).firstOrNull?['categories']
                  as List? ??
              [])
          .whereType<Map>()
          .toList();

  Future<void> _rememberProvider() async {
    final value = jsonEncode({'provider': _provider, 'category': _category});
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        widget.liveOnly
            ? 'provider.browser.live-selection.v1'
            : 'provider.browser.selection.v1',
        value,
      );
    } catch (_) {}
  }

  Future<void> _load({bool more = false}) async {
    final provider = _provider;
    if (provider == null) return;
    final request = ++_generation;
    final page = more ? _page + 1 : 1;
    setState(() {
      _loading = true;
      _error = null;
      if (!more) _items = [];
    });
    try {
      final query = _query.text.trim();
      final result = query.isNotEmpty
          ? (items: await _browserApi.explore(query, provider), hasMore: false)
          : await _browserApi.browserCatalog(provider, _category, page);
      if (!mounted || request != _generation) return;
      setState(() {
        final previousCount = _items.length;
        final seen = <String>{};
        _items = [
          if (more) ..._items,
          ...result.items,
        ].where((i) => seen.add(i.ref)).toList();
        _page = page;
        _hasMore = result.hasMore && (!more || _items.length > previousCount);
        _loading = false;
      });
    } catch (error) {
      if (mounted && request == _generation) {
        setState(() {
          _loading = false;
          _error = error is ApiException ? sourceHarvestMessage(error.code) : 'تعذر جلب فهرس هذا المزود. يمكنك إعادة المحاولة أو اختيار مزود آخر.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('تصفح المزود — تجريبي'),
      actions: [
        IconButton(
          tooltip: 'تحديث قائمة المزودين',
          onPressed: _loading ? null : _loadSources,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              NajdChoiceButton<String>(
                label:
                    _sources
                            .where((s) => s['id'] == _provider)
                            .firstOrNull?['name']
                        as String? ??
                    'اختر المزود',
                icon: Icons.travel_explore,
                options: [
                  for (final source in _sources)
                    NajdOption(
                      source['id'] as String,
                      source['name'] as String,
                      selected: source['id'] == _provider,
                    ),
                ],
                onSelected: (value) async {
                  setState(() {
                    ++_generation;
                    _items = [];
                    _hasMore = false;
                    _loading = true;
                    _provider = value;
                    _category = '';
                    _query.clear();
                  });
                  await _rememberProvider();
                  await _load();
                },
              ),
              TextField(
                controller: _query,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'بحث داخل المزود المختار',
                  prefixIcon: Icon(Icons.search),
                ),
                onSubmitted: (_) => _load(),
              ),
              if (_categories.isNotEmpty)
                SizedBox(
                  height: 56,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final category in _categories)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: ChoiceChip(
                            label: Text('${category['label']}'),
                            selected: category['id'] == _category,
                            onSelected: (_) {
                              setState(() {
                                ++_generation;
                                _items = [];
                                _hasMore = false;
                                _category = '${category['id']}';
                                _query.clear();
                              });
                              _rememberProvider();
                              _load();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if (_loading) const LinearProgressIndicator(),
        Expanded(
          child: _error != null
              ? NajdEmptyState(
                  kind: NajdEmptyKind.failure,
                  message: _error,
                  onRetry: () {
                    if (_sources.isEmpty) {
                      _loadSources();
                    } else {
                      _load();
                    }
                  },
                )
              : _provider == null && !_loading
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'اختر المزود لتصفح أقسامه وأعماله',
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              : _items.isEmpty && !_loading
              ? NajdEmptyState(
                  kind: NajdEmptyKind.search,
                  onRetry: () {
                    _query.clear();
                    _load();
                  },
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 220,
                    mainAxisExtent: 340,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: _items.length,
                  itemBuilder: (context, index) => NajdWorkCard(
                    item: _items[index],
                    onTap: () {
                      final item = _items[index];
                      if (item.type == 'live') {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PlayerPage(
                              api: _browserApi.browserSession(origin: item),
                              store: widget.store,
                              item: item,
                              title: item.title,
                              sourceRef: item.ref,
                              isLive: true,
                            ),
                          ),
                        );
                        return;
                      }
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => DetailsPage(
                            api: _browserApi,
                            store: widget.store,
                            item: _items[index],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
        if (_hasMore && !_loading)
          TextButton.icon(
            onPressed: () => _load(more: true),
            icon: const Icon(Icons.expand_more),
            label: const Text('المزيد من الأعمال'),
          ),
      ],
    ),
  );
}
