import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/models.dart';

class _Sources extends MitvApi {
  final requests = <String>[];
  final pending = <String, Completer<List<CatalogItem>>>{};
  @override
  Future<List<String>> explorationSources() async => [
    'first',
    'second',
    'third',
  ];
  @override
  Future<List<CatalogItem>> explore(String query, String provider) {
    requests.add(provider);
    return (pending[provider] = Completer<List<CatalogItem>>()).future;
  }
}

CatalogItem hit(String provider) => CatalogItem(
  id: provider,
  ref: '$provider:opaque',
  title: 'نفس العنوان',
  poster: '',
  type: 'movie',
  source: provider,
);
void main() {
  test('all providers start concurrently and fast results appear before a slow or failed provider', () async {
    final api = _Sources();
    addTearDown(api.close);
    final updates = <List<CatalogItem>>[];
    final result = api.exploreParallel('عمل', onResults: updates.add);
    await Future<void>.delayed(Duration.zero);
    expect(api.requests, ['first', 'second', 'third']);
    api.pending['second']!.complete([hit('second')]);
    await Future<void>.delayed(Duration.zero);
    expect(updates.single.single.source, 'second');
    api.pending['first']!.completeError(StateError('blocked'));
    api.pending['third']!.complete([hit('third')]);
    final items = await result;
    expect(items.map((e) => e.ref), ['second:opaque', 'third:opaque']);
    expect(
      items,
      hasLength(2),
      reason: 'same titles from independent sources must not collapse',
    );
  });
  test(
    'a cancelled query neither launches queued work nor emits stale results',
    () async {
      final api = _Sources();
      addTearDown(api.close);
      var current = true;
      var updates = 0;
      final result = api.exploreParallel(
        'قديم',
        concurrency: 1,
        isCurrent: () => current,
        onResults: (_) => updates++,
      );
      await Future<void>.delayed(Duration.zero);
      expect(api.requests, ['first']);
      current = false;
      api.pending['first']!.complete([hit('first')]);
      expect(await result, isEmpty);
      expect(updates, 0);
      expect(api.requests, ['first']);
    },
  );
  test('all failed sources produce an availability error rather than false no-results', () async {
    final api = _Sources();
    addTearDown(api.close);
    final result = api.exploreParallel('عمل');
    final failure = expectLater(result, throwsA(isA<ApiException>()));
    await Future<void>.delayed(Duration.zero);
    for (final request in api.pending.values) {
      request.completeError(StateError('blocked'));
    }
    await failure;
  });
}
