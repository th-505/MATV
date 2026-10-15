import 'dart:io';

/// Moves the previous library only when it is accessible in the same sandbox.
/// Existing destination files are never overwritten; conflicts stay in place.
Future<Directory> migrateDownloadDirectory(Directory documents) async {
  if (!await documents.exists()) {
    // A first launch may not have created Documents yet. Its caller creates
    // the new download directory only when an actual download starts.
    return Directory(
      '${documents.path}${Platform.pathSeparator}MITV'
      '${Platform.pathSeparator}Downloads',
    );
  }
  final root = await documents.resolveSymbolicLinks();
  final currentBrand = Directory('$root${Platform.pathSeparator}MITV');
  final destination = Directory(
    '${currentBrand.path}${Platform.pathSeparator}Downloads',
  );
  final legacyBrand = Directory('$root${Platform.pathSeparator}AlQahtani');
  final legacy = Directory(
    '${legacyBrand.path}${Platform.pathSeparator}Downloads',
  );
  for (final folder in [currentBrand, destination]) {
    final type = await FileSystemEntity.type(folder.path, followLinks: false);
    if (type != FileSystemEntityType.notFound &&
        type != FileSystemEntityType.directory) {
      throw const FileSystemException('UNSAFE_DOWNLOAD_DIRECTORY');
    }
  }
  // Old sandbox names are migration inputs only; a substituted parent or
  // Downloads link must never move files out of an unrelated directory.
  for (final folder in [legacyBrand, legacy]) {
    if (await FileSystemEntity.type(folder.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      return destination;
    }
  }
  await destination.create(recursive: true);
  await for (final entity in legacy.list(followLinks: false)) {
    if (entity is! File) continue;
    final name = entity.uri.pathSegments.last;
    final migrated = name.startsWith('.qahtani-')
        ? name.replaceFirst('.qahtani-', '.mitv-')
        : name;
    final target = File(
      '${destination.path}${Platform.pathSeparator}$migrated',
    );
    if (await FileSystemEntity.type(target.path, followLinks: false) ==
        FileSystemEntityType.notFound) {
      await entity.rename(target.path);
    }
  }
  if (await legacy.list(followLinks: false).isEmpty) {
    await legacy.delete();
    if (await legacy.parent.list(followLinks: false).isEmpty) {
      await legacy.parent.delete();
    }
  }
  return destination;
}
