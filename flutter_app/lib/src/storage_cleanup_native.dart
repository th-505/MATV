import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'download_cleanup_coordinator.dart';

typedef CleanupDocumentsProvider = Future<Directory> Function();

class StorageCleanup {
  const StorageCleanup._();

  static const downloadsSupported = true;

  /// Deletes only regular files in this sandbox's MITV/Downloads subtree.
  /// Symlinks (including a substituted MITV or Downloads directory) are never
  /// followed. Preferences, auth sessions, Documents siblings and temp remain.
  static Future<DownloadCleanupResult> clearDownloads({
    CleanupDocumentsProvider? documentsDirectoryProvider,
  }) => DownloadCleanupCoordinator.instance.cancelAndClean(() async {
    final documents =
        await (documentsDirectoryProvider ??
            getApplicationDocumentsDirectory)();
    if (!await documents.exists()) return const DownloadCleanupResult();
    final canonicalDocuments = await documents.resolveSymbolicLinks();
    final brand = Directory('$canonicalDocuments${Platform.pathSeparator}MITV');
    final directory = Directory(
      '${brand.path}${Platform.pathSeparator}Downloads',
    );
    for (final candidate in [brand, directory]) {
      final type = await FileSystemEntity.type(
        candidate.path,
        followLinks: false,
      );
      if (type == FileSystemEntityType.notFound) {
        return const DownloadCleanupResult();
      }
      if (type != FileSystemEntityType.directory) {
        throw const FileSystemException('UNSAFE_DOWNLOAD_DIRECTORY');
      }
    }
    final allowedRoot = Directory(await directory.resolveSymbolicLinks());
    final allowedUri = allowedRoot.absolute.uri.toString();
    var deletedFiles = 0;
    var deletedBytes = 0;
    var skippedLinks = 0;

    bool withinRoot(String canonicalPath) =>
        File(canonicalPath).absolute.uri.toString().startsWith(allowedUri);

    Future<void> visit(Directory folder) async {
      final folderType = await FileSystemEntity.type(
        folder.path,
        followLinks: false,
      );
      if (folderType == FileSystemEntityType.link) {
        skippedLinks++;
        return;
      }
      if (folderType != FileSystemEntityType.directory) return;
      final canonicalFolder = await folder.resolveSymbolicLinks();
      if (Directory(canonicalFolder).absolute.uri.toString() != allowedUri &&
          !withinRoot(canonicalFolder)) {
        skippedLinks++;
        return;
      }
      await for (final entry in folder.list(followLinks: false)) {
        final type = await FileSystemEntity.type(
          entry.path,
          followLinks: false,
        );
        if (type == FileSystemEntityType.link) {
          skippedLinks++;
        } else if (type == FileSystemEntityType.file) {
          final file = File(entry.path);
          if (!withinRoot(await file.resolveSymbolicLinks())) {
            skippedLinks++;
            continue;
          }
          final length = await file.length();
          await file.delete();
          deletedFiles++;
          deletedBytes += length;
        } else if (type == FileSystemEntityType.directory) {
          final child = Directory(entry.path);
          await visit(child);
          // Remove only empty real subdirectories, never recursive-delete.
          if (await FileSystemEntity.type(child.path, followLinks: false) ==
                  FileSystemEntityType.directory &&
              await child.list(followLinks: false).isEmpty) {
            await child.delete();
          }
        }
      }
    }

    await visit(directory);
    return DownloadCleanupResult(
      deletedFiles: deletedFiles,
      deletedBytes: deletedBytes,
      skippedLinks: skippedLinks,
    );
  });
}
