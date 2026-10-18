import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/main.dart';
import 'package:mitv/src/api_client.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:shared_preferences/shared_preferences.dart';
class HomeApi extends MitvApi {
  final categories=<String>[];
  final queries=<String>[];
  var attempts=0;
  @override
  Future<List<CatalogItem>> category(String categoryId,{int page=1}) async {
    categories.add(categoryId);
    if(++attempts==1)throw const ApiException('HOME_UNAVAILABLE');
    return [const CatalogItem(id:'42',ref:'tmdb:movie:42',title:'Home fixture',poster:'',type:'movie',source:'tmdb')];
  }
  @override
  Future<List<Map<String,dynamic>>> searchProviders() async=>[];
  @override
  Future<List<CatalogItem>> search(String query,{String providerId=''}) async {queries.add(query);return [];}
  @override
  Future<List<CatalogItem>> searchTmdb(String query) async=>throw StateError('TMDb must not substitute provider search');
}
void main(){
  testWidgets('home retries TMDb metadata and opens real explore for the selected title',(tester) async {
    SharedPreferences.setMockInitialValues({});
    final api=HomeApi();final store=await LocalLibraryStore.create();
    addTearDown(api.close);addTearDown(store.dispose);
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:HomePage(api:api,store:store))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تعذر تحميل الرئيسية — إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(api.categories,['home-trending','home-trending']);
    await tester.tap(find.text('استكشاف العمل'));
    await tester.pumpAndSettle();
    expect(api.queries,['Home fixture']);
    expect(find.text('لا توجد نتائج لهذا البحث حاليًا'),findsOneWidget);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
