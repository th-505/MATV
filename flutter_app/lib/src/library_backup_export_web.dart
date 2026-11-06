import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS('window')
external JSObject get _window;
@JS('document')
external JSObject get _document;
Future<void> exportLibraryJson(String text, String name) async {
  final blob = _window
      .getProperty<JSFunction>('Blob'.toJS)
      .callAsConstructor<JSObject>(
        [text.toJS].toJS,
        {'type': 'application/json;charset=utf-8'}.jsify(),
      );
  final urls = _window.getProperty<JSObject>('URL'.toJS);
  final url = urls.callMethod<JSString>('createObjectURL'.toJS, blob);
  final anchor = _document.callMethod<JSObject>('createElement'.toJS, 'a'.toJS);
  anchor.setProperty('href'.toJS, url);
  anchor.setProperty('download'.toJS, name.toJS);
  _document
      .getProperty<JSObject>('body'.toJS)
      .callMethod<JSAny?>('appendChild'.toJS, anchor);
  anchor.callMethod<JSAny?>('click'.toJS);
  anchor.callMethod<JSAny?>('remove'.toJS);
  Future.delayed(
    const Duration(seconds: 5),
    () => urls.callMethod<JSAny?>('revokeObjectURL'.toJS, url),
  );
}
