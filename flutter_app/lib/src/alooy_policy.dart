abstract interface class StreamBridge {
  Future<Uri> open(Uri target, Map<String, String> headers);
  Future<void> close();
}

void validateAlooyStream(Uri uri, Map<String, String> headers) {
  final referer = Uri.tryParse(headers['Referer'] ?? '');
  if (uri.scheme != 'https' ||
      uri.hasPort ||
      uri.userInfo.isNotEmpty ||
      uri.hasFragment ||
      !RegExp(r'^(?:vid\d+\.)?ujeklsj\.site$').hasMatch(uri.host) ||
      !RegExp(r'\.(mp4|webm)$', caseSensitive: false).hasMatch(uri.path) ||
      referer == null ||
      referer.origin != 'https://fa.alooytv16.xyz' ||
      referer.userInfo.isNotEmpty ||
      referer.hasFragment ||
      !RegExp(r'^/watch/[\w-]+\.html$').hasMatch(referer.path) ||
      referer.queryParameters.length != 1 ||
      referer.queryParametersAll["key"]?.length != 1 ||
      !RegExp(r'^[\w-]{1,120}$')
          .hasMatch(referer.queryParameters['key'] ?? '') ||
      headers['Origin'] != 'https://fa.alooytv16.xyz' ||
      (headers['User-Agent'] ?? '').isEmpty ||
      headers.values.any((v) => v.contains(RegExp(r'[\r\n]')))) {
    throw StateError('INVALID_ALOOY_STREAM');
  }
}
