import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import '../tool/mitv_live_quality.dart' as smoke;

void main(){
  testWidgets('native decoding of edge live HLS and resumed protected MP4 fixture',(tester)async{
    final library=Platform.environment['MITV_NATIVE_LIBMPV']!;
    final fixture=Platform.environment['MITV_SMOKE_FIXTURE']!;
    await tester.runAsync(()=>smoke.main([library,'file',fixture]));
    if(Platform.environment['MITV_SMOKE_LIVE']=='1'){
      await tester.runAsync(()=>smoke.main([library,'live']));
    }
  },skip:Platform.environment['MITV_NATIVE_LIBMPV']==null);
}
