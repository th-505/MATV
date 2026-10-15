import 'dart:typed_data';

abstract interface class SubtitleTemporaryStore {
  Future<String> prepare(Uint8List utf8Bytes, String format);
  Future<void> close();
}
