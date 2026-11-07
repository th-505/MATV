import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'pip_event.dart';
import 'desktop_window_stub.dart' if (dart.library.io) 'desktop_window_io.dart';

/// OS PiP only. Unsupported desktop platforms fail closed rather than faking it.
class NajdPipBridge {
  static const _channel = MethodChannel('najd/pip');
  static final _events = StreamController<Map>.broadcast();
  static bool _installed = false;
  final _desktop = DesktopWindowBridge();
  final String _session = '${DateTime.now().microsecondsSinceEpoch}';
  bool get needsNativeHandoff => defaultTargetPlatform == TargetPlatform.iOS;
  Stream<NajdPipEvent> get events => _events.stream
      .where((event) => event['session'] == _session)
      .map(
        (e) => NajdPipEvent(
          active: e['active'] == true,
          position: e['position_ms'] is num
              ? Duration(milliseconds: (e['position_ms'] as num).toInt())
              : null,
          duration: e['duration_ms'] is num
              ? Duration(milliseconds: (e['duration_ms'] as num).toInt())
              : null,
          playing: e['playing'] as bool?,
          command: e['command'] as String?,
        ),
      );
  void _install() {
    if (_installed) return;
    _installed = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'pipState' && call.arguments is Map) {
        _events.add(call.arguments as Map);
      }
    });
  }

  Future<bool> supported(String format) async {
    if (_desktop.miniSupported) return true;
    if (![
      TargetPlatform.android,
      TargetPlatform.iOS,
    ].contains(defaultTargetPlatform)) {
      return false;
    }
    if (needsNativeHandoff &&
        !['mp4', 'm3u8', 'hls'].contains(format.toLowerCase())) {
      return false;
    }
    _install();
    try {
      return await _channel.invokeMethod<bool>('supported') == true;
    } catch (_) {
      return false;
    }
  }

  Future<void> update({
    required bool playing,
    required double width,
    required double height,
  }) async {
    try {
      await _channel.invokeMethod('update', {
        'session': _session,
        'playing': playing,
        'width': width,
        'height': height,
      });
    } catch (_) {}
  }

  Future<bool> enter({
    required String url,
    required Map<String, String> headers,
    required Duration position,
    required bool playing,
    required double rate,
    required double width,
    required double height,
  }) async {
    if (_desktop.miniSupported) {
      final active = await _desktop.enterMini(width, height);
      if (active) _events.add({'session': _session, 'active': true});
      return active;
    }
    _install();
    try {
      return await _channel.invokeMethod<bool>('enter', {
            'session': _session,
            'url': url,
            'headers': headers,
            'position_ms': position.inMilliseconds,
            'playing': playing,
            'rate': rate,
            'width': width,
            'height': height,
          }) ==
          true;
    } catch (_) {
      return false;
    }
  }

  Future<void> close() async {
    if (_desktop.miniSupported) {
      await _desktop.leaveMini();
      _events.add({'session': _session, 'active': false});
      return;
    }
    try {
      await _channel.invokeMethod('close', {'session': _session});
    } catch (_) {}
  }
}
