import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import 'api_client.dart';
import 'app_target.dart';
import 'catalog_collection_defs.dart';
import 'library_store.dart';
import 'models.dart';
import 'stitch_design.dart';

/// Sliver construction starts requests only for shelves near the viewport.
class CatalogCollectionsPage extends StatefulWidget {
  const CatalogCollectionsPage({
    super.key,
    required this.api,
    required this.store,
    required this.group,
    required this.onItem,
    required this.onMore,
  });
  final MitvApi api;
  final LocalLibraryStore store;
  final String group;
  final ValueChanged<CatalogItem> onItem;
  final void Function(String ref, String title) onMore;
  @override
  State<CatalogCollectionsPage> createState() => _CatalogCollectionsPageState();
}

class _CatalogCollectionsPageState extends State<CatalogCollectionsPage> {
  final Map<String, Future<List<CatalogItem>>> _requests = {};
  bool _matches(CatalogItem item) => widget.group == 'movie'
      ? item.type == 'movie'
      : widget.group == 'series'
      ? item.type != 'movie'
      : true;
  @override
  Widget build(BuildContext context) {
    final definitions = najdCatalogCollections
        .where((row) => row['group'] == widget.group)
        .toList();
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) => RefreshIndicator(
        onRefresh: () async {
          setState(_requests.clear);
        },
        child: ListView.builder(
          key: ValueKey('collection-feed-${widget.group}'),
          scrollCacheExtent: const ScrollCacheExtent.pixels(200),
          padding: EdgeInsets.all(isTvTarget ? 28 : 16),
          itemCount: definitions.length + 2,
          itemBuilder: (context, index) {
            if (index < 2) {
              final items = index == 0
                  ? widget.store.continueWatching
                        .map(
                          (entry) =>
                              entry.metadata ??
                              CatalogItem(
                                id: entry.contentId,
                                ref: entry.contentRef,
                                title: entry.title,
                                poster: entry.poster,
                                type: entry.type,
                                season: entry.seasonNumber,
                                episode: entry.episodeNumber,
                              ),
                        )
                        .where(_matches)
                        .toList()
                  : widget.store.favorites.where(_matches).toList();
              return _shelf(index == 0 ? 'متابعة المشاهدة' : 'قائمتي', items);
            }
            final definition = definitions[index - 2], ref = definition['id']!;
            return FutureBuilder<List<CatalogItem>>(
              future: _requests.putIfAbsent(
                ref,
                () => widget.api.category(ref),
              ),
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return SizedBox(
                    height: 260,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(definition['title']!),
                        const LinearProgressIndicator(),
                      ],
                    ),
                  );
                }
                if (snapshot.hasError) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(definition['title']!),
                        TextButton.icon(
                          onPressed: () =>
                              setState(() => _requests.remove(ref)),
                          icon: const Icon(Icons.refresh),
                          label: const Text('تعذر تحميل القائمة؛ أعد المحاولة'),
                        ),
                      ],
                    ),
                  );
                }
                return _shelf(
                  definition['title']!,
                  (snapshot.data ?? []).take(10).toList(),
                  onMore: () => widget.onMore(ref, definition['title']!),
                  ranked: index == 2,
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _shelf(
    String title,
    List<CatalogItem> items, {
    VoidCallback? onMore,
    bool ranked = false,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      NajdSectionHeading(
        title,
        action: onMore == null ? null : 'المزيد',
        onAction: onMore,
      ),
      if (ranked) const Text('الترتيب حسب تقييمات TMDB وعدد الأصوات'),
      if (items.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Text('لا توجد أعمال في هذه القائمة الآن.'),
        ),
      if (items.isNotEmpty)
        SizedBox(
          height: isTvTarget ? 350 : 285,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (_, index) => SizedBox(
              width: isTvTarget ? 210 : 155,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: NajdWorkCard(
                      item: items[index],
                      onTap: () => widget.onItem(items[index]),
                    ),
                  ),
                  if (ranked)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.black87,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(
                            '${index + 1}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      const SizedBox(height: 20),
    ],
  );
}
