import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/api_client.dart';

void main() {
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
