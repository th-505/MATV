import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ChannelsApi extends MitvApi {
  var attempts=0;
  @override
  Future<List<MatchItem>> matches() async=>[];
  @override
  Future<List<CatalogItem>> liveChannels() async {
    if(++attempts==1)throw const ApiException('UNAVAILABLE');
    return [const CatalogItem(id:'egydead_live:original',ref:'egydead_live:original',
      title:'Fixture channel',poster:'',type:'live',source:'egydead_live')];
  }
}
void main(){
  for(final size in [const Size(320,640),const Size(844,390),const Size(1920,1080)]) {
    testWidgets('live channels recover and layout fits $size',(tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize=size;tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final api=ChannelsApi();final store=await LocalLibraryStore.create();
      addTearDown(api.close);addTearDown(store.dispose);
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:LivePage(api:api,store:store))));
      await tester.pumpAndSettle();
      final retry=find.text('تعذر تحميل القنوات — إعادة المحاولة');
      await tester.ensureVisible(retry);
      await tester.tap(retry);await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Fixture channel'));
      expect(api.attempts,2);expect(retry,findsNothing);
      expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
