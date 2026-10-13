/// Parse the player's literal substitution table without executing JavaScript.
String miravdMediaUrl(String html) {
  final match = RegExp(
          r"""\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\s*\.split\(\s*'\|'\s*\)""")
      .firstMatch(html);
  var body = html;
  if (match != null) {
    final radix = int.parse(match[2]!);
    final count = int.parse(match[3]!);
    if (radix < 2 ||
        radix > 62 ||
        count > 4096 ||
        match[1]!.length > 100000 ||
        match[4]!.length > 100000) {
      throw const FormatException('INVALID_PLAYER_METADATA');
    }
    String literal(String value) =>
        value.replaceAllMapped(RegExp(r"""\\(['\\/])"""), (m) => m[1]!);
    body = literal(match[1]!);
    final words = literal(match[4]!).split('|');
    const digits =
        '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    String encode(int value) => value < radix
        ? digits[value]
        : encode(value ~/ radix) + digits[value % radix];
    for (var i = count - 1; i >= 0; i--) {
      if (i < words.length && words[i].isNotEmpty) {
        body = body.replaceAllMapped(
            RegExp('\\b${encode(i)}\\b'), (_) => words[i]);
      }
    }
  }
  final urls = RegExp(r'''https://[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?''')
      .allMatches(body)
      .map((m) => m[0]!);
  for (final value in urls) {
    final uri = Uri.tryParse(value);
    if (uri != null &&
        RegExp(r'^s\d+\.grzcdn\.com$').hasMatch(uri.host) &&
        uri.userInfo.isEmpty &&
        !uri.hasPort &&
        uri.path.startsWith('/hls/')) {
      return value;
    }
  }
  throw const FormatException('NO_PLAYABLE_MEDIA');
}
