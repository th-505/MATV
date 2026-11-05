import 'dart:convert';

import 'package:crypto/crypto.dart';

int? positiveWatchNumber(int? value) =>
    value != null && value > 0 ? value : null;

({int? season, int? episode}) watchNumbers(
  String reference, {
  int? season,
  int? episode,
}) {
  final match = RegExp(r'(?:^|:)s([1-9]\d*):e([1-9]\d*)$')
      .firstMatch(reference);
  return (
    season:
        positiveWatchNumber(season) ??
        (match == null ? null : int.tryParse(match[1]!)),
    episode:
        positiveWatchNumber(episode) ??
        (match == null ? null : int.tryParse(match[2]!)),
  );
}

/// Keep the historical work::episode layout, but never use an empty/reused
/// provider ID as the identity of a numbered episode. Unknown numbering stays unknown.
String stableWatchEpisodeId({
  required String contentRef,
  required String episodeId,
  required String playbackRef,
  int? season,
  int? episode,
}) {
  final numbers = watchNumbers(playbackRef, season: season, episode: episode);
  if (numbers.season != null && numbers.episode != null) {
    return 's${numbers.season}:e${numbers.episode}';
  }
  if (numbers.episode == null && episodeId.isEmpty) return '';
  if (numbers.season == null &&
      (playbackRef.isEmpty || playbackRef == contentRef) &&
      episodeId.isNotEmpty &&
      utf8.encode(episodeId).length <= 1024) {
    return episodeId;
  }
  final reference = playbackRef.isNotEmpty && playbackRef != contentRef
      ? playbackRef
      : episodeId;
  if (reference.isEmpty && numbers.episode == null) return '';
  final digest = sha256.convert(
    utf8.encode(
      reference.isNotEmpty ? reference : 'episode:${numbers.episode}',
    ),
  );
  return '${numbers.season == null ? '' : 's${numbers.season}:'}r$digest';
}
