import 'package:al_qahtani/main.dart';
import 'package:al_qahtani/src/api_client.dart';
import 'package:al_qahtani/src/library_store.dart';
import 'package:al_qahtani/src/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CategoryApi extends AlQahtaniApi {
  final requested = <String>[];
  @override
  Future<List<CatalogItem>> category(String categoryId, {int page = 1}) async {
    requested.add(categoryId);
    return [];
  }
}

void main() {
  testWidgets('3isk has exactly four approved categories and switches to movies', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = CategoryApi();
    final store = await LocalLibraryStore.create();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CatalogPage(
      api: api, store: store, title: 'قصة عشق', categoryId: '3isk-latest',
    ))));
    await tester.pumpAndSettle();
    final dropdown = tester.widget<DropdownButton<String>>(find.byType(DropdownButton<String>));
    expect(dropdown.items!.map((item) => item.value), ['3isk-latest', '3isk-turkish', '3isk-dubbed', '3isk-movies']);
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('جميع الأفلام').last);
    await tester.pumpAndSettle();
    expect(api.requested, ['3isk-latest', '3isk-movies']);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
