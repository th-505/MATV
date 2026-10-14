import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/supabase_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('SupabaseService', () {
    test('generates and persists stable Device UUID', () async {
      final uuid1 = await SupabaseService.getOrCreateDeviceUuid();
      expect(uuid1, startsWith('mitv-dev-'));

      final uuid2 = await SupabaseService.getOrCreateDeviceUuid();
      expect(uuid2, uuid1);
    });

    test('signs in silently and persists access token', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/auth/v1/signup') {
          return http.Response(
            jsonEncode({
              'access_token': 'fake-jwt-token-12345',
              'user': {'id': 'user-uuid-999'},
            }),
            200,
          );
        }
        return http.Response('Not Found', 404);
      });

      final service = SupabaseService(
        url: 'https://test.supabase.co',
        anonKey: 'fake-anon-key',
        client: mockClient,
      );

      final success = await service.signInSilently();
      expect(success, isTrue);
      expect(service.isAuthenticated, isTrue);
      expect(service.accessToken, 'fake-jwt-token-12345');
      expect(service.userId, 'user-uuid-999');
    });

    test('syncs favorites and watch progress when authenticated', () async {
      var favoritesPosted = false;
      var historyPosted = false;

      final mockClient = MockClient((request) async {
        if (request.url.path == '/auth/v1/signup') {
          return http.Response(
            jsonEncode({
              'access_token': 'fake-jwt-token-12345',
              'user': {'id': 'user-uuid-999'},
            }),
            200,
          );
        }
        if (request.url.path == '/rest/v1/mitv_favorites') {
          favoritesPosted = true;
          expect(request.headers['Authorization'], 'Bearer fake-jwt-token-12345');
          return http.Response('', 201);
        }
        if (request.url.path == '/rest/v1/mitv_watch_history') {
          historyPosted = true;
          expect(request.headers['Authorization'], 'Bearer fake-jwt-token-12345');
          return http.Response('', 201);
        }
        return http.Response('Not Found', 404);
      });

      final service = SupabaseService(
        url: 'https://test.supabase.co',
        anonKey: 'fake-anon-key',
        client: mockClient,
      );

      await service.signInSilently();
      await service.syncFavorite({'ref': 'movie:123', 'title': 'Test Movie'}, true);
      await service.syncWatchProgress({
        'content_ref': 'movie:123',
        'position_ms': 50000,
        'duration_ms': 120000,
      });

      expect(favoritesPosted, isTrue);
      expect(historyPosted, isTrue);
    });
  });
}
