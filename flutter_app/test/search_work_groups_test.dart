import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/search_work_groups.dart';

CatalogItem hit(
  String title,
  String source,
  String ref, {
  int? year = 2024,
  String edition = '',
}) => CatalogItem(
  id: ref,
  ref: ref,
  source: source,
  title: title,
  poster: '',
  type: 'series',
  year: year,
  edition: edition,
);
void main() {
  test(
    'episode results share one poster while retaining every original reference',
    () {
      final first = hit('مسلسل العمل الحلقة 21 مترجمة', 'one', 'one:actual21');
      final second = hit('مسلسل العمل الحلقة 22 مترجمة', 'one', 'one:actual22');
      final third = hit('مسلسل العمل الحلقة 1 مترجمة', 'two', 'two:actual1');
      final result = groupSearchWorks([first, second, third]);
      expect(result, hasLength(1));
      expect(result.single.title, 'مسلسل العمل');
      expect(result.single.members.map((i) => i.ref), [
        'one:actual21',
        'one:actual22',
        'two:actual1',
      ]);
      expect(result.single.providerChoices, hasLength(2));
      expect(identical(result.single.members.first, first), isTrue);
      expect(
        first.sourceRefs,
        isEmpty,
        reason: 'presentation grouping must not rewrite playback identity',
      );
    },
  );
  test(
    'conflicting releases and separate dubbed provider editions stay separate',
    () {
      expect(
        groupSearchWorks([
          hit('مسلسل العمل', 'one', 'one:a'),
          hit('مسلسل العمل', 'two', 'two:b', year: 2020),
        ]),
        hasLength(2),
      );
      expect(
        groupSearchWorks([
          hit('مسلسل العمل مدبلج', 'one', 'one:a'),
          hit('مسلسل العمل مدبلج', 'two', 'two:b'),
        ]),
        hasLength(2),
      );
    },
  );
  test(
    'episode words within a work title and normal TMDB search are preserved',
    () {
      final item = hit('The Episode', 'one', 'one:work');
      expect(groupSearchWorks([item]).single.title, 'The Episode');
      expect(groupSearchWorks([item, item], enabled: false), hasLength(2));
      expect(groupSearchWorks([item, item]), hasLength(1));
    },
  );
}
