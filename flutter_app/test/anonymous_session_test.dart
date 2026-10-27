import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/cloud_library.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('SDK startup retries offline, restores same anonymous owner and registers once', () async {
    const owner = '00000000-0000-4000-8000-000000000001';
    var signups = 0;
    var registrations = 0;
    final expires =
        DateTime.now().add(const Duration(days: 1)).millisecondsSinceEpoch ~/
        1000;
    String part(Map<String, dynamic> value) =>
        base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
    final token =
        '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part({'sub': owner, 'aud': 'authenticated', 'role': 'authenticated', 'exp': expires})}.test-signature';
    final session = {
      'access_token': token,
      'refresh_token': 'test-refresh-not-a-real-secret',
      'token_type': 'bearer',
      'expires_in': 86400,
      'expires_at': expires,
      'user': {
        'id': owner,
        'aud': 'authenticated',
        'role': 'authenticated',
        'is_anonymous': true,
        'app_metadata': {
          'provider': 'anonymous',
          'providers': ['anonymous'],
        },
        'user_metadata': {},
        'identities': [],
        'created_at': '2026-10-15T00:00:00Z',
      },
    };
    final mock = MockClient((request) async {
      if (request.url.path.endsWith('/signup')) {
        signups++;
        if (signups == 1) {
          return http.Response(
            '{"msg":"temporary offline fixture"}',
            400,
            request: request,
          );
        }
        return http.Response(
          jsonEncode(session),
          200,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }
      if (request.url.path.endsWith('/mitv_devices')) {
        registrations++;
        final body = jsonDecode(request.body) as Map;
        expect(body['user_id'], owner);
        expect(body['device_id'], matches(r'^[0-9a-f-]{36}$'));
        return http.Response(
          '[]',
          201,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }
      if (request.url.path.endsWith('/najd_touch_account')) {
        return http.Response(
          jsonEncode({
            'owner_scope': owner,
            'grant_id': null,
            'expires_at': null,
          }),
          200,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }
      throw StateError('UNEXPECTED_SDK_REQUEST');
    });
    final client = SupabaseClient(
      'https://sdk.example.test',
      'sb_publishable_fixture',
      httpClient: mock,
      authOptions: const AuthClientOptions(autoRefreshToken: false),
    );
    final prefs = await SharedPreferences.getInstance();
    final adapter = AnonymousLibraryTransport(client, prefs);
    try {
      await expectLater(adapter.prepare(), throwsA(isA<AuthException>()));
      final uuid = prefs.getString(CloudLibrarySync.deviceIdKey);
      expect(uuid, isNotNull);
      await adapter.prepare();
      await adapter.prepare();
      expect(adapter.ownerId, owner);
      expect(signups, 2);
      expect(registrations, 1);
      expect(prefs.getString(CloudLibrarySync.deviceIdKey), uuid);
      final saved = prefs.getString('sb-roqccichwszxamdpvhli-auth-token');
      expect(saved, isNotNull);
      final restored = SupabaseClient(
        'https://sdk.example.test',
        'sb_publishable_fixture',
        httpClient: mock,
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      );
      try {
        await restored.auth.recoverSession(saved!);
        final restoredAdapter = AnonymousLibraryTransport(restored, prefs);
        await restoredAdapter.prepare();
        expect(restoredAdapter.ownerId, owner);
        expect(signups, 2);
        expect(registrations, 1);
      } finally {
        await restored.dispose();
      }
      final changed = jsonDecode(jsonEncode(session)) as Map<String, dynamic>;
      const otherOwner = '00000000-0000-4000-8000-000000000002';
      (changed['user'] as Map)['id'] = otherOwner;
      changed['access_token'] =
          '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part({'sub': otherOwner, 'aud': 'authenticated', 'role': 'authenticated', 'exp': expires})}.test-signature';
      await client.auth.recoverSession(jsonEncode(changed));
      await expectLater(adapter.push([]), throwsStateError);
      expect(adapter.ownerId, owner);
    } finally {
      await client.dispose();
    }
  });

  test(
    'missing saved session never silently signs up a replacement owner',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('mitv.auth.owner.v1', 'original-owner');
      var requests = 0;
      final client = SupabaseClient(
        'https://sdk.example.test',
        'sb_publishable_fixture',
        httpClient: MockClient((request) async {
          requests++;
          return http.Response('{}', 500);
        }),
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      );
      try {
        await expectLater(
          AnonymousLibraryTransport(client, prefs).prepare(),
          throwsStateError,
        );
        expect(requests, 0);
        expect(prefs.getString('mitv.auth.owner.v1'), 'original-owner');
      } finally {
        await client.dispose();
      }
    },
  );
}
