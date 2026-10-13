import 'dart:io';

/// Moves the previous library only when it is accessible in the same sandbox.
/// Existing destination files are never overwritten; conflicts stay in place.
Future<Directory> migrateDownloadDirectory(Directory documents) async {
  final destination = Directory(
      '${documents.path}${Platform.pathSeparator}MITV${Platform.pathSeparator}Downloads');
  final legacy = Directory(
      '${documents.path}${Platform.pathSeparator}AlQahtani${Platform.pathSeparator}Downloads');
  if (!await legacy.exists()) return destination;
  await destination.create(recursive: true);
  await for (final entity in legacy.list(followLinks: false)) {
    if (entity is! File) continue;
    final name = entity.uri.pathSegments.last;
    final migrated = name.startsWith('.qahtani-')
        ? name.replaceFirst('.qahtani-', '.mitv-')
        : name;
    final target =
        File('${destination.path}${Platform.pathSeparator}$migrated');
    if (!await target.exists()) await entity.rename(target.path);
  }
  if (await legacy.list(followLinks: false).isEmpty) {
    await legacy.delete();
    if (await legacy.parent.list(followLinks: false).isEmpty) {
      await legacy.parent.delete();
    }
  }
  return destination;
}
