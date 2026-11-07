import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/desktop_window_io.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('window_manager');
  bool fullscreen = true, onTop = false, broken = false;
  final bounds = <Map>[];
  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    fullscreen = true;
    onTop = false;
    broken = false;
    bounds.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          switch (call.method) {
            case 'isFullScreen':
              return fullscreen;
            case 'isAlwaysOnTop':
              return onTop;
            case 'setFullScreen':
              fullscreen = (call.arguments as Map)['isFullScreen'] as bool;
            case 'setAlwaysOnTop':
              onTop = (call.arguments as Map)['isAlwaysOnTop'] as bool;
            case 'getBounds':
              if (broken) throw PlatformException(code: 'unavailable');
              return {'x': 10.0, 'y': 20.0, 'width': 900.0, 'height': 600.0};
            case 'setBounds':
              bounds.add(call.arguments as Map);
          }
          return null;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  test('desktop floating mode restores fullscreen, normal bounds and always-on-top state', () async {
    final bridge = DesktopWindowBridge();
    expect(await bridge.enterMini(1920, 1080), true);
    expect(fullscreen, false);
    expect(onTop, true);
    expect(bounds.first['width'], 480);
    await bridge.leaveMini();
    expect(fullscreen, true);
    expect(onTop, false);
    expect(bounds.last['width'], 900);
  });
  test('old floating owner cannot restore over a newer player', () async {
    final first = DesktopWindowBridge(), second = DesktopWindowBridge();
    await first.enterMini(1920, 1080);
    await second.enterMini(1920, 1080);
    await first.leaveMini();
    expect(onTop, true);
    await second.leaveMini();
    expect(onTop, false);
    expect(fullscreen, true);
  });
  test(
    'a failed floating setup restores the previous fullscreen state',
    () async {
      broken = true;
      expect(await DesktopWindowBridge().enterMini(1920, 1080), false);
      expect(fullscreen, true);
      expect(onTop, false);
    },
  );
}
