import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/title_overview_header.dart';
import 'package:mitv/src/models.dart';

void main() {
  test('card metadata remains optional and round trips without changing identity', () {
    final item=MediaItem.fromJson({'id':'original-id','ref':'akwam:original-ref','title':'Work',
      'backdrop':'https://image.tmdb.org/t/p/w1280/backdrop.jpg','runtime_minutes':97,'episode_count':12,'season_number':2,'episode_number':8});
    final roundTrip=MediaItem.fromJson(item.copyWith(title:'Work').toJson());
    expect(roundTrip.id,'original-id');expect(roundTrip.ref,'akwam:original-ref');
    expect(roundTrip.backdrop,'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
    expect(roundTrip.runtimeMinutes,97);expect(roundTrip.episodeCount,12);
    expect(roundTrip.season,2);expect(roundTrip.episode,8);
    final unknown=MediaItem.fromJson({'id':'id','ref':'ref'});
    expect(unknown.runtimeMinutes,isNull);expect(unknown.episodeCount,isNull);
    expect(unknown.toJson().containsKey('runtime_minutes'),false);
  });
  for(final size in [const Size(320,640),const Size(844,390),const Size(1920,1080)]) {
    testWidgets('details header adapts at $size with large text', (tester) async {
      tester.view.physicalSize=size;tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:MediaQuery(
        data:MediaQueryData(size:size,textScaler:TextScaler.linear(2)),
        child:const SingleChildScrollView(child:Padding(padding:EdgeInsets.all(16),
          child:TitleOverviewHeader(title:'عنوان العمل الطويل للتجربة',poster:'',
            facts:['S2','E8','12 حلقات متاحة'],plot:'وصف العمل المتاح من المصدر.'),
        )),
      ))));
      expect(find.text('عنوان العمل الطويل للتجربة'),findsOneWidget);
      expect(tester.takeException(),isNull);
    });
  }
}
