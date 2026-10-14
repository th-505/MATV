import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class ExternalSubtitleItem {
  const ExternalSubtitleItem({
    required this.id,
    required this.url,
    required this.lang,
    required this.fileName,
    this.encoding = 'UTF-8',
  });

  final String id;
  final String url;
  final String lang;
  final String fileName;
  final String encoding;

  String get languageLabel {
    switch (lang.toLowerCase()) {
      case 'ara':
      case 'ar':
        return 'العربية (Arabic)';
      case 'eng':
      case 'en':
        return 'الإنجليزية (English)';
      case 'fre':
      case 'fra':
      case 'fr':
        return 'الفرنسية (French)';
      case 'spa':
      case 'es':
        return 'الإسبانية (Spanish)';
      case 'tur':
      case 'tr':
        return 'التركية (Turkish)';
      default:
        return lang.toUpperCase();
    }
  }

  factory ExternalSubtitleItem.fromJson(Map<String, dynamic> json) {
    return ExternalSubtitleItem(
      id: '${json['id'] ?? ''}',
      url: '${json['url'] ?? ''}',
      lang: '${json['lang'] ?? 'und'}',
      fileName: '${json['subtitleFileName'] ?? json['movieReleaseName'] ?? 'Subtitle'}',
      encoding: '${json['SubEncoding'] ?? 'UTF-8'}',
    );
  }
}

class SubtitlesService {
  SubtitlesService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  static const String _stremioBase = 'https://opensubtitles-v3.strem.io/subtitles';

  /// Queries Stremio OpenSubtitles v3 API for movie or series subtitles by IMDb ID.
  Future<List<ExternalSubtitleItem>> fetchSubtitles({
    required String imdbId,
    int? season,
    int? episode,
  }) async {
    final cleanId = imdbId.trim();
    if (!cleanId.startsWith('tt')) {
      return const [];
    }

    final isSeries = season != null && episode != null;
    final path = isSeries
        ? 'series/$cleanId:$season:$episode.json'
        : 'movie/$cleanId.json';

    final uri = Uri.parse('$_stremioBase/$path');

    try {
      final response = await _client
          .get(uri, headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        return const [];
      }

      final data = jsonDecode(response.body);
      if (data is! Map || data['subtitles'] is! List) {
        return const [];
      }

      final rawList = data['subtitles'] as List;
      final items = <ExternalSubtitleItem>[];

      for (final raw in rawList) {
        if (raw is Map<String, dynamic> && raw['url'] != null) {
          final item = ExternalSubtitleItem.fromJson(raw);
          if (item.url.isNotEmpty) {
            items.add(item);
          }
        }
      }

      // Prioritize Arabic (ara) first, then English (eng), then others
      items.sort((a, b) {
        final aPriority = a.lang == 'ara' ? 0 : (a.lang == 'eng' ? 1 : 2);
        final bPriority = b.lang == 'ara' ? 0 : (b.lang == 'eng' ? 1 : 2);
        return aPriority.compareTo(bPriority);
      });

      return items;
    } catch (_) {
      return const [];
    }
  }

  /// Converts downloaded subtitle bytes to UTF-8 string with Windows-1256 (Arabic) fallback.
  static String decodeSubtitleBytes(Uint8List bytes) {
    try {
      // 1. Try standard UTF-8 decoding
      return utf8.decode(bytes);
    } on FormatException {
      // 2. Fallback: decode using Windows-1256 (CP1256) mapping
      return _decodeWindows1256(bytes);
    }
  }

  static String _decodeWindows1256(Uint8List bytes) {
    final buffer = StringBuffer();
    for (final byte in bytes) {
      if (byte < 0x80) {
        buffer.writeCharCode(byte);
      } else {
        final mapped = _cp1256Map[byte - 0x80];
        buffer.writeCharCode(mapped);
      }
    }
    return buffer.toString();
  }

  // Windows-1256 (CP1256) Unicode mapping table for bytes 0x80-0xFF
  static const List<int> _cp1256Map = [
    0x20AC, 0x067E, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, // 80-87
    0x02C6, 0x2030, 0x0679, 0x2039, 0x0152, 0x0686, 0x0698, 0x0688, // 88-8F
    0x06AF, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, // 90-97
    0x06A9, 0x2122, 0x0691, 0x203A, 0x0153, 0x200C, 0x200D, 0x06BA, // 98-9F
    0x00A0, 0x060C, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7, // A0-A7
    0x00A8, 0x00A9, 0x0647, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF, // A8-AF
    0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7, // B0-B7
    0x00B8, 0x00B9, 0x061B, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x061F, // B8-BF
    0x06C1, 0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0626, 0x0627, // C0-C7
    0x0628, 0x0629, 0x062A, 0x062B, 0x062C, 0x062D, 0x062E, 0x062F, // C8-CF
    0x0630, 0x0631, 0x0632, 0x0633, 0x0634, 0x0635, 0x0636, 0x00D7, // D0-D7
    0x0637, 0x0638, 0x0639, 0x063A, 0x0640, 0x0641, 0x0642, 0x0643, // D8-DF
    0x00E0, 0x0644, 0x00E2, 0x0645, 0x0646, 0x0647, 0x0648, 0x00E7, // E0-E7
    0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x0649, 0x064A, 0x00EE, 0x00EF, // E8-EF
    0x064B, 0x064C, 0x064D, 0x064E, 0x064F, 0x0650, 0x0651, 0x00F7, // F0-F7
    0x0652, 0x00F9, 0x0653, 0x00FB, 0x00FC, 0x200E, 0x200F, 0x06D2, // F8-FF
  ];

  void close() {
    _client.close();
  }
}
