import 'package:flutter/material.dart';

import 'library_store.dart';
import 'najd_panels.dart';

enum ResumeAction { resume, restart }

String resumeClock(int milliseconds) {
  final seconds = milliseconds ~/ 1000;
  final h = seconds ~/ 3600, m = seconds % 3600 ~/ 60, s = seconds % 60;
  final tail =
      '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  return h > 0 ? '$h:$tail' : tail;
}

Future<ResumeAction?> showResumeChoice(
  BuildContext context,
  WatchEntry entry, {
  bool differentSource = false,
}) => showNajdOptions<ResumeAction>(
  context,
  title: 'متابعة المشاهدة',
  description:
      'توقفت عند ${resumeClock(entry.positionMs)}'
      '${entry.episodeNumber != null ? ' • الحلقة ${entry.episodeNumber}' : ''}'
      '${differentSource ? '\nالمصدر الحالي مختلف؛ قد يختلف توقيت المشهد.' : ''}',
  icon: Icons.history,
  options: const [
    NajdOption(
      ResumeAction.resume,
      'استئناف التشغيل',
      selected: true,
      icon: Icons.play_arrow,
    ),
    NajdOption(ResumeAction.restart, 'البدء من جديد', icon: Icons.replay),
  ],
);

/// Exact persisted request first; never infer a new episode from list position.
String historyPlaybackReference(WatchEntry entry) {
  if (entry.playbackRef.isNotEmpty) return entry.playbackRef;
  final ref = entry.contentRef;
  final season = entry.metadata?.season, episode = entry.episodeNumber;
  if (season != null &&
      season > 0 &&
      episode != null &&
      episode > 0 &&
      (RegExp(r'^source:[a-z0-9_-]{2,30}:[a-f0-9]{24}$').hasMatch(ref) ||
          RegExp(r'^tmdb:tv:[1-9]\d*$').hasMatch(ref))) {
    return '$ref:s$season:e$episode';
  }
  if (entry.selectedSourceRef.isNotEmpty) return entry.selectedSourceRef;
  return ref;
}
