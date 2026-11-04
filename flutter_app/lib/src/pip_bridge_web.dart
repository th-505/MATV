import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'pip_event.dart';

@JS('document')
external JSObject get _document;

class NajdPipBridge {
  final _events = StreamController<NajdPipEvent>.broadcast();
  bool get needsNativeHandoff => false;
  Stream<NajdPipEvent> get events => _events.stream;
  JSObject? _video;
  JSFunction? _leave, _presentation;
  JSObject? _find() =>
      _document.callMethod<JSAny?>('querySelector'.toJS, 'video'.toJS)
          as JSObject?;
  Future<bool> supported(String format) async {
    final video = _find();
    return video != null &&
        (_document
                    .getProperty<JSAny?>('pictureInPictureEnabled'.toJS)
                    ?.dartify() ==
                true ||
            video.has('webkitSetPresentationMode'));
  }

  Future<void> update({
    required bool playing,
    required double width,
    required double height,
  }) async {}
  Future<bool> enter({
    required String url,
    required Map<String, String> headers,
    required Duration position,
    required bool playing,
    required double rate,
    required double width,
    required double height,
  }) async {
    final video = _find();
    if (video == null) return false;
    _video = video;
    try {
      _leave ??= ((JSAny? _) {
        _events.add(const NajdPipEvent(active: false));
      }).toJS;
      video.callMethod<JSAny?>(
        'addEventListener'.toJS,
        'leavepictureinpicture'.toJS,
        _leave,
      );
      if (video.has('requestPictureInPicture')) {
        await video
            .callMethod<JSPromise<JSAny?>>('requestPictureInPicture'.toJS)
            .toDart;
      } else if (video.has('webkitSetPresentationMode')) {
        _presentation ??= ((JSAny? _) {
          final active =
              video
                  .getProperty<JSAny?>('webkitPresentationMode'.toJS)
                  ?.dartify() ==
              'picture-in-picture';
          _events.add(NajdPipEvent(active: active));
        }).toJS;
        video.callMethod<JSAny?>(
          'addEventListener'.toJS,
          'webkitpresentationmodechanged'.toJS,
          _presentation,
        );
        video.callMethod<JSAny?>(
          'webkitSetPresentationMode'.toJS,
          'picture-in-picture'.toJS,
        );
      } else {
        return false;
      }
      final active =
          video.has('requestPictureInPicture') ||
          video.getProperty<JSAny?>('webkitPresentationMode'.toJS)?.dartify() ==
              'picture-in-picture';
      if (active) _events.add(const NajdPipEvent(active: true));
      return active;
    } catch (_) {
      return false;
    }
  }

  Future<void> close() async {
    try {
      if (_document.getProperty<JSAny?>('pictureInPictureElement'.toJS) !=
          null) {
        await _document
            .callMethod<JSPromise<JSAny?>>('exitPictureInPicture'.toJS)
            .toDart;
      } else if (_video?.has('webkitSetPresentationMode') == true) {
        _video!.callMethod<JSAny?>(
          'webkitSetPresentationMode'.toJS,
          'inline'.toJS,
        );
      }
      if (_presentation != null) {
        _video?.callMethod<JSAny?>(
          'removeEventListener'.toJS,
          'webkitpresentationmodechanged'.toJS,
          _presentation,
        );
      }
      if (_leave != null) {
        _video?.callMethod<JSAny?>(
          'removeEventListener'.toJS,
          'leavepictureinpicture'.toJS,
          _leave,
        );
      }
    } catch (_) {}
  }
}
