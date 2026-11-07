import 'package:flutter/foundation.dart';

import 'dart:ui';

import 'package:window_manager/window_manager.dart';

/// Serializes window ownership across episode/source route replacements.
class DesktopWindowBridge {
  static Future<void> _pending = Future<void>.value();
  static DesktopWindowBridge? _owner;
  static bool? _original;
  static DesktopWindowBridge? _miniOwner;
  static ({Rect bounds, bool fullscreen, bool onTop})? _miniState;
  bool get miniSupported => _supported;
  Future<bool> enterMini(double width, double height) async {
    if (!_supported) return false;
    return _serial(() async {
      bool? previousFullscreen;
      try {
        await windowManager.ensureInitialized();
        final fullscreen = await windowManager.isFullScreen();
        previousFullscreen = fullscreen;
        final onTop = await windowManager.isAlwaysOnTop();
        await windowManager.setFullScreen(false);
        final bounds = await windowManager.getBounds();
        _miniState ??= (bounds: bounds, fullscreen: fullscreen, onTop: onTop);
        _miniOwner = this;
        final ratio = width > 0 && height > 0
            ? (width / height).clamp(.5, 3)
            : 16 / 9;
        await windowManager.setSize(
          Size(
            bounds.width.clamp(240, 480).toDouble(),
            (bounds.width.clamp(240, 480) / ratio).clamp(180, 640).toDouble(),
          ),
        );
        await windowManager.setAlwaysOnTop(true);
        return true;
      } catch (_) {
        final owned = identical(_miniOwner, this);
        await _restoreMini();
        if (!owned && previousFullscreen != null) {
          try {
            await windowManager.setFullScreen(previousFullscreen);
          } catch (_) {}
        }
        return false;
      }
    });
  }

  Future<void> _restoreMini() async {
    if (!identical(_miniOwner, this)) return;
    final saved = _miniState;
    _miniOwner = null;
    _miniState = null;
    if (saved == null) return;
    try {
      await windowManager.setAlwaysOnTop(saved.onTop);
      await windowManager.setBounds(saved.bounds);
      await windowManager.setFullScreen(saved.fullscreen);
    } catch (_) {}
  }

  Future<void> leaveMini() async {
    if (_supported) await _serial(_restoreMini);
  }

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
