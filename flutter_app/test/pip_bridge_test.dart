import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/pip_bridge_native.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('najd/pip');
  final calls = <MethodCall>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return true;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  test('desktop uses a floating window while an unsupported iOS format stays unavailable', () async {
    final bridge = NajdPipBridge();
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    expect(await bridge.supported('mp4'), true);
    expect(bridge.needsNativeHandoff, false);
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(await bridge.supported('mkv'), false);
    expect(calls, isEmpty);
  });
  test('iOS handoff carries the exact clock, headers and session', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final bridge = NajdPipBridge();
    expect(bridge.needsNativeHandoff, true);
    expect(await bridge.supported('m3u8'), true);
    expect(
      await bridge.enter(
        url: 'https://media.example/test.m3u8',
        headers: {'Referer': 'https://source.example/'},
        position: const Duration(minutes: 20, seconds: 17),
        playing: true,
        rate: 1.5,
        width: 1920,
        height: 1080,
      ),
      true,
    );
    final args = calls.last.arguments as Map;
    expect(args['position_ms'], 1217000);
    expect(args['headers'], {'Referer': 'https://source.example/'});
    final event = bridge.events.first;
    await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .handlePlatformMessage(
          'najd/pip',
          const StandardMethodCodec().encodeMethodCall(
            MethodCall('pipState', {
              'session': args['session'],
              'active': false,
              'position_ms': 1269000,
              'duration_ms': 3600000,
              'playing': true,
            }),
          ),
          (_) {},
        );
    final restored = await event;
    expect(restored.position, const Duration(minutes: 21, seconds: 9));
    expect(restored.duration, const Duration(hours: 1));
    expect(restored.active, false);
    await bridge.close();
    expect((calls.last.arguments as Map)['session'], args['session']);
  });
  test('missing native implementation fails closed', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          channel,
          (_) async => throw MissingPluginException(),
        );
    expect(await NajdPipBridge().supported('mp4'), false);
  });
}
