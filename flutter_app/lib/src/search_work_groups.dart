import 'models.dart';
import 'unified_media.dart';

/// Poster grouping is presentation only: no source indexes, identities or clocks
/// are merged. Every original reference remains available in the details page.
class SearchWorkGroup {
  SearchWorkGroup(this.title, this.members, {this.key = ''});
  final String key;
  final String title;
  final List<CatalogItem> members;
  CatalogItem get representative => members.first;
  List<CatalogItem> get providerChoices {
    final chosen = <String, CatalogItem>{};
    for (final item in members) {
      final key = '${item.source}:${item.edition}';
      final previous = chosen[key];
      if (previous == null ||
          ((item.episode ?? 0) > 0 &&
              (previous.episode ?? 0) > (item.episode ?? 0))) {
        chosen[key] = item;
      }
    }
    return List.unmodifiable(chosen.values);
  }
}

List<SearchWorkGroup> groupSearchWorks(
  Iterable<CatalogItem> items, {
  bool enabled = true,
}) {
  if (!enabled) {
    return [
      for (final item in items) SearchWorkGroup(item.title, [item]),
    ];
  }
  final groups = <String, SearchWorkGroup>{};
  final seen = <String>{};
  for (final item in items) {
    if (!seen.add('${item.source}:${item.ref}')) continue;
    final kind = MediaTaxonomy.classify(item);
    var title = MediaTaxonomy.normalizeTitle(item.title);
    if (['series', 'anime', 'program'].contains(kind)) {
      title = title
          .replaceFirst(
            RegExp(
              r'\s+(?:(?:الحلقة|الحلقه|حلقة|حلقه|الموسم|موسم)\s+(?:\d+|الاول|الثاني|الثالث|الرابع|الخامس)(?:\s|$)|(?:season|episode|ep)\s*\d+(?:\s|$)|s\d+\s*e\d+(?:\s|$)).*$',
              caseSensitive: false,
            ),
            '',
          )
          .trim();
    }
    if (title.isEmpty) title = MediaTaxonomy.normalizeTitle(item.title);
    final dubbed =
        item.edition.contains('dub') ||
        RegExp(r'مدبلج|dubbed', caseSensitive: false).hasMatch(item.title);
    final identity = item.workIdentityVerified && item.imdbId.isNotEmpty
        ? item.imdbId
        : title;
    // Explicit release-year conflicts and dubbed provider editions stay apart.
    final key =
        '$kind:$identity:${item.year ?? 'unknown'}:${item.audioLanguage}:${dubbed ? '${item.source}:dubbed' : item.edition}';
    final group = groups[key];
    if (group == null) {
      // Keep the original spelling on the cover, removing only the observed suffix.
      final cut = ['series', 'anime', 'program'].contains(kind)
          ? item.title
                .replaceFirst(
                  RegExp(
                    r'\s+(?:(?:الحلقة|الحلقه|حلقة|حلقه|الموسم|موسم|season|episode|ep)\s+(?:[0-9٠-٩]+|الأول|الاول|الثاني|الثالث|الرابع|الخامس)(?:\s|$)|S\d+E\d+(?:\s|$)).*$',
                    caseSensitive: false,
                  ),
                  '',
                )
                .trim()
          : item.title;
      groups[key] = SearchWorkGroup(cut.isEmpty ? item.title : cut, [
        item,
      ], key: key);
    } else {
      group.members.add(item);
    }
  }
  return List.unmodifiable(groups.values);
}
