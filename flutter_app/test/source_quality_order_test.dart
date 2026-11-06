import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/media_repository.dart';
import 'package:mitv/src/models.dart';

void main() {
  StreamSource source(int height, {int priority = 0}) => StreamSource.fromJson({
    'url': 'https://media.example/$height.mp4',
    'format': 'mp4',
    'quality': '${height}p',
    'label': 'نسخة المصدر',
    'priority': priority,
  });
  test('observed quality takes precedence over a generic display label', () {
    expect(source(1080).resolution?.height, 1080);
  });
  test('equal-health sources prefer higher observed quality, failed sources remain fallback', () {
    final router = SourceRouter();
    final low = source(720), high = source(1080);
    expect(router.rank([low, high]).first.mediaPath, high.mediaPath);
    router.record(high.mediaPath, success: false);
    expect(router.rank([low, high]).first.mediaPath, low.mediaPath);
    expect(router.rank([low, high]).length, 2);
  });
  test('all observed alternatives remain available beyond the former eight-source cutoff', () {
    final ranked = SourceRouter().rank(
      List.generate(20, (i) => source(400 + i)),
    );
    expect(ranked.length, 20);
  });
}
