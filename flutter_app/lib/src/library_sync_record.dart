import 'dart:convert';

/// A metadata-only change. Auth UID is supplied by the authenticated adapter,
/// never by a device UUID or by client-editable metadata.
class LibrarySyncRecord {
  LibrarySyncRecord({
    required this.kind,
    required this.itemKey,
    required Map<String, dynamic> metadata,
    required this.updatedAt,
    this.deleted = false,
    this.userId = '',
    this.revision = 0,
  }) : metadata = Map.unmodifiable(metadata);
  final String kind;
  final String itemKey;
  final Map<String, dynamic> metadata;
  final DateTime updatedAt;
  final bool deleted;
  final String userId;
  final int revision;
  String get key => '$kind::$itemKey';
  bool get fitsCloudBudget =>
      utf8.encode(jsonEncode(metadata)).length <= 16384 &&
      utf8.encode(itemKey).length <= 1536 &&
      _safeMetadata(metadata);
  Map<String, dynamic> toJson({bool includeUserId = false}) => {
    if (includeUserId) 'user_id': userId,
    'kind': kind,
    'item_key': itemKey,
    'metadata': metadata,
    'updated_at': updatedAt.toUtc().toIso8601String(),
    'deleted': deleted,
  };
  factory LibrarySyncRecord.fromJson(Map<String, dynamic> json) {
    final kind = '${json['kind'] ?? ''}';
    final itemKey = '${json['item_key'] ?? ''}';
    final updatedAt = DateTime.tryParse('${json['updated_at'] ?? ''}');
    if (!{'favorite', 'history'}.contains(kind) ||
        itemKey.isEmpty ||
        utf8.encode(itemKey).length > 1536 ||
        updatedAt == null ||
        json['metadata'] is! Map) {
      throw const FormatException('INVALID_LIBRARY_CHANGE');
    }
    return LibrarySyncRecord(
      kind: kind,
      itemKey: itemKey,
      metadata: (json['metadata'] as Map).cast<String, dynamic>(),
      updatedAt: updatedAt.toUtc(),
      deleted: json['deleted'] == true,
      userId: '${json['user_id'] ?? ''}',
      revision: int.tryParse('${json['sync_revision'] ?? 0}') ?? 0,
    );
  }
}

// Match the database guard before a batch leaves the device. One malformed
// item must not repeatedly reject an otherwise valid metadata-only batch.
bool _safeMetadata(dynamic value, [int depth = 0]) {
  if (depth > 16) return false;
  if (value is Map) {
    const forbidden = {
      'headers',
      'playbackheaders',
      'resolverheaders',
      'authorization',
      'apikey',
      'secret',
      'token',
      'streamurl',
      'mediaurl',
      'mediapath',
      'mediasrc',
      'iframeurl',
      'resolverurl',
      'wrapperurl',
      'mediasources',
      'streams',
      'streamsources',
      'accesstoken',
      'refreshtoken',
    };
    return value.entries.every(
      (entry) =>
          !forbidden.contains(
            '${entry.key}'.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), ''),
          ) &&
          _safeMetadata(entry.value, depth + 1),
    );
  }
  if (value is Iterable) {
    return value.every((entry) => _safeMetadata(entry, depth + 1));
  }
  if (value is String) {
    return !RegExp(
          r'https?://[^\s]+\.(m3u8|mp4|mkv|mpd|webm|ts)([?/#]|$)',
          caseSensitive: false,
        ).hasMatch(value) &&
        !RegExp(
          r'https?://[^\s]+[?&](token|signature|authorization|access_token)=',
          caseSensitive: false,
        ).hasMatch(value);
  }
  return value == null || value is num || value is bool;
}
