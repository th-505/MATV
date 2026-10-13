import 'package:video_player/video_player.dart';

enum RuntimeMediaKind { hls, mp4, mpegTs, unknown }

RuntimeMediaKind classifyRuntimeMediaType(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized == 'm3u8' ||
      normalized == 'hls' ||
      normalized.contains('mpegurl')) {
    return RuntimeMediaKind.hls;
  }
  if (normalized == 'mp4' || normalized.contains('video/mp4')) {
    return RuntimeMediaKind.mp4;
  }
  if (normalized == 'mpeg-ts' ||
      normalized == 'mpegts' ||
      normalized == 'ts' ||
      normalized.contains('video/mp2t')) {
    return RuntimeMediaKind.mpegTs;
  }
  return RuntimeMediaKind.unknown;
}

VideoFormat? videoFormatHintForRuntimeMedia(String value) {
  switch (classifyRuntimeMediaType(value)) {
    case RuntimeMediaKind.hls:
      return VideoFormat.hls;
    case RuntimeMediaKind.mp4:
    case RuntimeMediaKind.mpegTs:
    case RuntimeMediaKind.unknown:
      return null;
  }
}

String runtimeMediaLabel(String value) {
  switch (classifyRuntimeMediaType(value)) {
    case RuntimeMediaKind.hls:
      return 'HLS';
    case RuntimeMediaKind.mp4:
      return 'MP4';
    case RuntimeMediaKind.mpegTs:
      return 'MPEG-TS';
    case RuntimeMediaKind.unknown:
      return value.trim().isEmpty ? 'تلقائي' : value.trim();
  }
}

// Container selection is separate from codec support on each device.
bool usesExtendedMediaEngine(String mediaType, String path) {
  final type = mediaType.toLowerCase();
  return [
        'matroska',
        'matroska-webm',
        'mkv',
        'webm',
        'dash',
        'mpd',
        'mpeg-ts',
        'stream',
        'ts'
      ].contains(type) ||
      RegExp(r'\.(mkv|webm|mpd|ts|m2ts)$', caseSensitive: false).hasMatch(path);
}
