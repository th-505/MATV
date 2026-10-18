import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/adaptive_viewport.dart';
import 'package:mitv/src/player_viewport_frame.dart';

void main() {
  for (final size in [const Size(320,640),const Size(844,390),const Size(1024,768),const Size(1920,1080)]) {
    for (final fullscreen in [false,true]) {
      testWidgets('shared player frame $size fullscreen=$fullscreen', (tester) async {
        tester.view.physicalSize=size;
        tester.view.devicePixelRatio=1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(home: Scaffold(body: PlayerViewportFrame(
          videoSize:const Size(1920,1080), fullscreen:fullscreen,
          child:const ColoredBox(color:Colors.black),
        ))));
        final rect=tester.getRect(find.byKey(const Key('player-viewport-frame')));
        expect(rect.width,lessThanOrEqualTo(fullscreen ? size.width : 1440));
        expect(rect.height,lessThanOrEqualTo(size.height));
        if (fullscreen) { expect(rect.size,size); }
        else { expect(rect.width/rect.height,closeTo(16/9,.001)); }
        expect(tester.takeException(),isNull);
      });
    }
    testWidgets('catalog uses actual parent bounds at $size', (tester) async {
      tester.view.physicalSize=size;
      tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final width=size.width>1000 ? 700.0 : size.width;
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: Align(
        alignment:Alignment.topLeft, child:SizedBox(width:width,child:AdaptiveCatalogGrid(
          itemCount:20,itemBuilder:(_,i)=>ColoredBox(key:Key('card-$i'),color:Colors.blue),
        )),
      ))));
      final grid=tester.widget<GridView>(find.byType(GridView));
      expect((grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount).crossAxisCount,
        AdaptiveCatalogGrid.columnsFor(width));
      expect(tester.getRect(find.byKey(const Key('card-0'))).right,lessThanOrEqualTo(width));
      expect(tester.takeException(),isNull);
    });
  }
}
