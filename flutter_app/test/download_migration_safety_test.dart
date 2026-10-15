import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/download_directory_migration.dart';

void main() {
  late Directory root;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('mitv-migration-safety');
  });
  tearDown(() async {
    await root.delete(recursive: true);
  });

  test(
    'first launch without Documents leaves directory creation to download',
    () async {
      final documents = Directory('${root.path}/Documents');
      final destination = await migrateDownloadDirectory(documents);
      expect(destination.path, '${documents.path}/MITV/Downloads');
      expect(await documents.exists(), isFalse);
    },
  );

  test(
    'legacy migration keeps conflicts and moves only regular local files',
    () async {
      final legacy = await Directory(
        '${root.path}/AlQahtani/Downloads',
      ).create(recursive: true);
      final current = await Directory(
        '${root.path}/MITV/Downloads',
      ).create(recursive: true);
      await File('${legacy.path}/episode.mp4').writeAsString('old');
      await File('${current.path}/episode.mp4').writeAsString('current');
      await File(
        '${legacy.path}/.qahtani-resume.part',
      ).writeAsString('partial');
      final destination = await migrateDownloadDirectory(root);
      expect(destination.path, current.path);
      expect(await File('${legacy.path}/episode.mp4').readAsString(), 'old');
      expect(
        await File('${current.path}/episode.mp4').readAsString(),
        'current',
      );
      expect(
        await File('${current.path}/.mitv-resume.part').readAsString(),
        'partial',
      );
    },
  );

  for (final substituteParent in [false, true]) {
    test('legacy ${substituteParent ? 'parent' : 'Downloads'} symlink cannot '
        'move files out of another directory', () async {
      final outside = await Directory(
        '${root.path}/outside/Downloads',
      ).create(recursive: true);
      final original = await File(
        '${outside.path}/private.mp4',
      ).writeAsString('preserved');
      if (substituteParent) {
        await Link('${root.path}/AlQahtani').create(outside.parent.path);
      } else {
        await Directory('${root.path}/AlQahtani').create();
        await Link('${root.path}/AlQahtani/Downloads').create(outside.path);
      }
      final destination = await migrateDownloadDirectory(root);
      expect(await original.readAsString(), 'preserved');
      expect(await destination.exists(), isFalse);
    }, skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false);
  }

  test(
    'destination symlinks and dangling conflicts cannot be overwritten',
    () async {
      final legacy = await Directory(
        '${root.path}/AlQahtani/Downloads',
      ).create(recursive: true);
      final current = await Directory(
        '${root.path}/MITV/Downloads',
      ).create(recursive: true);
      final original = await File(
        '${legacy.path}/movie.mp4',
      ).writeAsString('old');
      final conflict = await Link(
        '${current.path}/movie.mp4',
      ).create('${root.path}/missing.mp4');
      await migrateDownloadDirectory(root);
      expect(await original.readAsString(), 'old');
      expect(
        await FileSystemEntity.type(conflict.path, followLinks: false),
        FileSystemEntityType.link,
      );
      await current.delete(recursive: true);
      await Link(current.path).create('${root.path}/AlQahtani/Downloads');
      await expectLater(
        migrateDownloadDirectory(root),
        throwsA(isA<FileSystemException>()),
      );
      expect(await original.readAsString(), 'old');
    },
    skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false,
  );
}
