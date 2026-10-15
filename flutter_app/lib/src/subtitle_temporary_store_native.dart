import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';
import 'subtitle_temporary_store.dart';

SubtitleTemporaryStore createSubtitleTemporaryStore({
  Future<Directory> Function()? temporaryDirectory,
}) => _NativeStore(temporaryDirectory ?? getTemporaryDirectory);

class _NativeStore implements SubtitleTemporaryStore {
  _NativeStore(this._temporaryDirectory);
  final Future<Directory> Function() _temporaryDirectory;
  Future<Directory>? _directory;
  final _pending = <Future<String>>{};
  bool _closed = false;
  int _counter = 0;
  Future<Directory> _create() async =>
      (await _temporaryDirectory()).createTemp('mitv-subtitles-');
  @override
  Future<String> prepare(Uint8List bytes, String format) {
    if (_closed) return Future.error(StateError('SUBTITLE_STORE_CLOSED'));
    if (!['srt', 'vtt', 'ass'].contains(format)) {
      return Future.error(const FormatException('UNSUPPORTED_SUBTITLE_FORMAT'));
    }
    final pending = () async {
      final directory = await (_directory ??= _create());
      if (_closed) throw StateError('SUBTITLE_STORE_CLOSED');
      final file = File('${directory.path}/subtitle-${_counter++}.$format');
      await file.writeAsBytes(bytes, flush: true);
      return file.uri.toString();
    }();
    _pending.add(pending);
    return pending.whenComplete(() => _pending.remove(pending));
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    // A pending path-provider lookup or write must finish before its directory
    // is removed; otherwise leaving the player can strand a subtitle file.
    await Future.wait(
      _pending.map((work) => work.then<void>((_) {}, onError: (Object _) {})),
    );
    final directory = _directory;
    _directory = null;
    if (directory != null) {
      Directory value;
      try {
        value = await directory;
      } catch (_) {
        return; // Creation failed, so no subtitle directory exists to remove.
      }
      if (await value.exists()) await value.delete(recursive: true);
    }
  }
}
