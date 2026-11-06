import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS('window')
external JSObject get _window;
Future<bool> toggleBrowserFullscreen() async {
  try {
    final bridge = _window.getProperty<JSObject?>('NajdWebVideo'.toJS);
    if (bridge == null) return false;
    return (await bridge
            .callMethod<JSPromise<JSBoolean>>('enterFullscreen'.toJS)
            .toDart)
        .toDart;
  } catch (_) {
    return false;
  }
}

List<Map<String, dynamic>> browserQualityOptions() {
  try {
    final bridge = _window.getProperty<JSObject?>('NajdWebVideo'.toJS);
    final raw = bridge?.callMethod<JSAny?>('qualityOptions'.toJS)?.dartify();
    return raw is List
        ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : [];
  } catch (_) {
    return [];
  }
}

bool selectBrowserQuality(int id) {
  try {
    return _window
            .getProperty<JSObject?>('NajdWebVideo'.toJS)
            ?.callMethod<JSBoolean>('selectQuality'.toJS, id.toJS)
            .toDart ??
        false;
  } catch (_) {
    return false;
  }
}

Map<String, dynamic> browserVideoDiagnostics() {
  try {
    final raw = _window
        .getProperty<JSObject?>('NajdWebVideo'.toJS)
        ?.callMethod<JSAny?>('diagnostics'.toJS)
        ?.dartify();
    return raw is Map ? Map<String, dynamic>.from(raw) : {};
  } catch (_) {
    return {};
  }
}
