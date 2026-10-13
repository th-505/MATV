import 'package:mitv/src/media_repository.dart';
import 'package:mitv/src/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('source priority, latency, failures and stable deduplication', () {
    final router = SourceRouter();
    const a = StreamSource(
        mediaPath: 'a', mediaType: 'mp4', priority: 0, latencyMs: 900);
    const b = StreamSource(
        mediaPath: 'b', mediaType: 'mp4', priority: 0, latencyMs: 100);
    const c = StreamSource(
        mediaPath: 'c', mediaType: 'mp4', priority: 1, latencyMs: 10);
    expect(router.rank([a, b, b, c]).map((s) => s.mediaPath), ['b', 'a', 'c']);
    router.record('b', success: false);
    expect(router.rank([a, b, c]).first.mediaPath, 'a');
    router.record('b', success: true, latencyMs: 50);
    expect(router.rank([a, b, c]).first.mediaPath, 'b');
    expect(router.rank([a]).map((s) => s.mediaPath), ['a']);
  });
  test('uniform sources retain Origin and parsed resolution', () {
    final source = StreamSource.fromJson({
      'media_path': 'video',
      'media_type': 'mp4',
      'label': '1080p',
      'headers': {
        'Origin': 'https://fa.alooytv16.xyz',
        'Referer': 'bad\r\nvalue'
      }
    });
    expect(source.headers['Origin'], 'https://fa.alooytv16.xyz');
    expect(source.headers.containsKey('Referer'), false);
    expect(source.resolution?.height, 1080);
  });
}
