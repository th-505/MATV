import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';
import 'package:mitv/src/source_picker.dart';

EpisodeItem ep(int number, {int season = 1, String? ref, bool known = true}) =>
    EpisodeItem(
      id: '$season:$number',
      number: number,
      title: 'Episode $number',
      ref: ref ?? '$season:$number',
      watchAvailable: true,
      season: season,
      hasEpisodeNumber: known,
    );
void main() {
  test('next episode uses actual season/number and skips alternate copies', () {
    final queue = [
      ep(1216, ref: 'alternate'),
      ep(1217),
      ep(1216),
      ep(1, season: 2),
      ep(1218, known: false),
    ];
    expect(nextObservedEpisode(queue, number: 1216, season: 1)?.number, 1217);
    expect(nextObservedEpisode(queue, number: 1217, season: 1)?.season, 2);
    expect(nextObservedEpisode(queue, number: null, season: 1), isNull);
    expect(
      nextObservedEpisode([ep(1218, known: false)], number: 1217, season: 1),
      isNull,
    );
  });
  testWidgets(
    'source panel occupies only part of the screen and selects an actual source',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      int? selected;
      final sources = [
        const PlaybackSource(
          mediaPath: 'https://cdn.example/a.mp4',
          mediaType: 'mp4',
          provider: 'الأول',
        ),
        const PlaybackSource(
          mediaPath: 'https://cdn.example/b.m3u8',
          mediaType: 'm3u8',
          provider: 'الثاني',
        ),
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SourcePickerButton(
              sources: sources,
              selected: 0,
              onSelected: (value) async => selected = value,
            ),
          ),
        ),
      );
      await tester.tap(find.byIcon(Icons.high_quality));
      await tester.pumpAndSettle();
      final panel = tester.getRect(
        find
            .ancestor(
              of: find.text('السيرفرات المتاحة'),
              matching: find.byType(Material),
            )
            .first,
      );
      expect(panel.width, lessThan(390));
      expect(panel.right, closeTo(390, 1));
      expect(find.text(sources[1].displayLabel), findsOneWidget);
      await tester.tap(find.text(sources[1].displayLabel));
      await tester.pumpAndSettle();
      expect(selected, 1);
      expect(find.text('السيرفرات المتاحة'), findsNothing);
    },
  );
}
