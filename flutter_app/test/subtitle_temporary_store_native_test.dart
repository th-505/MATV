import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/subtitle_temporary_store_native.dart' as storage;

void main() {
  test(
    'native subtitle store writes UTF8 only inside its temporary directory and cleans it',
    () async {
      final parent = await Directory.systemTemp.createTemp(
        'mitv-subtitle-store-test-',
      );
      final store = storage.createSubtitleTemporaryStore(
        temporaryDirectory: () async => parent,
      );
      try {
        const text = 'مرحبًا بالعالم';
        final path = await store.prepare(
          Uint8List.fromList(utf8.encode(text)),
          'srt',
        );
        final file = File.fromUri(Uri.parse(path));
        expect(file.parent.parent.path, parent.path);
        expect(await file.readAsString(encoding: utf8), text);
        await expectLater(
          store.prepare(Uint8List(0), '../escape'),
          throwsFormatException,
        );
        await store.close();
        expect(await parent.list().toList(), isEmpty);
        await expectLater(store.prepare(Uint8List(0), 'srt'), throwsStateError);
        await store.close();
      } finally {
        await store.close();
        await parent.delete(recursive: true);
      }
    },
  );

  test(
    'closing during path lookup waits and leaves no orphaned subtitle files',
    () async {
      final parent = await Directory.systemTemp.createTemp(
        'mitv-subtitle-race-test-',
      );
      final directory = Completer<Directory>();
      final store = storage.createSubtitleTemporaryStore(
        temporaryDirectory: () => directory.future,
      );
      try {
        final pending = store.prepare(Uint8List.fromList([65]), 'srt');
        final rejected = expectLater(pending, throwsStateError);
        final closed = store.close();
        directory.complete(parent);
        await rejected;
        await closed;
        expect(await parent.list().toList(), isEmpty);
      } finally {
        await store.close();
        await parent.delete(recursive: true);
      }
    },
  );
}
