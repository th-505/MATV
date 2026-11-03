import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// A user-selected source catalogue is a preference, never a verified TMDB map.
/// Only stable references are stored here; no media URL, token or request header.
class SourceSelection {
  const SourceSelection({
    required this.workRef,
    required this.episodeRef,
    required this.episodeId,
    required this.title,
    required this.provider,
    this.season,
    this.number,
  });
  final String workRef, episodeRef, episodeId, title, provider;
  final int? season, number;
  Map<String, Object?> toJson() => {
    'work': workRef,
    'episode': episodeRef,
    'id': episodeId,
    'title': title,
    'provider': provider,
    'season': season,
    'number': number,
  };
  static SourceSelection? parse(Object? value) {
    if (value is! Map) return null;
    final work = '${value['work'] ?? ''}',
        episode = '${value['episode'] ?? ''}';
    if (!RegExp(r'^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$')
            .hasMatch(work) ||
        !RegExp('^${RegExp.escape(work)}(?:\\:s[0-9]{1,3}:e[0-9]{1,6})?\$')
            .hasMatch(episode)) {
      return null;
    }
    return SourceSelection(
      workRef: work,
      episodeRef: episode,
      episodeId: '${value['id'] ?? ''}',
      title: '${value['title'] ?? ''}',
      provider: '${value['provider'] ?? ''}',
      season: int.tryParse('${value['season']}'),
      number: int.tryParse('${value['number']}'),
    );
  }
}

class SourceSelectionMemory {
  static const key = 'najd.user-selected-source.v1';
  static bool canonical(String ref) =>
      RegExp(r'^tmdb:(movie|tv):[1-9][0-9]{0,9}$').hasMatch(ref);
  static Map<String, dynamic> _map(SharedPreferences prefs) {
    try {
      final decoded = jsonDecode(prefs.getString(key) ?? '{}');
      return decoded is Map ? decoded.cast<String, dynamic>() : {};
    } catch (_) {
      return {};
    }
  }

  static Future<SourceSelection?> read(String ref) async {
    if (!canonical(ref)) return null;
    return SourceSelection.parse(
      _map(await SharedPreferences.getInstance())[ref],
    );
  }

  static Future<void> remember(
    String canonicalRef,
    SourceSelection choice,
  ) async {
    if (!canonical(canonicalRef) ||
        SourceSelection.parse(choice.toJson()) == null) {
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final rows = _map(prefs);
    rows.remove(canonicalRef);
    rows[canonicalRef] = choice.toJson();
    while (rows.length > 200) {
      rows.remove(rows.keys.first);
    }
    await prefs.setString(key, jsonEncode(rows));
  }
}
