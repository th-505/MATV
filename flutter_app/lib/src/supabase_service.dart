import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class SupabaseService {
  SupabaseService({
    String? url,
    String? anonKey,
    http.Client? client,
  })  : url = url ??
            const String.fromEnvironment(
              'SUPABASE_URL',
              defaultValue: 'https://vkmjrqiwdjhocvxqomrc.supabase.co',
            ),
        anonKey = anonKey ??
            const String.fromEnvironment(
              'SUPABASE_ANON_KEY',
              defaultValue: '',
            ),
        _client = client ?? http.Client();

  final String url;
  final String anonKey;
  final http.Client _client;

  static const _deviceUuidKey = 'mitv.device.uuid.v1';
  static const _authTokenKey = 'mitv.supabase.token.v1';
  static const _userIdKey = 'mitv.supabase.user_id.v1';

  String? _accessToken;
  String? _userId;

  String? get accessToken => _accessToken;
  String? get userId => _userId;
  bool get isAuthenticated => _accessToken != null && _accessToken!.isNotEmpty;

  /// Retrieves or creates a stable Device UUID for silent anonymous authentication.
  static Future<String> getOrCreateDeviceUuid() async {
    final prefs = await SharedPreferences.getInstance();
    var uuid = prefs.getString(_deviceUuidKey);
    if (uuid == null || uuid.isEmpty) {
      final now = DateTime.now().microsecondsSinceEpoch;
      final random = (now.hashCode ^ 0x5DEECE66D).abs();
      uuid = 'mitv-dev-$now-$random';
      await prefs.setString(_deviceUuidKey, uuid);
    }
    return uuid;
  }

  /// Silently authenticates via Supabase anonymous sign-in or cached session.
  Future<bool> signInSilently() async {
    if (url.isEmpty || anonKey.isEmpty) return false;

    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_authTokenKey);
    _userId = prefs.getString(_userIdKey);

    if (isAuthenticated) return true;

    final deviceUuid = await getOrCreateDeviceUuid();

    try {
      final endpoint = Uri.parse('$url/auth/v1/signup');
      final response = await _client.post(
        endpoint,
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'email': '$deviceUuid@anon.mitv.app',
          'password': 'dev-$deviceUuid-secret',
          'data': {'device_uuid': deviceUuid, 'is_anonymous': true},
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        _accessToken = data['access_token'] as String?;
        final user = data['user'] as Map<String, dynamic>?;
        _userId = user?['id'] as String?;

        if (_accessToken != null) {
          await prefs.setString(_authTokenKey, _accessToken!);
          if (_userId != null) await prefs.setString(_userIdKey, _userId!);
          return true;
        }
      } else {
        // Try sign-in if already signed up with this device ID
        final loginEndpoint = Uri.parse('$url/auth/v1/token?grant_type=password');
        final loginResponse = await _client.post(
          loginEndpoint,
          headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'email': '$deviceUuid@anon.mitv.app',
            'password': 'dev-$deviceUuid-secret',
          }),
        ).timeout(const Duration(seconds: 10));

        if (loginResponse.statusCode == 200) {
          final data = jsonDecode(loginResponse.body);
          _accessToken = data['access_token'] as String?;
          final user = data['user'] as Map<String, dynamic>?;
          _userId = user?['id'] as String?;

          if (_accessToken != null) {
            await prefs.setString(_authTokenKey, _accessToken!);
            if (_userId != null) await prefs.setString(_userIdKey, _userId!);
            return true;
          }
        }
      }
    } catch (_) {
      // Offline fallback: keep silent without interrupting the user
    }
    return false;
  }

  /// Syncs favorite item with Supabase RLS table.
  Future<void> syncFavorite(Map<String, dynamic> itemJson, bool isFavorite) async {
    if (!isAuthenticated) return;
    try {
      if (isFavorite) {
        final uri = Uri.parse('$url/rest/v1/mitv_favorites');
        await _client.post(
          uri,
          headers: {
            'apikey': anonKey,
            'Authorization': 'Bearer $_accessToken',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: jsonEncode({
            'user_id': _userId,
            'content_ref': itemJson['ref'],
            'payload': itemJson,
            'updated_at': DateTime.now().toIso8601String(),
          }),
        ).timeout(const Duration(seconds: 8));
      } else {
        final ref = Uri.encodeComponent('${itemJson['ref']}');
        final uri = Uri.parse('$url/rest/v1/mitv_favorites?content_ref=eq.$ref');
        await _client.delete(
          uri,
          headers: {
            'apikey': anonKey,
            'Authorization': 'Bearer $_accessToken',
          },
        ).timeout(const Duration(seconds: 8));
      }
    } catch (_) {}
  }

  /// Syncs watch progress with Supabase RLS table.
  Future<void> syncWatchProgress(Map<String, dynamic> entryJson) async {
    if (!isAuthenticated) return;
    try {
      final uri = Uri.parse('$url/rest/v1/mitv_watch_history');
      await _client.post(
        uri,
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer $_accessToken',
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: jsonEncode({
          'user_id': _userId,
          'content_ref': entryJson['content_ref'],
          'episode_id': entryJson['episode_id'] ?? '',
          'position_ms': entryJson['position_ms'],
          'duration_ms': entryJson['duration_ms'],
          'payload': entryJson,
          'updated_at': DateTime.now().toIso8601String(),
        }),
      ).timeout(const Duration(seconds: 8));
    } catch (_) {}
  }

  void close() {
    _client.close();
  }
}
