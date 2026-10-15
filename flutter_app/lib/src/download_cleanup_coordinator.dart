import 'dart:async';

class DownloadCleanupResult {
  const DownloadCleanupResult({
    this.deletedFiles = 0,
    this.deletedBytes = 0,
    this.skippedLinks = 0,
  });

  final int deletedFiles;
  final int deletedBytes;
  final int skippedLinks;
}

class DownloadCleanupInProgress implements Exception {
  const DownloadCleanupInProgress();

  @override
  String toString() => 'DOWNLOAD_CLEANUP_IN_PROGRESS';
}

/// One registry for all DownloadService instances in this application isolate.
/// A cleanup closes the registration gate synchronously, then waits for each
/// cancelled job to finish its stream, sink and file cleanup before deleting.
class DownloadCleanupCoordinator {
  DownloadCleanupCoordinator._();

  static final instance = DownloadCleanupCoordinator._();

  final Set<DownloadJobRegistration> _jobs = <DownloadJobRegistration>{};
  Future<DownloadCleanupResult>? _cleanupFuture;

  bool get isClearing => _cleanupFuture != null;
  int get activeJobs => _jobs.length;

  DownloadJobRegistration register({required void Function() cancel}) {
    if (isClearing) throw const DownloadCleanupInProgress();
    final registration = DownloadJobRegistration._(this, cancel);
    _jobs.add(registration);
    return registration;
  }

  Future<DownloadCleanupResult> cancelAndClean(
    Future<DownloadCleanupResult> Function() deleteFiles,
  ) {
    final existing = _cleanupFuture;
    if (existing != null) return existing;
    final completion = Completer<DownloadCleanupResult>();
    _cleanupFuture = completion.future;

    Future<void> run() async {
      try {
        final jobs = List<DownloadJobRegistration>.of(_jobs);
        for (final job in jobs) {
          job._cancel();
        }
        await Future.wait(jobs.map((job) => job._finished.future));
        completion.complete(await deleteFiles());
      } catch (error, stack) {
        completion.completeError(error, stack);
      } finally {
        _cleanupFuture = null;
      }
    }

    unawaited(run());
    return completion.future;
  }
}

class DownloadJobRegistration {
  DownloadJobRegistration._(this._coordinator, this._cancel);

  final DownloadCleanupCoordinator _coordinator;
  final void Function() _cancel;
  final Completer<void> _finished = Completer<void>();

  /// Called only from the download's outermost finally, after all disk handles
  /// and stream subscriptions have been awaited and closed.
  void complete() {
    if (_finished.isCompleted) return;
    _coordinator._jobs.remove(this);
    _finished.complete();
  }
}
