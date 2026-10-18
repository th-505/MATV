import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
  test('actual details opens record only the original reference; prefetch does not', () async {
    final opens=<Uri>[];
    final api=MitvApi(client:MockClient((request) async {
      if(request.method=='POST') {
        expect(request.url.path,'/api/cinema/open');
        expect(request.url.queryParameters.keys,['ref']);
        expect(request.body,isEmpty);
        opens.add(request.url);
        return http.Response('{"status":"success"}',202);
      }
      return http.Response(jsonEncode({'status':'success','movie_title':'Fixture','episodes':[]}),200);
    }));
    addTearDown(api.close);
    await api.prefetchMetadata('mycima:original-ref');
    expect(opens,isEmpty);
    await api.details('mycima:original-ref');
    await Future<void>.delayed(Duration.zero);
    await api.details('mycima:original-ref');
    await Future<void>.delayed(Duration.zero);
    expect(opens.length,1);
    expect(opens.single.queryParameters['ref'],'mycima:original-ref');
  });

  test('neutral browse uses backend, keeps references and pagination, accepts empty feed', () async {
    var count=0;
    final api=MitvApi(client:MockClient((request) async {
      count++;
      expect(request.url.path,'/api/v1/category');
      expect(request.url.queryParameters['ref'],'browse-movies');
      final page=request.url.queryParameters['p'];
      return http.Response(jsonEncode({
        'status':page=='1'?'success':'no_results',
        'pagination':{'has_more':page=='1','next_page':page=='1'?2:null},
        'data':page=='1'?[{'id':'akwam:original','ref':'akwam:original','title':'Work','type':'movie','source':'akwam'}]:[],
      }),200);
    }));
    addTearDown(api.close);
    final rows=await api.category('browse-movies');
    expect(rows.single.ref,'akwam:original');
    expect(rows.single.source,'akwam');
    expect(api.categoryHasMore('browse-movies',1),true);
    expect(await api.category('browse-movies',page:2),isEmpty);
    expect(api.categoryHasMore('browse-movies',2),false);
    expect(count,2);
  });
}
