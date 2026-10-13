import 'models.dart';

/// Screens depend on this catalog/playback contract regardless of provider.
abstract interface class MediaRepository {
  Future<List<MediaItem>> category(String categoryId, {int page = 1});
  Future<List<MediaItem>> search(String query);
  Future<TitleDetails> details(String ref);
  Future<TitleDetails> resolvePlayback(String ref, {bool refresh = false});
  Future<void> prefetchMetadata(String ref);
}

/// Only alternatives returned for the same work enter this router.
class SourceRouter {
  final _health = <String, ({int failures, int? latency})>{};
  List<StreamSource> rank(Iterable<StreamSource> values) {
    final unique = <String, StreamSource>{};
    for (final value in values) {
      unique.putIfAbsent(value.mediaPath, () => value);
    }
    final rows = unique.values.indexed.toList();
    int score(StreamSource source) {
      final state = _health[source.mediaPath];
      return source.priority.clamp(0, 99) * 100000 +
          (state?.failures ?? 0) * 10000000 +
          (state?.latency ?? source.latencyMs ?? 2000).clamp(0, 9999);
    }

    rows.sort((a, b) {
      final order = score(a.$2).compareTo(score(b.$2));
      return order == 0 ? a.$1.compareTo(b.$1) : order;
    });
    return rows.take(8).map((r) => r.$2).toList(growable: false);
  }

  void record(String path, {required bool success, int? latencyMs}) {
    if (_health.length >= 128 && !_health.containsKey(path)) {
      _health.remove(_health.keys.first);
    }
    _health[path] = (
      failures: success ? 0 : (_health[path]?.failures ?? 0) + 1,
      latency: latencyMs ?? _health[path]?.latency
    );
  }
}
