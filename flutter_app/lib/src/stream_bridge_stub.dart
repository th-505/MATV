import 'alooy_policy.dart';

/// Browsers cannot open a loopback listener or inject forbidden headers.
class LocalStreamBridge implements StreamBridge {
  @override
  Future<Uri> open(Uri target, Map<String, String> headers) async =>
      throw UnsupportedError(
          'هذا المصدر متاح حاليًا في تطبيق الهاتف والتلفزيون');
  @override
  Future<void> close() async {}
}
