import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:enough_convert/windows.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'models.dart';
import 'subtitle_temporary_store.dart';
import 'subtitle_temporary_store_stub.dart'
    if (dart.library.io) 'subtitle_temporary_store_native.dart'
    if (dart.library.js_interop) 'subtitle_temporary_store_web.dart'
    as storage;
export 'subtitle_temporary_store.dart';

class PreparedSubtitle {
  const PreparedSubtitle({
    required this.uri,
    required this.text,
    required this.format,
    required this.label,
    required this.language,
  });
  final String uri, text, format, label, language;
}

class SubtitleService {
  SubtitleService({
    http.Client? client,
    SubtitleTemporaryStore? store,
    bool? web,
  }) : _client = client ?? http.Client(),
       _store = store ?? storage.createSubtitleTemporaryStore(),
       _web = web ?? kIsWeb;
  static const maximumBytes = 2 * 1024 * 1024;
  final http.Client _client;
  final SubtitleTemporaryStore _store;
  final bool _web;
  bool _closed = false;
  int _preparedCount = 0;
  int _inFlightLoads = 0;
  final _descriptorCache = <String, Future<PreparedSubtitle>>{};
  final _activeRequests = <Completer<void>>{};

  Future<PreparedSubtitle> loadDescriptor(SubtitleDescriptor descriptor) async {
    if (_closed) throw StateError('SUBTITLE_SERVICE_CLOSED');
    final uri = Uri.tryParse(descriptor.url);
    if (uri == null ||
        !isPublicSubtitleUri(uri) ||
        !['srt', 'vtt', 'ass'].contains(descriptor.format)) {
      throw const FormatException('INVALID_SUBTITLE_REFERENCE');
    }
    final names = descriptor.headers.keys.toList()..sort();
    final key = jsonEncode([
      descriptor.url,
      descriptor.format,
      for (final name in names) [name, descriptor.headers[name]],
    ]);
    final cached = _descriptorCache[key];
    if (cached != null) return cached;
    if (_preparedCount + _inFlightLoads >= 8) {
      throw StateError('SUBTITLE_SESSION_LIMIT');
    }
    ++_inFlightLoads;
    final pending = () async {
      try {
        final bytes = await _fetch(uri, headers: descriptor.headers);
        return await _prepare(
          bytes,
          descriptor.format,
          label: descriptor.label,
          language: descriptor.language,
        );
      } finally {
        --_inFlightLoads;
      }
    }();
    _descriptorCache[key] = pending;
    try {
      return await pending;
    } catch (_) {
      _descriptorCache.remove(key);
      rethrow;
    }
  }

  Future<PreparedSubtitle> loadLocalBytes(
    Uint8List bytes,
    String filename, {
    String label = 'ترجمة محلية',
    String language = 'ara',
  }) {
    final format = filename.toLowerCase().split('.').last;
    if (!['srt', 'vtt', 'ass'].contains(format)) {
      throw const FormatException('UNSUPPORTED_SUBTITLE_FORMAT');
    }
    return _prepare(bytes, format, label: label, language: language);
  }

  Future<PreparedSubtitle> _prepare(
    Uint8List bytes,
    String format, {
    required String label,
    required String language,
  }) async {
    if (_closed) throw StateError('SUBTITLE_SERVICE_CLOSED');
    if (_preparedCount >= 8) throw StateError('SUBTITLE_SESSION_LIMIT');
    if (bytes.isEmpty || bytes.length > maximumBytes) {
      throw const FormatException('SUBTITLE_SIZE_LIMIT');
    }
    final text = decodeSubtitleBytes(bytes);
    final normalized = normalizeSubtitleText(text, format, web: _web);
    final targetFormat = _web ? 'vtt' : format;
    final output = Uint8List.fromList(utf8.encode(normalized));
    if (output.length > maximumBytes) {
      throw const FormatException('SUBTITLE_SIZE_LIMIT');
    }
    _preparedCount++;
    String uri;
    try {
      uri = await _store.prepare(output, targetFormat);
    } catch (_) {
      --_preparedCount;
      rethrow;
    }
    return PreparedSubtitle(
      uri: uri,
      text: normalized,
      format: targetFormat,
      label: label,
      language: language,
    );
  }

  Future<List<SubtitleDescriptor>> searchStremio({
    required String imdbId,
    required bool workIdentityVerified,
    required String mediaType,
    int? season,
    int? episode,
  }) async {
    if (!workIdentityVerified ||
        !RegExp(r'^tt\d{7,10}$').hasMatch(imdbId) ||
        !['movie', 'series'].contains(mediaType) ||
        (mediaType == 'series' &&
            (season == null || season < 1 || episode == null || episode < 1)) ||
        (mediaType == 'movie' && (season != null || episode != null))) {
      throw const FormatException('VERIFIED_SUBTITLE_IDENTITY_REQUIRED');
    }
    final id = mediaType == 'series' ? '$imdbId:$season:$episode' : imdbId;
    final bytes = await _fetch(
      Uri.https('opensubtitles-v3.strem.io', '/subtitles/$mediaType/$id.json'),
      json: true,
    );
    final data = jsonDecode(utf8.decode(bytes));
    if (data is! Map || data['subtitles'] is! List) {
      throw const FormatException('INVALID_SUBTITLE_SEARCH_RESPONSE');
    }
    final results = <SubtitleDescriptor>[];
    for (final raw in (data['subtitles'] as List).whereType<Map>()) {
      if (results.length >= 30) break;
      if (!['ar', 'ara'].contains(raw['lang'])) continue;
      final uri = Uri.tryParse('${raw['url'] ?? ''}');
      if (uri == null ||
          !isPublicSubtitleUri(uri) ||
          !RegExp(r'^subs\d*\.strem\.io$').hasMatch(uri.host)) {
        continue;
      }
      final name = '${raw['subtitleFileName'] ?? ''}',
          ext = name.toLowerCase().split('.').last;
      if (!['srt', 'vtt', 'ass'].contains(ext)) continue;
      results.add(
        SubtitleDescriptor(
          id: '${raw['id'] ?? ''}',
          url: uri.toString(),
          format: ext,
          label: 'العربية • ${raw['movieReleaseName'] ?? name}',
          language: 'ara',
          provider: 'Stremio OpenSubtitles v3',
          origin: 'external',
          encodingHint: '${raw['SubEncoding'] ?? ''}',
        ),
      );
    }
    return List.unmodifiable(results);
  }

  Future<Uint8List> _fetch(
    Uri initial, {
    Map<String, String> headers = const {},
    bool json = false,
  }) async {
    if (_closed) throw StateError('SUBTITLE_SERVICE_CLOSED');
    if (headers.keys.any(
          (k) => !['Referer', 'Origin', 'User-Agent'].contains(k),
        ) ||
        headers.values.any(
          (v) => v.length > 2048 || v.contains(RegExp(r'[\r\n]')),
        )) {
      throw const FormatException('INVALID_SUBTITLE_HEADERS');
    }
    final clock = Stopwatch()..start();
    Duration remaining() {
      final left = const Duration(seconds: 20) - clock.elapsed;
      if (left <= Duration.zero) throw TimeoutException('SUBTITLE_TIMEOUT');
      return left;
    }

    var uri = initial;
    for (var redirects = 0; redirects <= 3; redirects++) {
      if (!isPublicSubtitleUri(uri)) {
        throw const FormatException('INVALID_SUBTITLE_REFERENCE');
      }
      final abort = Completer<void>();
      _activeRequests.add(abort);
      final request = http.AbortableRequest(
        'GET',
        uri,
        abortTrigger: abort.future,
      )..followRedirects = false;
      // Browsers own these request headers. A recorded native Referer does not
      // prove that a public caption is protected; try the direct CORS request
      // without forbidden headers and let the browser enforce access.
      if (!_web) request.headers.addAll(headers);
      StreamIterator<List<int>>? reader;
      try {
        final response = await _client.send(request).timeout(remaining());
        reader = StreamIterator(response.stream);
        if (_closed) throw StateError('SUBTITLE_SERVICE_CLOSED');
        if ([301, 302, 303, 307, 308].contains(response.statusCode)) {
          final location = response.headers['location'];
          if (redirects == 3 || location == null) {
            throw const FormatException('SUBTITLE_REDIRECT_LIMIT');
          }
          final next = uri.resolve(location);
          if (!isPublicSubtitleUri(next) || next.host != initial.host) {
            throw const FormatException('SUBTITLE_REDIRECT_REJECTED');
          }
          uri = next;
          continue;
        }
        if (response.statusCode != 200) {
          throw FormatException('SUBTITLE_HTTP_${response.statusCode}');
        }
        final type = (response.headers['content-type'] ?? '').toLowerCase();
        if (type.contains('text/html') ||
            type.contains('application/zip') ||
            type.startsWith('video/') ||
            (json && !type.contains('json'))) {
          throw const FormatException('INVALID_SUBTITLE_CONTENT_TYPE');
        }
        if ((response.contentLength ?? 0) > maximumBytes) {
          throw const FormatException('SUBTITLE_SIZE_LIMIT');
        }
        final builder = BytesBuilder(copy: false);
        var count = 0;
        while (await reader.moveNext().timeout(remaining())) {
          if (_closed) throw StateError('SUBTITLE_SERVICE_CLOSED');
          count += reader.current.length;
          if (count > maximumBytes) {
            throw const FormatException('SUBTITLE_SIZE_LIMIT');
          }
          builder.add(reader.current);
        }
        return builder.takeBytes();
      } finally {
        if (!abort.isCompleted) abort.complete();
        _activeRequests.remove(abort);
        await reader?.cancel();
      }
    }
    throw const FormatException('SUBTITLE_REDIRECT_LIMIT');
  }

  Future<void> dispose() async {
    if (_closed) return;
    _closed = true;
    for (final request in _activeRequests) {
      if (!request.isCompleted) request.complete();
    }
    _client.close();
    _descriptorCache.clear();
    await _store.close();
  }
}

String decodeSubtitleBytes(Uint8List bytes) {
  if (bytes.length >= 4 &&
      bytes[0] == 0x50 &&
      bytes[1] == 0x4b &&
      bytes[2] == 3 &&
      bytes[3] == 4) {
    throw const FormatException('ARCHIVE_SUBTITLES_UNSUPPORTED');
  }
  String text;
  if (bytes.length >= 2 &&
      ((bytes[0] == 0xff && bytes[1] == 0xfe) ||
          (bytes[0] == 0xfe && bytes[1] == 0xff))) {
    if ((bytes.length - 2).isOdd) {
      throw const FormatException('INVALID_UTF16_SUBTITLE');
    }
    final little = bytes[0] == 0xff, units = <int>[];
    for (var i = 2; i < bytes.length; i += 2) {
      units.add(
        little ? bytes[i] | bytes[i + 1] << 8 : bytes[i] << 8 | bytes[i + 1],
      );
    }
    for (var i = 0; i < units.length; i++) {
      if (units[i] >= 0xd800 && units[i] <= 0xdbff) {
        if (++i >= units.length || units[i] < 0xdc00 || units[i] > 0xdfff) {
          throw const FormatException('INVALID_UTF16_SUBTITLE');
        }
      } else if (units[i] >= 0xdc00 && units[i] <= 0xdfff) {
        throw const FormatException('INVALID_UTF16_SUBTITLE');
      }
    }
    text = String.fromCharCodes(units);
  } else {
    final body =
        bytes.length >= 3 &&
            bytes[0] == 0xef &&
            bytes[1] == 0xbb &&
            bytes[2] == 0xbf
        ? bytes.sublist(3)
        : bytes;
    if (body.length != bytes.length) {
      text = utf8.decode(body, allowMalformed: false);
    } else {
      try {
        text = utf8.decode(body, allowMalformed: false);
      } on FormatException {
        text = const Windows1256Codec(allowInvalid: false).decode(body);
      }
    }
  }
  if (text.contains('\u0000') || text.contains('\ufffd')) {
    throw const FormatException('INVALID_SUBTITLE_ENCODING');
  }
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

String normalizeSubtitleText(String text, String format, {bool web = false}) {
  if (RegExp(
    r'<\s*(?:!doctype|html|script|iframe)\b',
    caseSensitive: false,
  ).hasMatch(text)) {
    throw const FormatException('INVALID_SUBTITLE_TEXT');
  }
  if (format == 'ass') {
    if (!text.contains('[Script Info]') ||
        !text.contains('[Events]') ||
        !RegExp(r'^Dialogue:', multiLine: true).hasMatch(text)) {
      throw const FormatException('INVALID_ASS_SUBTITLE');
    }
    if (web) return _assToVtt(text);
    return text;
  }
  final vtt = format == 'vtt';
  if (vtt &&
      !RegExp(r'^WEBVTT(?:[ \t].*)?(?:\n|$)').hasMatch(text.trimLeft())) {
    throw const FormatException('INVALID_VTT_SUBTITLE');
  }
  final timing = RegExp(
    r'^(?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3}',
    multiLine: true,
  );
  if (!timing.hasMatch(text)) {
    throw const FormatException('INVALID_SUBTITLE_TIMING');
  }
  if (!web || vtt) return text;
  final converted = text.replaceAllMapped(
    timing,
    (m) => m[0]!.replaceAll(',', '.'),
  );
  return 'WEBVTT\n\n$converted';
}

int? _subtitleTime(String raw) {
  final m = RegExp(
    r'^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{2,3})$',
  ).firstMatch(raw.trim());
  if (m == null) return null;
  final minutes = int.parse(m[2]!), seconds = int.parse(m[3]!);
  if (minutes >= 60 || seconds >= 60) return null;
  return ((int.parse(m[1] ?? '0') * 60 + minutes) * 60 + seconds) * 1000 +
      int.parse(m[4]!) * (m[4]!.length == 2 ? 10 : 1);
}

String _vttTime(int milliseconds) {
  final hours = milliseconds ~/ 3600000,
      minutes = milliseconds ~/ 60000 % 60,
      seconds = milliseconds ~/ 1000 % 60,
      fraction = milliseconds % 1000;
  return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}.${fraction.toString().padLeft(3, '0')}';
}

/// Shift the original WebVTT each time. Native libmpv handles its own delay;
/// this is the equivalent timed-cue adjustment for the browser's text tracks.
String shiftVtt(String original, double seconds) {
  if (!seconds.isFinite ||
      seconds.abs() > 3600 ||
      !original.trimLeft().startsWith('WEBVTT')) {
    throw const FormatException('INVALID_SUBTITLE_DELAY');
  }
  final offset = (seconds * 1000).round(), output = <String>['WEBVTT'];
  final timing = RegExp(
    r'^((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})(.*)$',
  );
  for (final block in original.trim().split(RegExp(r'\n\s*\n'))) {
    final lines = block.split('\n');
    final index = lines.indexWhere((l) => timing.hasMatch(l));
    if (index < 0) continue;
    final m = timing.firstMatch(lines[index])!,
        start = _subtitleTime(m[1]!),
        end = _subtitleTime(m[2]!);
    if (start == null || end == null || end + offset <= 0 || end <= start) {
      continue;
    }
    lines[index] =
        '${_vttTime((start + offset).clamp(0, 0x7fffffff))} --> ${_vttTime(end + offset)}${m[3]}';
    output.add(lines.join('\n'));
  }
  return '${output.join('\n\n')}\n';
}

String _assToVtt(String text) {
  var inEvents = false;
  var fields = <String>[];
  final cues = <String>['WEBVTT'];
  for (final line in text.split('\n')) {
    if (line.startsWith('[')) {
      inEvents = line.trim() == '[Events]';
      continue;
    }
    if (!inEvents) continue;
    if (line.startsWith('Format:')) {
      fields = line
          .substring(7)
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .toList();
      continue;
    }
    if (!line.startsWith('Dialogue:') ||
        fields.isEmpty ||
        fields.last != 'text') {
      continue;
    }
    final values = line.substring(9).split(',');
    if (values.length < fields.length ||
        !fields.contains('start') ||
        !fields.contains('end')) {
      continue;
    }
    final start = _subtitleTime(values[fields.indexOf('start')]),
        end = _subtitleTime(values[fields.indexOf('end')]);
    if (start == null || end == null || end <= start) continue;
    final caption = values
        .skip(fields.length - 1)
        .join(',')
        .replaceAll(RegExp(r'\{[^}]*\}'), '')
        .replaceAll(r'\N', '\n')
        .replaceAll(r'\n', '\n')
        .replaceAll(r'\h', ' ')
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .trim();
    if (caption.isNotEmpty) {
      cues.add('${_vttTime(start)} --> ${_vttTime(end)}\n$caption');
    }
  }
  if (cues.length < 2) throw const FormatException('INVALID_ASS_SUBTITLE');
  return '${cues.join('\n\n')}\n';
}
