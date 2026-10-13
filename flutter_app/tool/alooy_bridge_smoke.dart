import 'dart:io';
import 'package:mitv/src/stream_bridge_native.dart';

Future<void> main() async {
  final temp = await Directory.systemTemp.createTemp('matv-bridge-');
  HttpServer? upstream;
  LocalStreamBridge? bridge;
  final client = HttpClient();
  void check(bool v, String m) {
    if (!v) throw StateError(m);
  }

  try {
    final cert = await Process.run('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      '${temp.path}/key.pem',
      '-out',
      '${temp.path}/cert.pem',
      '-days',
      '1',
      '-subj',
      '/CN=vid8.ujeklsj.site'
    ]);
    check(cert.exitCode == 0, 'certificate setup');
    final context = SecurityContext()
      ..useCertificateChain('${temp.path}/cert.pem')
      ..usePrivateKey('${temp.path}/key.pem');
    upstream =
        await HttpServer.bindSecure(InternetAddress.loopbackIPv4, 0, context);
    final headers = {
      'Referer': 'https://fa.alooytv16.xyz/watch/test.html?key=abc123',
      'Origin': 'https://fa.alooytv16.xyz',
      'User-Agent': 'Mozilla/5.0'
    };
    var requests = 0;
    upstream.listen((request) async {
      requests++;
      for (final key in headers.keys) {
        check(request.headers.value(key) == headers[key], 'upstream $key');
      }
      final range = request.headers.value('range');
      request.response.statusCode = range == null ? 200 : 206;
      if (range != null) {
        check(range == 'bytes=10-13', 'range forwarding');
        request.response.headers.set('content-range', 'bytes 10-13/100');
      }
      request.response.headers.set('accept-ranges', 'bytes');
      request.response.headers.contentType = ContentType('video', 'mp4');
      request.response.contentLength = 4;
      request.response.add([1, 2, 3, 4]);
      await request.response.close();
    });
    // Fixture transport only: the production client never overrides TLS or DNS.
    client.findProxy = (_) => "DIRECT"; // Local fixture only.
    client.connectionFactory = (uri, host, port) => SecureSocket.startConnect(
        InternetAddress.loopbackIPv4, upstream!.port,
        onBadCertificate: (_) => true);
    client.badCertificateCallback =
        (_, host, __) => host == 'vid8.ujeklsj.site';
    bridge = LocalStreamBridge(client: client);
    final local = await bridge.open(
        Uri.parse('https://vid8.ujeklsj.site/test.mp4'), headers);
    final consumer = HttpClient()..findProxy = (_) => "DIRECT";
    try {
      final req = await consumer.getUrl(local);
      req.headers.set('range', 'bytes=10-13');
      final res = await req.close();
      check(res.statusCode == 206,
          '206 preserved: ${res.statusCode}, upstream requests=$requests');
      check(res.headers.value('content-range') == 'bytes 10-13/100',
          'content-range preserved');
      check(await res.fold<int>(0, (n, b) => n + b.length) == 4,
          'streamed bytes');
      final whole = await (await consumer.getUrl(local)).close();
      check(whole.statusCode == 200, '200 preserved');
      await whole.drain<void>();
      final wrong = local.replace(queryParameters: {
        ...local.queryParameters,
        'url': 'https://127.0.0.1/private.mp4'
      });
      final denied = await (await consumer.getUrl(wrong)).close();
      check(denied.statusCode == 403, 'unregistered URL denied');
      await denied.drain<void>();
      check(requests == 2, 'denied URL did not reach upstream');
    } finally {
      consumer.close(force: true);
    }
    await bridge.close();
    stdout.writeln(
        'Device stream bridge: Range, Referer/Origin/UA, 206/200, bytes and URL isolation passed');
  } finally {
    await bridge?.close();
    client.close(force: true);
    await upstream?.close(force: true);
    await temp.delete(recursive: true);
  }
}
