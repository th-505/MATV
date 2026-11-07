import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/browser_content_route.dart';
import 'package:mitv/src/models.dart';

void main() {
  test('work identity and exact episode survive a reload without media credentials', () {
    const item = CatalogItem(
      id: 'show',
      ref: 'tmdb:tv:123',
      title: 'نجد',
      poster: 'https://images.example/poster',
      type: 'series',
      season: 2,
      episode: 1,
      discoveryScope: 'beta',
      sourceRefs: {'ahwak': 'ahwak:work'},
    );
    final identity = browserContentIdentity(
      item,
      sourceRef: 'ahwak:episode',
      episodeId: 's2e1',
      episodeNumber: 1,
      providerCatalogRef: 'source:ahwak:work',
    );
    final restored = BrowserContentRoute.parse(
      Uri(path: '/player', queryParameters: identity),
    )!;
    expect(restored.item.ref, item.ref);
    expect(restored.item.season, 2);
    expect(restored.episodeNumber, 1);
    expect(restored.sourceRef, 'ahwak:episode');
    expect(restored.item.discoveryScope, 'beta');
    expect(restored.item.sourceRefs['ahwak'], 'ahwak:work');
    expect(restored.item.poster, isEmpty);
    expect(identity.keys, isNot(contains('media_path')));
    expect(identity.keys, isNot(contains('headers')));
    expect(identity.keys, isNot(contains('position')));
  });
  test('untrusted direct media and local file references are rejected', () {
    for (final ref in [
      'https://example.org/video?token=secret',
      'direct:secret',
      'file:/private/video',
      'no-prefix',
      'tmdb:tv:1\nsecret',
    ]) {
      expect(
        BrowserContentRoute.parse(
          Uri(path: '/player', queryParameters: {'ref': ref}),
        ),
        isNull,
      );
    }
    expect(
      BrowserContentRoute.parse(
        Uri(path: '/player', queryParameters: {'ref': "a:${'x' * 25000}"}),
      ),
      isNull,
    );
  });
  test('minimal and generated work URLs do not create a back-button canonicalization loop', () {
    final minimal = Uri(
      path: '/title',
      queryParameters: {'ref': 'tmdb:movie:1', 'type': 'movie'},
    );
    final item = BrowserContentRoute.parse(minimal)!.item;
    expect(
      sameBrowserContent(
        minimal,
        Uri(path: '/title', queryParameters: browserContentIdentity(item)),
      ),
      isTrue,
    );
    final first = Uri(
      path: '/player',
      queryParameters: {'ref': 'tmdb:tv:1', 'season': '2', 'number': '1'},
    );
    final second = Uri(
      path: '/player',
      queryParameters: {'ref': 'tmdb:tv:1', 'season': '2', 'number': '2'},
    );
    expect(sameBrowserContent(first, second), isFalse);
    expect(
      BrowserContentRoute.parse(
        Uri(
          path: '/player',
          queryParameters: {'ref': 'tmdb:tv:1', 'number': '0'},
        ),
      ),
      isNull,
    );
    expect(
      BrowserContentRoute.parse(
        Uri(
          path: '/player',
          queryParameters: {
            'ref': 'tmdb:tv:1',
            'source': 'https://example.org/video.mp4',
          },
        ),
      ),
      isNull,
    );
  });
}
