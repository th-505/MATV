import 'download_cleanup_coordinator.dart';

/// Browsers have no MITV Documents/Downloads directory or native download jobs.
class StorageCleanup {
  const StorageCleanup._();

  static const downloadsSupported = false;

  static Future<DownloadCleanupResult> clearDownloads({
    Future<Object> Function()? documentsDirectoryProvider,
  }) async => const DownloadCleanupResult();
}
