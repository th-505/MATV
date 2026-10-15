import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'cloud_runtime_stub.dart' if (dart.library.io) 'cloud_runtime_io.dart';
import 'library_store.dart';
import 'library_sync_record.dart';
import 'supabase_config.dart';

/// Small, owner-scoped adapter: no video URLs, service keys or Realtime sockets.
abstract interface class LibraryCloudTransport {
  String get ownerId;
  Future<List<LibrarySyncRecord>> push(List<LibrarySyncRecord> rows);
  Future<List<LibrarySyncRecord>> pull({
    required int afterRevision,
    required int limit,
  });
}

class SupabaseLibraryTransport implements LibraryCloudTransport {
  SupabaseLibraryTransport(this.client, this.ownerId);
  final SupabaseClient client;
  @override
  final String ownerId;

  void _checkOwner() {
    if (ownerId.isEmpty || client.auth.currentUser?.id != ownerId) {
      throw StateError('LIBRARY_SESSION_OWNER_CHANGED');
    }
  }

  @override
  Future<List<LibrarySyncRecord>> push(List<LibrarySyncRecord> rows) async {
    _checkOwner();
    if (rows.length > 32) throw ArgumentError('LIBRARY_BATCH_LIMIT');
    final result = await client
        .rpc(
          'mitv_upsert_library',
          params: {
            'rows': rows.map((row) => row.toJson()).toList(growable: false),
          },
        )
        .timeout(const Duration(seconds: 20));
    return _rows(result);
  }

  @override
  Future<List<LibrarySyncRecord>> pull({
    required int afterRevision,
    required int limit,
  }) async {
    _checkOwner();
    final result = await client
        .from('mitv_library')
        .select()
        .eq('user_id', ownerId)
        .gt('sync_revision', afterRevision)
        .order('sync_revision')
        .limit(limit.clamp(1, 250))
        .timeout(const Duration(seconds: 20));
    return _rows(result);
  }

  List<LibrarySyncRecord> _rows(dynamic result) {
    if (result is! List) {
      throw const FormatException('INVALID_LIBRARY_RESPONSE');
    }
    return result
        .map((raw) {
          final row = LibrarySyncRecord.fromJson(
            (raw as Map).cast<String, dynamic>(),
          );
          if (row.userId != ownerId) {
            throw const FormatException('LIBRARY_OWNER_MISMATCH');
          }
          return row;
        })
        .toList(growable: false);
  }
}

/// Authentication is retried by the same bounded sync loop. A temporary first-
/// launch outage does not require restarting the app or replacing a saved owner.
class AnonymousLibraryTransport extends SupabaseLibraryTransport {
  AnonymousLibraryTransport(SupabaseClient client, this._prefs)
    : super(client, '');
  final SharedPreferences _prefs;
  static const _ownerKey = 'mitv.auth.owner.v1';
  static const _registeredKey = 'mitv.auth.registered.v1';
  Future<void>? _preparing;
  bool _ready = false;
  String? _boundOwner;
  @override
  String get ownerId =>
      _boundOwner ??
      _prefs.getString(_ownerKey) ??
      client.auth.currentUser?.id ??
      '';

  Future<void> prepare() {
    if (_ready) return Future.value();
    final pending = _preparing;
    if (pending != null) return pending;
    final operation = _prepare();
    _preparing = operation;
    return operation.whenComplete(() => _preparing = null);
  }

  Future<void> _prepare() async {
    final deviceId = await CloudLibrarySync.deviceIdFor(_prefs);
    var session = client.auth.currentSession;
    final previousOwner = _prefs.getString(_ownerKey);
    if (session == null) {
      if (previousOwner != null) {
        throw StateError('SAVED_LIBRARY_SESSION_REQUIRED');
      }
      session = (await client.auth.signInAnonymously().timeout(
        const Duration(seconds: 20),
      )).session;
      if (session == null) throw StateError('ANONYMOUS_SESSION_MISSING');
      final storage = SharedPreferencesLocalStorage(
        persistSessionKey:
            'sb-${Uri.parse(mitvSupabaseUrl).host.split('.').first}-auth-token',
      );
      await storage.initialize();
      await storage.persistSession(jsonEncode(session.toJson()));
    }
    final owner = session.user.id;
    if (previousOwner != null && previousOwner != owner) {
      throw StateError('SAVED_LIBRARY_OWNER_MISMATCH');
    }
    _boundOwner = owner;
    if (!await _prefs.setString(_ownerKey, owner)) {
      throw StateError('LIBRARY_OWNER_NOT_PERSISTED');
    }
    final registration = '$owner:$deviceId';
    if (_prefs.getString(_registeredKey) != registration) {
      await client
          .from('mitv_devices')
          .upsert({'user_id': owner, 'device_id': deviceId})
          .timeout(const Duration(seconds: 20));
      if (!await _prefs.setString(_registeredKey, registration)) {
        throw StateError('DEVICE_REGISTRATION_NOT_PERSISTED');
      }
    }
    _ready = true;
  }
}

/// One durable anonymous session per installation. Removing browsing cache never
/// touches the SDK session, device UUID or the owner-scoped incremental cursor.
class CloudLibrarySync with WidgetsBindingObserver {
  CloudLibrarySync._(
    this.store,
    this.transport,
    this._prefs,
    this._clock,
    this.historyInterval,
    this.pollInterval,
    this._observeLifecycle,
  );
  final LocalLibraryStore store;
  final LibraryCloudTransport transport;
  final SharedPreferences _prefs;
  final DateTime Function() _clock;
  final Duration historyInterval;
  final Duration pollInterval;
  final bool _observeLifecycle;
  static Future<Supabase>? _initializing;
  static Future<CloudLibrarySync?>? _startingDefault;
  static const deviceIdKey = 'mitv.device.uuid.v1';
  String get _cursorKey => 'library.cloud.cursor.v2.${transport.ownerId}';
  String get _historyKey => 'library.cloud.history.v1.${transport.ownerId}';
  Timer? _poll;
  Timer? _debounce;
  Future<void>? _running;
  bool _closed = false;
  bool _active = true;
  int _revision = 0;
  String _cursorOwner = '';
  DateTime? _lastHistoryPush;
  DateTime? _retryAfter;
  String? lastErrorCode;

  static Future<CloudLibrarySync?> startDefault(LocalLibraryStore store) {
    // Widget/unit tests use the injectable adapter, never production networking.
    if (cloudRuntimeIsTest || const bool.fromEnvironment('FLUTTER_TEST')) {
      return Future.value(null);
    }
    return _startingDefault ??= _startDefault(store);
  }

  static Future<CloudLibrarySync?> _startDefault(
    LocalLibraryStore store,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sdk = await (_initializing ??= Supabase.initialize(
        url: mitvSupabaseUrl,
        publishableKey: mitvSupabasePublishableKey,
        authOptions: const FlutterAuthClientOptions(
          detectSessionInUri: false,
          persistSession: true,
        ),
        debug: false,
      ));
      return await start(
        store,
        AnonymousLibraryTransport(sdk.client, prefs),
        preferences: prefs,
      );
    } catch (_) {
      // The library remains usable offline. Never emit session/JWT details.
      return null;
    }
  }

  @visibleForTesting
  static Future<String> deviceIdFor(SharedPreferences prefs) async {
    final existing = prefs.getString(deviceIdKey);
    if (existing != null &&
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(existing)) {
      return existing;
    }
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    final id =
        '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
    if (!await prefs.setString(deviceIdKey, id)) {
      throw StateError('DEVICE_ID_NOT_PERSISTED');
    }
    return id;
  }

  /// Injectable for deterministic offline tests and SDK integration checks.
  static Future<CloudLibrarySync> start(
    LocalLibraryStore store,
    LibraryCloudTransport transport, {
    SharedPreferences? preferences,
    DateTime Function()? clock,
    Duration historyInterval = const Duration(seconds: 60),
    Duration pollInterval = const Duration(minutes: 5),
    bool observeLifecycle = true,
    bool syncImmediately = true,
  }) async {
    final sync = CloudLibrarySync._(
      store,
      transport,
      preferences ?? await SharedPreferences.getInstance(),
      clock ?? DateTime.now,
      historyInterval,
      pollInterval,
      observeLifecycle,
    );
    sync._loadOwnerState();
    store.addListener(sync._onChange);
    if (observeLifecycle) WidgetsBinding.instance.addObserver(sync);
    sync._poll = Timer.periodic(pollInterval, (_) {
      if (sync._active) unawaited(sync.syncNow());
    });
    if (syncImmediately) unawaited(sync.syncNow());
    return sync;
  }

  void _loadOwnerState() {
    if (transport.ownerId.isEmpty || _cursorOwner == transport.ownerId) return;
    _cursorOwner = transport.ownerId;
    _revision = _prefs.getInt(_cursorKey) ?? 0;
    final last = _prefs.getInt(_historyKey);
    _lastHistoryPush = last == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(last, isUtc: true);
  }

  void _onChange() {
    if (_closed ||
        !_active ||
        _running != null ||
        _retryAfter != null && _clock().toUtc().isBefore(_retryAfter!)) {
      return;
    }
    _debounce?.cancel();
    final pending = store.pendingCloudRows
        .where((row) => row.fitsCloudBudget)
        .toList();
    if (pending.isEmpty) return;
    final onlyHistory = pending.every(
      (row) => row.kind == 'history' && !row.deleted,
    );
    final remaining = _lastHistoryPush == null
        ? Duration.zero
        : historyInterval - _clock().toUtc().difference(_lastHistoryPush!);
    _debounce = Timer(
      onlyHistory && remaining > const Duration(seconds: 3)
          ? remaining
          : const Duration(seconds: 3),
      () => unawaited(syncNow()),
    );
  }

  Future<void> syncNow() {
    if (_closed ||
        !_active ||
        _retryAfter != null && _clock().toUtc().isBefore(_retryAfter!)) {
      return Future.value();
    }
    final running = _running;
    if (running != null) return running;
    final operation = _sync();
    _running = operation;
    return operation.whenComplete(() {
      _running = null;
      _onChange();
    });
  }

  Future<void> _sync() async {
    try {
      final adapter = transport;
      if (adapter is AnonymousLibraryTransport) await adapter.prepare();
      if (_closed) return;
      _loadOwnerState();
      // Pull first so an old local upgrade cannot resurrect a remote tombstone.
      // Server revisions measure arrival order, not potentially old device clocks.
      for (var page = 0; page < 8 && !_closed; page++) {
        final rows = await transport.pull(afterRevision: _revision, limit: 250);
        if (rows.any(
          (row) =>
              row.revision <= _revision ||
              row.userId.isNotEmpty && row.userId != transport.ownerId,
        )) {
          throw const FormatException('INVALID_LIBRARY_REVISION');
        }
        await store.mergeCloudRows(rows);
        if (rows.isNotEmpty) {
          _revision = rows.map((row) => row.revision).reduce(max);
          await _prefs.setInt(_cursorKey, _revision);
        }
        if (rows.length < 250) break;
      }
      final now = _clock().toUtc();
      final canHistory =
          _lastHistoryPush == null ||
          now.difference(_lastHistoryPush!) >= historyInterval;
      final pending = store.pendingCloudRows
          .where(
            (row) =>
                row.fitsCloudBudget &&
                (row.kind != 'history' || row.deleted || canHistory),
          )
          .take(128)
          .toList();
      for (var offset = 0; offset < pending.length && !_closed; offset += 32) {
        final rows = pending.skip(offset).take(32).toList(growable: false);
        await store.markCloudAttempted(rows);
        final accepted = await transport.push(rows);
        await store.acknowledgeCloudRows(rows, accepted);
        if (rows.any((row) => row.kind == 'history' && !row.deleted)) {
          _lastHistoryPush = now;
          await _prefs.setInt(_historyKey, now.millisecondsSinceEpoch);
        }
      }
      lastErrorCode = null;
      _retryAfter = null;
    } catch (_) {
      // Retain pending rows durably. Backoff is the existing 5-minute poll,
      // rather than a per-frame/per-error retry loop that drains the free quota.
      lastErrorCode = 'LIBRARY_SYNC_UNAVAILABLE';
      _retryAfter = _clock().toUtc().add(pollInterval);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _active = state == AppLifecycleState.resumed;
    if (!_active) _debounce?.cancel();
    if (_active) unawaited(syncNow());
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _debounce?.cancel();
    _poll?.cancel();
    store.removeListener(_onChange);
    if (_observeLifecycle) WidgetsBinding.instance.removeObserver(this);
    await _running;
  }
}
