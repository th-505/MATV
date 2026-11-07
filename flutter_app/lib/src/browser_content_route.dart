import 'models.dart';

bool _metadataRef(String value) =>
    value.length <= 8192 &&
    RegExp(r'^[a-zA-Z0-9_-]{2,32}:.+').hasMatch(value) &&
    !RegExp(
      r'^(?:https?|file|direct|url):',
      caseSensitive: false,
    ).hasMatch(value) &&
    !value.contains(RegExp(r'[\x00-\x20\x7f]'));

Map<String, String> browserContentIdentity(
  CatalogItem item, {
  String sourceRef = '',
  String episodeId = '',
  int? episodeNumber,
  String providerCatalogRef = '',
}) => {
  'ref': item.ref,
  'id': item.id.substring(0, item.id.length.clamp(0, 512)),
  'title': item.title.substring(0, item.title.length.clamp(0, 512)),
  'type': item.type,
  if (item.year != null) 'year': '${item.year}',
  if (item.season != null) 'season': '${item.season}',
  if (item.episode != null) 'episode': '${item.episode}',
  if (item.discoveryScope == 'beta') 'scope': 'beta',
  if (_metadataRef(sourceRef)) 'source': sourceRef,
  if (episodeId.isNotEmpty && episodeId.length <= 512) 'episode_id': episodeId,
  if (episodeNumber != null) 'number': '$episodeNumber',
  if (_metadataRef(providerCatalogRef)) 'catalog': providerCatalogRef,
  if (item.discoveryScope == 'beta' && item.sourceRefs.values.any(_metadataRef))
    'origin': item.sourceRefs.values.firstWhere(_metadataRef),
};

class BrowserContentRoute {
  const BrowserContentRoute(
    this.page,
    this.item,
    this.sourceRef,
    this.episodeId,
    this.episodeNumber,
    this.providerCatalogRef,
  );
  final String page, sourceRef, episodeId, providerCatalogRef;
  final CatalogItem item;
  final int? episodeNumber;
  static BrowserContentRoute? parse(Uri uri) {
    if (!['/title', '/player'].contains(uri.path) ||
        uri.toString().length > 24000) {
      return null;
    }
    final q = uri.queryParameters;
    final ref = q['ref'] ?? '';
    if (!_metadataRef(ref)) return null;
    int? number(String name, int max) {
      final n = int.tryParse(q[name] ?? '');
      return n != null && n > 0 && n <= max ? n : null;
    }

    String bounded(String name, int max, [String fallback = '']) {
      final value = q[name] ?? fallback;
      return value.length <= max && !value.contains(RegExp(r'[\r\n]'))
          ? value
          : fallback;
    }

    String reference(String name) =>
        _metadataRef(q[name] ?? '') ? q[name]! : '';
    for (final name in ['season', 'episode', 'number']) {
      if (q.containsKey(name) &&
          number(name, name == 'season' ? 1000 : 100000) == null) {
        return null;
      }
    }
    for (final name in ['source', 'catalog', 'origin']) {
      if ((q[name] ?? '').isNotEmpty && reference(name).isEmpty) return null;
    }
    final origin = q['scope'] == 'beta' ? reference('origin') : '';
    final originParts = origin.split(':');
    final originProvider =
        originParts.first == 'source' && originParts.length > 1
        ? originParts[1]
        : originParts.first;
    return BrowserContentRoute(
      uri.path.substring(1),
      CatalogItem(
        id: bounded('id', 512, ref),
        ref: ref,
        title: bounded('title', 512, 'التفاصيل'),
        poster: '',
        type: ['movie', 'series', 'anime', 'turkish', 'tv'].contains(q['type'])
            ? q['type']!
            : 'series',
        year: number('year', 2200),
        season: number('season', 1000),
        episode: number('episode', 100000),
        discoveryScope: q['scope'] == 'beta' ? 'beta' : 'najd',
        sourceRefs: origin.isEmpty ? const {} : {originProvider: origin},
      ),
      reference('source'),
      bounded('episode_id', 512),
      number('number', 100000),
      reference('catalog'),
    );
  }
}

bool sameBrowserContent(Uri a, Uri b) {
  final left = BrowserContentRoute.parse(a),
      right = BrowserContentRoute.parse(b);
  if (left == null || right == null) return false;
  return left.page == right.page &&
      left.item.ref == right.item.ref &&
      left.item.discoveryScope == right.item.discoveryScope &&
      left.item.season == right.item.season &&
      left.item.episode == right.item.episode &&
      left.sourceRef == right.sourceRef &&
      left.episodeId == right.episodeId &&
      left.episodeNumber == right.episodeNumber &&
      left.providerCatalogRef == right.providerCatalogRef &&
      left.item.sourceRefs.values.firstOrNull ==
          right.item.sourceRefs.values.firstOrNull;
}
