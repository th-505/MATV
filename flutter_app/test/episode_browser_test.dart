import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/episode_browser.dart';
import 'package:mitv/src/models.dart';

EpisodeItem episode(int number, {int season = 1}) => EpisodeItem(
  id: 's${season}e$number',
  number: number,
  title: 'الحلقة $number',
  ref: 'source:s${season}e$number',
  watchAvailable: true,
  season: season,
);
Widget app(
  List<EpisodeItem> rows, {
  Object group = 'work',
  String active = '',
  bool seasons = false,
  double scale = 1,
}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(scale)),
    child: Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: SingleChildScrollView(
          child: EpisodeBrowser(
            episodes: rows,
            groupKey: group,
            initialEpisodeRef: active,
            showSeasons: seasons,
            itemBuilder: (context, e, grid) => SizedBox(
              key: ValueKey('item-${e.id}'),
              height: 64,
              child: Text('${grid ? 'grid' : 'row'}:${e.id}'),
            ),
          ),
        ),
      ),
    ),
  ),
);
void main() {
  testWidgets(
    '1080 observed episodes render only 24 and descend from the actual last episode',
    (tester) async {
      final rows = List.generate(1080, (i) => episode(i + 1));
      await tester.pumpWidget(app(rows));
      expect(find.byKey(const ValueKey('item-s1e1')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e24')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e25')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('episode-browser-next')));
      await tester.tap(find.byKey(const Key('episode-browser-next')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('item-s1e25')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e48')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e1')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('episode-browser-sort')));
      await tester.tap(find.byKey(const Key('episode-browser-sort')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('item-s1e1080')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e1057')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e1056')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'grid/list toggles preserve the same observed episode and gaps are never filled',
    (tester) async {
      await tester.pumpWidget(app([episode(1), episode(3), episode(99)]));
      await tester.tap(find.byTooltip('عرض مربعات'));
      await tester.pumpAndSettle();
      expect(find.text('grid:s1e99'), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e2')), findsNothing);
      await tester.tap(find.byTooltip('عرض أفقي'));
      await tester.pumpAndSettle();
      expect(find.text('row:s1e99'), findsOneWidget);
    },
  );
  testWidgets(
    'the active episode opens its group and changing season does not mix indexes',
    (tester) async {
      final rows = [
        ...List.generate(1080, (i) => episode(i + 1)),
        episode(1, season: 2),
        episode(2, season: 2),
      ];
      await tester.pumpWidget(
        app(rows, active: 'source:s1e1080', seasons: true),
      );
      expect(find.byKey(const ValueKey('item-s1e1080')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s2e1')), findsNothing);
      await tester.tap(find.byType(DropdownButton<int>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('الموسم 2').last);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('item-s2e1')), findsOneWidget);
      expect(find.byKey(const ValueKey('item-s1e1080')), findsNothing);
    },
  );
  testWidgets(
    'narrow layouts and enlarged text retain controls without overflow',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        app(List.generate(25, (i) => episode(i + 1)), scale: 1.8),
      );
      await tester.tap(find.byTooltip('عرض مربعات'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
