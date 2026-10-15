import 'dart:convert';
import 'dart:typed_data';
import 'subtitle_temporary_store.dart';

SubtitleTemporaryStore createSubtitleTemporaryStore() => _MemoryStore();

class _MemoryStore implements SubtitleTemporaryStore {
  @override
  Future<String> prepare(Uint8List bytes, String format) async =>
      'data:text/$format;charset=utf-8;base64,${base64Encode(bytes)}';
  @override
  Future<void> close() async {}
}
