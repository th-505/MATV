import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'library_sync_record.dart';
import 'models.dart';

String _stableReference(String raw) {
  if (utf8.encode(raw).length > 1536 ||
      raw.contains(RegExp(r'[\r\n]')) ||
      raw.contains('://') ||
      RegExp(
        r'(?:^|[?&])(token|expires|signature)=',
        caseSensitive: false,
      ).hasMatch(raw)) {
    return '';
  }
  return raw;
}

class WatchEntry {
  const WatchEntry({
    required this.contentRef,
    required this.contentId,
    required this.title,
    required this.poster,
    required this.type,
    required this.positionMs,
    required this.durationMs,
    required this.updatedAtMs,
    this.episodeId = '',
    this.episodeNumber,
    this.metadata,
    this.selectedSourceRef = '',
    this.providerId = '',
    this.edition = '',
    this.timelineVerified = false,
    this.timelineOffsetMs,
  });
  final String contentRef;
  final String contentId;
  final String title;
  final String poster;
  final String type;
  final int positionMs;
  final int durationMs;
  final int updatedAtMs;
  final String episodeId;
  final int? episodeNumber;
  final CatalogItem? metadata;
  final String selectedSourceRef;
  final String providerId;
  final String edition;
  final bool timelineVerified;
  final int? timelineOffsetMs;
  String get key => episodeId.isEmpty ? contentRef : '$contentRef::$episodeId';
  double get progress =>
      durationMs <= 0 ? 0 : (positionMs / durationMs).clamp(0, 1);
  CatalogItem get catalogItem =>
      metadata ??
      CatalogItem(
        id: contentId,
        title: title,
        poster: poster,
        type: type,
        ref: contentRef,
      );
  Map<String, dynamic> toJson() => {
    'content_ref': _stableReference(contentRef),
    'content_id': contentId,
    'title': title,
    'poster': poster,
    'type': type,
    'position_ms': positionMs,
    'duration_ms': durationMs,
    'updated_at_ms': updatedAtMs,
    'episode_id': _stableReference(episodeId),
    'episode_number': episodeNumber,
    'catalog_item': catalogItem.toJson(),
    'selected_source_ref': _stableReference(selectedSourceRef),
    'provider_id': providerId,
    'edition': edition,
    'timeline_verified': timelineVerified,
    'timeline_offset_ms': timelineOffsetMs,
  };
  factory WatchEntry.fromJson(Map<String, dynamic> json) => WatchEntry(
    contentRef: _stableReference('${json['content_ref'] ?? ''}'),
    contentId: '${json['content_id'] ?? ''}',
    title: '${json['title'] ?? ''}',
    poster: '${json['poster'] ?? ''}',
    type: '${json['type'] ?? ''}',
    positionMs: (int.tryParse('${json['position_ms'] ?? 0}') ?? 0).clamp(
      0,
      604800000,
    ),
    durationMs: (int.tryParse('${json['duration_ms'] ?? 0}') ?? 0).clamp(
      0,
      604800000,
    ),
    updatedAtMs: int.tryParse('${json['updated_at_ms'] ?? 0}') ?? 0,
    episodeId: _stableReference('${json['episode_id'] ?? ''}'),
    episodeNumber: int.tryParse('${json['episode_number'] ?? ''}'),
    metadata: json['catalog_item'] is Map
        ? CatalogItem.fromJson(
            (json['catalog_item'] as Map).cast<String, dynamic>(),
          )
        : null,
    selectedSourceRef: _stableReference('${json['selected_source_ref'] ?? ''}'),
    providerId: '${json['provider_id'] ?? ''}',
    edition: '${json['edition'] ?? ''}',
    timelineVerified: json['timeline_verified'] == true,
    timelineOffsetMs: int.tryParse('${json['timeline_offset_ms'] ?? ''}'),
  );
}

class LocalLibraryStore extends ChangeNotifier {
  LocalLibraryStore._(this._prefs, this._clock);
  static const _favoritesKey = 'library.favorites.v1';
  static const _historyKey = 'library.history.v1';
  static const _syncKey = 'library.sync.v1';
  static const _searchHistoryKey = 'search.history.v1';
  static const _searchSourceKey = 'search.source.v1';
  static const _librarySortKey = 'library.sort.v1';
  static const _historyLimit = 80;
  static const _searchHistoryLimit = 12;
  final SharedPreferences _prefs;
  final DateTime Function() _clock;
  final Map<String, CatalogItem> _favorites = {};
  final Map<String, WatchEntry> _history = {};
  final Map<String, LibrarySyncRecord> _changes = {};
  final Set<String> _pending = {};
  final Set<String> _attempted = {};
  final List<String> _searchHistory = [];
  String _searchSource = 'basri';
  String _librarySort = 'recent';
  int _lastMutationMs = 0;
  bool _closed = false;
  Future<void> _writeTail = Future.value();

  static Future<LocalLibraryStore> create({DateTime Function()? clock}) async {
    final store = LocalLibraryStore._(
      await SharedPreferences.getInstance(),
      clock ?? DateTime.now,
    );
    store._load();
    return store;
  }

  List<CatalogItem> get favorites => List.unmodifiable(_favorites.values);
  List<String> get searchHistory => List.unmodifiable(_searchHistory);
  String get searchSource => _searchSource;
  String get librarySort => _librarySort;
  List<WatchEntry> get history {
    final values = _history.values.toList()
      ..sort((a, b) => b.updatedAtMs.compareTo(a.updatedAtMs));
    return List.unmodifiable(values);
  }

  List<WatchEntry> get continueWatching => history
      .where(
        (entry) =>
            entry.positionMs >= 5000 &&
            (entry.durationMs <= 0 || entry.progress < .95),
      )
      .toList(growable: false);
  bool isFavorite(String contentRef) => _favorites.containsKey(contentRef);
  WatchEntry? resumeEntry(String contentRef, {String episodeId = ''}) =>
      _history[episodeId.isEmpty ? contentRef : '$contentRef::$episodeId'];
  Duration resumePosition(String contentRef, {String episodeId = ''}) =>
      Duration(
        milliseconds:
            resumeEntry(contentRef, episodeId: episodeId)?.positionMs ?? 0,
      );
  List<LibrarySyncRecord> get pendingCloudRows {
    final rows =
        _pending
            .map((key) => _changes[key])
            .whereType<LibrarySyncRecord>()
            .toList()
          ..sort((a, b) => a.updatedAt.compareTo(b.updatedAt));
    return List.unmodifiable(rows);
  }

  List<CatalogItem> sortedFavorites() {
    final values = _favorites.values.toList();
    if (_librarySort == 'title') {
      values.sort(
        (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
      );
    }
    return List.unmodifiable(values);
  }

  List<WatchEntry> sortedContinueWatching() {
    final values = continueWatching.toList();
    if (_librarySort == 'title') {
      values.sort(
        (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
      );
    }
    if (_librarySort == 'progress') {
      values.sort((a, b) => b.progress.compareTo(a.progress));
    }
    return List.unmodifiable(values);
  }

  void _notify() {
    if (!_closed) notifyListeners();
  }

  Future<void> setSearchSource(String value) async {
    final normalized = value == 'tmdb' ? 'tmdb' : 'basri';
    if (_searchSource == normalized) return;
    _searchSource = normalized;
    await _prefs.setString(_searchSourceKey, normalized);
    _notify();
  }

  Future<void> rememberSearch(String value) async {
    final normalized = value.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (normalized.length < 2) return;
    _searchHistory.removeWhere(
      (item) => item.toLowerCase() == normalized.toLowerCase(),
    );
    _searchHistory.insert(0, normalized);
    if (_searchHistory.length > _searchHistoryLimit) {
      _searchHistory.removeRange(_searchHistoryLimit, _searchHistory.length);
    }
    await _prefs.setStringList(_searchHistoryKey, _searchHistory);
    _notify();
  }

  Future<void> clearSearchHistory() async {
    _searchHistory.clear();
    await _prefs.remove(_searchHistoryKey);
    _notify();
  }

  Future<void> setLibrarySort(String value) async {
    final normalized = const {'recent', 'title', 'progress'}.contains(value)
        ? value
        : 'recent';
    if (_librarySort == normalized) return;
    _librarySort = normalized;
    await _prefs.setString(_librarySortKey, normalized);
    _notify();
  }

  DateTime _nextTimestamp() {
    final now = _clock().toUtc().millisecondsSinceEpoch;
    _lastMutationMs = now > _lastMutationMs ? now : _lastMutationMs + 1;
    return DateTime.fromMillisecondsSinceEpoch(_lastMutationMs, isUtc: true);
  }

  void _change(
    String kind,
    String itemKey,
    Map<String, dynamic> metadata, {
    bool deleted = false,
  }) {
    final key = '$kind::$itemKey';
    // An entirely local, never-submitted add followed by removal has no remote
    // row to resurrect. Once attempted, retain a tombstone even if its ACK was lost.
    if (deleted &&
        _changes.containsKey(key) &&
        _pending.contains(key) &&
        !_attempted.contains(key)) {
      _changes.remove(key);
      _pending.remove(key);
      return;
    }
    _changes[key] = LibrarySyncRecord(
      kind: kind,
      itemKey: itemKey,
      metadata: deleted ? const {} : metadata,
      updatedAt: _nextTimestamp(),
      deleted: deleted,
    );
    _pending.add(key);
  }

  Future<void> toggleFavorite(CatalogItem item) async {
    if (item.ref.isEmpty || _stableReference(item.ref).isEmpty) return;
    if (_favorites.containsKey(item.ref)) {
      _favorites.remove(item.ref);
      _change('favorite', item.ref, const {}, deleted: true);
    } else {
      final safe = CatalogItem.fromJson(item.toJson());
      _favorites[item.ref] = safe;
      _change('favorite', item.ref, safe.toJson());
    }
    await _persistLibrary();
    _notify();
  }

  Future<void> recordProgress({
    required CatalogItem item,
    required Duration position,
    required Duration duration,
    String episodeId = '',
    int? episodeNumber,
    String selectedSourceRef = '',
    String providerId = '',
    String edition = '',
    bool timelineVerified = false,
    int? timelineOffsetMs,
  }) async {
    if (item.ref.isEmpty || _stableReference(item.ref).isEmpty) return;
    final timestamp = _nextTimestamp();
    final entry = WatchEntry(
      contentRef: item.ref,
      contentId: item.id,
      title: item.title,
      poster: item.poster,
      type: item.type,
      positionMs: position.inMilliseconds.clamp(0, 604800000),
      durationMs: duration.inMilliseconds.clamp(0, 604800000),
      updatedAtMs: timestamp.millisecondsSinceEpoch,
      episodeId: episodeId,
      episodeNumber: episodeNumber,
      metadata: CatalogItem.fromJson(item.toJson()),
      selectedSourceRef: _stableReference(selectedSourceRef),
      providerId: providerId,
      edition: edition,
      timelineVerified: timelineVerified,
      timelineOffsetMs: timelineOffsetMs,
    );
    _history[entry.key] = entry;
    _change('history', entry.key, entry.toJson());
    for (final old in history.skip(_historyLimit)) {
      _history.remove(old.key);
      _change('history', old.key, const {}, deleted: true);
    }
    await _persistLibrary();
    _notify();
  }

  Future<void> clearHistory() async {
    for (final key in _history.keys.toList()) {
      _change('history', key, const {}, deleted: true);
    }
    _history.clear();
    await _persistLibrary();
    _notify();
  }

  Future<void> markCloudAttempted(Iterable<LibrarySyncRecord> rows) async {
    _attempted.addAll(rows.map((row) => row.key));
    await _persistLibrary();
  }

  Future<void> mergeCloudRows(Iterable<LibrarySyncRecord> rows) async {
    var changed = false;
    for (final row in rows) {
      final current = _changes[row.key];
      if (current != null &&
          (current.updatedAt.isAfter(row.updatedAt) ||
              current.updatedAt == row.updatedAt &&
                  (current.deleted || !row.deleted))) {
        continue;
      }
      if (!_applyCloudRow(row)) continue;
      _lastMutationMs = _lastMutationMs > row.updatedAt.millisecondsSinceEpoch
          ? _lastMutationMs
          : row.updatedAt.millisecondsSinceEpoch;
      _changes[row.key] = row;
      _pending.remove(row.key);
      _attempted.add(row.key);
      changed = true;
    }
    if (changed) {
      await _persistLibrary();
      _notify();
    }
  }

  Future<void> acknowledgeCloudRows(
    List<LibrarySyncRecord> submitted,
    Iterable<LibrarySyncRecord> authoritative,
  ) async {
    final sent = {for (final row in submitted) row.key: row};
    var changed = false;
    for (final row in authoritative) {
      final submission = sent[row.key];
      final current = _changes[row.key];
      if (submission == null || current == null) continue;
      if (current.updatedAt != submission.updatedAt ||
          current.deleted != submission.deleted) {
        continue;
      }
      // The server may clamp a bad future clock. Its accepted/current row is
      // authoritative for this exact submitted version, not a later local edit.
      if (!_applyCloudRow(row)) continue;
      _lastMutationMs = _lastMutationMs > row.updatedAt.millisecondsSinceEpoch
          ? _lastMutationMs
          : row.updatedAt.millisecondsSinceEpoch;
      _changes[row.key] = row;
      _pending.remove(row.key);
      _attempted.add(row.key);
      changed = true;
    }
    if (changed) {
      await _persistLibrary();
      _notify();
    }
  }

  bool _applyCloudRow(LibrarySyncRecord row) {
    if (_stableReference(row.itemKey).isEmpty || !row.fitsCloudBudget) {
      return false;
    }
    if (row.kind == 'favorite') {
      if (row.deleted) {
        _favorites.remove(row.itemKey);
        return true;
      }
      final item = CatalogItem.fromJson(row.metadata);
      if (item.ref != row.itemKey) return false;
      _favorites[row.itemKey] = item;
      return true;
    }
    if (row.kind == 'history') {
      if (row.deleted) {
        _history.remove(row.itemKey);
        return true;
      }
      final entry = WatchEntry.fromJson(row.metadata);
      if (entry.key != row.itemKey || entry.contentRef.isEmpty) return false;
      _history[row.itemKey] = entry;
      return true;
    }
    return false;
  }

  void _load() {
    for (final raw in _prefs.getStringList(_favoritesKey) ?? const <String>[]) {
      try {
        final item = CatalogItem.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
        if (item.ref.isNotEmpty) _favorites[item.ref] = item;
      } catch (_) {}
    }
    for (final raw in _prefs.getStringList(_historyKey) ?? const <String>[]) {
      try {
        final entry = WatchEntry.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
        if (entry.contentRef.isNotEmpty) _history[entry.key] = entry;
      } catch (_) {}
    }
    for (final raw in _prefs.getStringList(_syncKey) ?? const <String>[]) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final row = LibrarySyncRecord.fromJson(json);
        if (!_applyCloudRow(row)) continue;
        _lastMutationMs = _lastMutationMs > row.updatedAt.millisecondsSinceEpoch
            ? _lastMutationMs
            : row.updatedAt.millisecondsSinceEpoch;
        _changes[row.key] = row;
        if (json['pending'] == true) _pending.add(row.key);
        if (json['attempted'] == true) _attempted.add(row.key);
      } catch (_) {}
    }
    // Old favorites have no mutation timestamp: do not give them a fresh time
    // that could override a newer remote deletion after an upgrade.
    for (final item in _favorites.values) {
      final row = LibrarySyncRecord(
        kind: 'favorite',
        itemKey: item.ref,
        metadata: item.toJson(),
        updatedAt: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      );
      if (!_changes.containsKey(row.key)) {
        _lastMutationMs = _lastMutationMs > row.updatedAt.millisecondsSinceEpoch
            ? _lastMutationMs
            : row.updatedAt.millisecondsSinceEpoch;
        _changes[row.key] = row;
        _pending.add(row.key);
        _attempted.add(row.key);
      }
    }
    for (final entry in _history.values) {
      final row = LibrarySyncRecord(
        kind: 'history',
        itemKey: entry.key,
        metadata: entry.toJson(),
        updatedAt: DateTime.fromMillisecondsSinceEpoch(
          entry.updatedAtMs,
          isUtc: true,
        ),
      );
      if (!_changes.containsKey(row.key)) {
        _lastMutationMs = _lastMutationMs > row.updatedAt.millisecondsSinceEpoch
            ? _lastMutationMs
            : row.updatedAt.millisecondsSinceEpoch;
        _changes[row.key] = row;
        _pending.add(row.key);
        _attempted.add(row.key);
      }
    }
    final seen = <String>{};
    for (final raw
        in _prefs.getStringList(_searchHistoryKey) ?? const <String>[]) {
      final value = raw.trim();
      final key = value.toLowerCase();
      if (value.length >= 2 &&
          seen.add(key) &&
          _searchHistory.length < _searchHistoryLimit) {
        _searchHistory.add(value);
      }
    }
    _searchSource = _prefs.getString(_searchSourceKey) == 'tmdb'
        ? 'tmdb'
        : 'basri';
    final sort = _prefs.getString(_librarySortKey) ?? 'recent';
    _librarySort = const {'recent', 'title', 'progress'}.contains(sort)
        ? sort
        : 'recent';
  }

  Future<void> _persistLibrary() {
    final job = _writeTail.catchError((Object _) {}).then((_) async {
      final oldTombstones =
          _changes.values
              .where((row) => row.deleted && !_pending.contains(row.key))
              .toList()
            ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      for (final row in oldTombstones.skip(128)) {
        _changes.remove(row.key);
        _attempted.remove(row.key);
      }
      await _prefs.setStringList(
        _favoritesKey,
        _favorites.values.map((item) => jsonEncode(item.toJson())).toList(),
      );
      await _prefs.setStringList(
        _historyKey,
        history.map((entry) => jsonEncode(entry.toJson())).toList(),
      );
      await _prefs.setStringList(
        _syncKey,
        _changes.values
            .map(
              (row) => jsonEncode({
                ...row.toJson(),
                'pending': _pending.contains(row.key),
                'attempted': _attempted.contains(row.key),
              }),
            )
            .toList(),
      );
    });
    _writeTail = job;
    return job;
  }

  @override
  void dispose() {
    _closed = true;
    super.dispose();
  }
}
