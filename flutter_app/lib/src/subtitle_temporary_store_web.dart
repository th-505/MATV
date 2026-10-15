import 'dart:js_interop';
import 'dart:typed_data';
import 'subtitle_temporary_store.dart';

@JS('Blob')
extension type _SubtitleBlob._(JSObject _) implements JSObject {
  external factory _SubtitleBlob(JSArray<JSAny> parts, JSObject options);
}
@JS('URL.createObjectURL')
external JSString _createObjectURL(_SubtitleBlob blob);
@JS('URL.revokeObjectURL')
external void _revokeObjectURL(JSString url);

SubtitleTemporaryStore createSubtitleTemporaryStore() => _WebStore();

class _WebStore implements SubtitleTemporaryStore {
  final _urls = <JSString>[];
  bool _closed = false;
  @override
  Future<String> prepare(Uint8List bytes, String format) async {
    if (_closed) throw StateError('SUBTITLE_STORE_CLOSED');
    if (format != 'vtt') throw StateError('WEB_SUBTITLE_REQUIRES_VTT');
    final blob = _SubtitleBlob(
      <JSAny>[bytes.toJS].toJS,
      {'type': 'text/vtt;charset=utf-8'}.jsify() as JSObject,
    );
    final url = _createObjectURL(blob);
    _urls.add(url);
    return url.toDart;
  }

  @override
  Future<void> close() async {
    _closed = true;
    for (final url in _urls) {
      _revokeObjectURL(url);
    }
    _urls.clear();
  }
}
