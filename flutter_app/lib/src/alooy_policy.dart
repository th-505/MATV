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

// New domains are trusted only after an authenticated HTTPS edge response.
// The player API additionally requires registration of the returned URL.
bool isPublicMediaUri(Uri uri) =>
    uri.scheme == 'https' &&
    !uri.hasPort &&
    uri.userInfo.isEmpty &&
    !uri.hasFragment &&
    RegExp(r'^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$').hasMatch(uri.host) &&
    !RegExp(r'^(?:\d+\.){3}\d+$').hasMatch(uri.host) &&
    !uri.host.endsWith('.localhost') &&
    !uri.host.endsWith('.local') &&
    !uri.host.endsWith('.internal') &&
    RegExp(r'\.(m3u8|mp4|webm|mkv|mpd|ts|m2ts)$', caseSensitive: false)
        .hasMatch(uri.path);

void validateEdgeStream(Uri uri, Map<String, String> headers) {
  final ref = Uri.tryParse(headers['Referer'] ?? '');
  if (!isPublicMediaUri(uri) ||
      !RegExp(r'\.(mp4|webm)$', caseSensitive: false).hasMatch(uri.path) ||
      ref == null ||
      ref.scheme != 'https' ||
      ref.userInfo.isNotEmpty ||
      ref.hasPort ||
      ref.host.isEmpty ||
      ref.hasFragment ||
      headers['Origin'] != ref.origin ||
      (headers['User-Agent'] ?? '').isEmpty ||
      headers.keys
          .any((key) => !['Referer', 'Origin', 'User-Agent'].contains(key)) ||
      headers.values.any((v) => v.contains(RegExp(r'[\r\n]')))) {
    throw StateError('INVALID_EDGE_STREAM');
  }
}
