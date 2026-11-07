import 'package:flutter/foundation.dart';
import 'package:window_manager/window_manager.dart';

/// Serializes window ownership across episode/source route replacements.
class DesktopWindowBridge {
  static Future<void> _pending = Future<void>.value();
  static DesktopWindowBridge? _owner;
  static bool? _original;
  bool get _supported => [
    TargetPlatform.windows,
    TargetPlatform.macOS,
    TargetPlatform.linux,
  ].contains(defaultTargetPlatform);
  Future<T> _serial<T>(Future<T> Function() action) {
    final operation = _pending.then((_) => action());
    _pending = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return operation;
  }

  Future<bool> enter() async {
    if (!_supported) return false;
    return _serial(() async {
      try {
        await windowManager.ensureInitialized();
        _original ??= await windowManager.isFullScreen();
        _owner = this;
        await windowManager.setFullScreen(true);
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  Future<bool> setFullscreen(bool value) async {
    if (!_supported) return false;
    return _serial(() async {
      if (!identical(_owner, this)) return false;
      try {
        await windowManager.setFullScreen(value);
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  Future<void> leave() async {
    if (!_supported) return;
    await _serial(() async {
      if (!identical(_owner, this)) return;
      final previous = _original ?? false;
      _owner = null;
      _original = null;
      try {
        await windowManager.setFullScreen(previous);
      } catch (_) {}
    });
  }
}
