import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'alooy_policy.dart';

/// One registered upstream per player. Never buffers a complete media file.
class LocalStreamBridge implements StreamBridge {
  LocalStreamBridge({HttpClient? client, this.trustedEdge = false})
      : _client = client ?? HttpClient() {
    _client.autoUncompress = false;
  }
  final bool trustedEdge;
  HttpServer? _server;
  final HttpClient _client;
  final _active = <HttpClientRequest>{};
  bool _closed = false;
  @override
  Future<Uri> open(Uri target, Map<String, String> headers) async {
    if (trustedEdge) {
      validateEdgeStream(target, headers);
    } else {
      validateAlooyStream(target, headers);
    }
    if (_closed || _server != null) throw StateError('BRIDGE_ALREADY_OPEN');
    final token = List.generate(24, (_) => Random.secure().nextInt(256))
        .map((n) => n.toRadixString(16).padLeft(2, '0'))
        .join();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    if (_closed) {
      await server.close(force: true);
      throw StateError('BRIDGE_CLOSED');
    }
    _server = server;
    server.listen((request) async {
      HttpClientRequest? activeRequest;
      try {
        if (request.uri.path != '/$token/stream' ||
            request.uri.queryParameters['url'] != target.toString() ||
            request.uri.queryParameters['ref'] != headers['Referer'] ||
            !['GET', 'HEAD'].contains(request.method) ||
            request.headers.value('origin') != null) {
          request.response.statusCode = HttpStatus.forbidden;
          await request.response.close();
          return;
        }
        var uri = target;
        for (var redirect = 0; redirect <= 3; redirect++) {
          if (trustedEdge) {
            validateEdgeStream(uri, headers);
            if (uri.host != target.host) {
              throw StateError('BRIDGE_REDIRECT_HOST');
            }
          } else {
            validateAlooyStream(uri, headers);
          }
          final upstream = await _client
              .openUrl(request.method, uri)
              .timeout(const Duration(seconds: 15));
          activeRequest = upstream;
          _active.add(upstream);
          upstream.followRedirects = false;
          headers.forEach(upstream.headers.set);
          upstream.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
          final range = request.headers.value(HttpHeaders.rangeHeader);
          final ifRange = request.headers.value(HttpHeaders.ifRangeHeader);
          if (range != null) {
            upstream.headers.set(HttpHeaders.rangeHeader, range);
          }
          if (ifRange != null) {
            upstream.headers.set(HttpHeaders.ifRangeHeader, ifRange);
          }
          final response =
              await upstream.close().timeout(const Duration(seconds: 20));
          if ([301, 302, 303, 307, 308].contains(response.statusCode)) {
            _active.remove(upstream);
            final location = response.headers.value(HttpHeaders.locationHeader);
            upstream.abort();
            if (location == null || redirect == 3) {
              throw StateError('BRIDGE_REDIRECT');
            }
            uri = uri.resolve(location);
            continue;
          }
          request.response.statusCode = response.statusCode;
          for (final key in [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'etag',
            'last-modified',
            'content-encoding'
          ]) {
            final value = response.headers.value(key);
            if (value != null) request.response.headers.set(key, value);
          }
          request.response.headers.set('cache-control', 'no-store');
          try {
            await request.response
                .addStream(response.timeout(const Duration(seconds: 30)));
            await request.response.close();
          } finally {
            _active.remove(upstream);
            upstream.abort();
          }
          return;
        }
      } catch (_) {
        try {
          request.response.statusCode = HttpStatus.badGateway;
          await request.response.close();
        } catch (_) {
          (await request.response.detachSocket()).destroy();
        }
      } finally {
        if (activeRequest != null) {
          _active.remove(activeRequest);
          activeRequest.abort();
        }
      }
    });
    return Uri(
        scheme: 'http',
        host: '127.0.0.1',
        port: server.port,
        path: '/$token/stream',
        queryParameters: {
          'url': target.toString(),
          'ref': headers['Referer']!
        });
  }

  @override
  Future<void> close() async {
    _closed = true;
    for (final request in _active.toList()) {
      request.abort();
    }
    _active.clear();
    _client.close(force: true);
    await _server?.close(force: true);
  }
}
