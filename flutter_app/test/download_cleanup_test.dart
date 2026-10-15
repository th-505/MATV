import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/download_cleanup_coordinator.dart';
import 'package:mitv/src/download_service.dart';
import 'package:mitv/src/storage_cleanup.dart';

const _mp4 = <int>[0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4];
final _uri = Uri.parse('https://cdn.example.com/episode.mp4?token=fixture');

Future<Directory> _sandbox() async {
  final root = await Directory.systemTemp.createTemp('mitv-cleanup-test');
  addTearDown(() async {
    if (await root.exists()) await root.delete(recursive: true);
  });
  return root;
}

Directory _downloads(Directory root) => Directory(
  '${root.path}${Platform.pathSeparator}MITV${Platform.pathSeparator}Downloads',
);

Matcher get _cancelled => throwsA(
  isA<DownloadException>().having(
    (error) => error.code,
    'code',
    'DOWNLOAD_CANCELLED',
  ),
);

void main() {
  test('global cleanup waits for cancelled streams before deletion and blocks '
      'new jobs across service instances', () async {
    final root = await _sandbox();
    final downloads = await _downloads(root).create(recursive: true);
    final old = File('${downloads.path}/old.mp4');
    await old.writeAsBytes(_mp4);
    await File('${downloads.path}/invalid.mp4').writeAsString('not video');
    await File('${downloads.path}/.mitv-abandoned.part').writeAsBytes([1, 2]);
    final firstCancelled = Completer<void>();
    final allowCancellation = Completer<void>();
    final firstStream = StreamController<List<int>>(
      onCancel: () {
        firstCancelled.complete();
        return allowCancellation.future;
      },
    );
    final secondStream = StreamController<List<int>>();
    addTearDown(() async {
      if (!allowCancellation.isCompleted) allowCancellation.complete();
      await firstStream.close();
      await secondStream.close();
    });
    final firstService = DownloadService(
      client: _StreamingClient(firstStream.stream),
      directoryProvider: () async => downloads,
    );
    final secondService = DownloadService(
      client: _StreamingClient(secondStream.stream),
      directoryProvider: () async => downloads,
    );
    addTearDown(firstService.close);
    addTearDown(secondService.close);
    final firstChunk = Completer<void>();
    final secondChunk = Completer<void>();
    final firstDownload = firstService.download(
      _uri,
      resumeKey: 'first',
      onProgress: (progress) {
        if (progress.receivedBytes > 0 && !firstChunk.isCompleted) {
          firstChunk.complete();
        }
      },
    );
    final secondDownload = secondService.download(
      _uri,
      resumeKey: 'second',
      onProgress: (progress) {
        if (progress.receivedBytes > 0 && !secondChunk.isCompleted) {
          secondChunk.complete();
        }
      },
    );
    // Install error handlers before causing the global cancellation.
    final firstExpectation = expectLater(firstDownload, _cancelled);
    final secondExpectation = expectLater(secondDownload, _cancelled);
    firstStream.add(_mp4);
    secondStream.add(_mp4);
    await Future.wait([firstChunk.future, secondChunk.future]);
    expect(DownloadCleanupCoordinator.instance.activeJobs, 2);

    final cleanup = StorageCleanup.clearDownloads(
      documentsDirectoryProvider: () async => root,
    );
    final concurrentCleanup = StorageCleanup.clearDownloads(
      documentsDirectoryProvider: () async => root,
    );
    expect(identical(cleanup, concurrentCleanup), isTrue);
    var cleanupFinished = false;
    final cleanupObserver = cleanup.then((value) {
      cleanupFinished = true;
      return value;
    });
    await firstCancelled.future;
    expect(DownloadCleanupCoordinator.instance.isClearing, isTrue);
    expect(cleanupFinished, isFalse);
    expect(await old.exists(), isTrue);

    var sends = 0;
    var directoryLookups = 0;
    final newService = DownloadService(
      client: MockClient((request) async {
        sends++;
        return http.Response.bytes(
          _mp4,
          200,
          headers: {'content-type': 'video/mp4'},
        );
      }),
      directoryProvider: () async {
        directoryLookups++;
        return downloads;
      },
    );
    addTearDown(newService.close);
    await expectLater(
      newService.download(_uri),
      throwsA(
        isA<DownloadException>().having(
          (error) => error.code,
          'code',
          'DOWNLOAD_CLEANUP_IN_PROGRESS',
        ),
      ),
    );
    expect(sends, 0);
    expect(directoryLookups, 0);

    allowCancellation.complete();
    await Future.wait([firstExpectation, secondExpectation]);
    final report = await cleanupObserver;
    expect(report.deletedFiles, 3);
    expect(report.deletedBytes, _mp4.length + 'not video'.length + 2);
    expect(await downloads.list(followLinks: false).toList(), isEmpty);
    expect(DownloadCleanupCoordinator.instance.activeJobs, 0);
    expect(DownloadCleanupCoordinator.instance.isClearing, isFalse);

    // Late network chunks cannot revive files after the cleanup has returned.
    firstStream.add(_mp4);
    secondStream.add(_mp4);
    await Future<void>.delayed(Duration.zero);
    expect(await downloads.list(followLinks: false).toList(), isEmpty);
    final fresh = await newService.download(_uri, fallbackName: 'fresh');
    expect(await File(fresh.path).readAsBytes(), _mp4);
    expect(sends, 1);
  });

  test('cleanup removes complete, partial, invalid and empty files, preserving '
      'Documents siblings and preferences', () async {
    final root = await _sandbox();
    final downloads = await _downloads(root).create(recursive: true);
    final nested = await Directory('${downloads.path}/nested').create();
    await File('${downloads.path}/complete.mp4').writeAsBytes(_mp4);
    await File('${downloads.path}/.mitv-failed.part').writeAsBytes([7, 8]);
    await File('${downloads.path}/invalid.mp4').writeAsString('<html>error');
    await File('${downloads.path}/empty.mp4').writeAsBytes([]);
    await File('${nested.path}/unrecognized.tmp').writeAsBytes([9]);
    final identity = File('${root.path}/device-session.json');
    await identity.writeAsString('keep auth and UUID');
    final temp = await Directory('${root.path}/Temp').create();
    final subtitle = File('${temp.path}/subtitle.srt');
    await subtitle.writeAsString('preserve temporary subtitles');
    final legacy = await Directory(
      '${root.path}/AlQahtani/Downloads',
    ).create(recursive: true);
    final legacyFile = File('${legacy.path}/old.mp4');
    await legacyFile.writeAsBytes(_mp4);

    final result = await StorageCleanup.clearDownloads(
      documentsDirectoryProvider: () async => root,
    );
    expect(result.deletedFiles, 5);
    expect(await downloads.exists(), isTrue);
    expect(await downloads.list(followLinks: false).toList(), isEmpty);
    expect(await identity.readAsString(), 'keep auth and UUID');
    expect(await subtitle.exists(), isTrue);
    expect(await legacyFile.exists(), isTrue);
  });

  test(
    'cleanup skips file and directory symlinks and preserves their targets',
    () async {
      final root = await _sandbox();
      final downloads = await _downloads(root).create(recursive: true);
      final outside = await Directory('${root.path}/outside').create();
      final target = File('${outside.path}/preserved.mp4');
      await target.writeAsBytes(_mp4);
      final fileLink = await Link(
        '${downloads.path}/file-link.mp4',
      ).create(target.path);
      final directoryLink = await Link(
        '${downloads.path}/dir-link',
      ).create(outside.path);
      await File(
        '${downloads.path}/regular-invalid',
      ).writeAsString('delete me');

      final result = await StorageCleanup.clearDownloads(
        documentsDirectoryProvider: () async => root,
      );
      expect(result.deletedFiles, 1);
      expect(result.skippedLinks, 2);
      expect(await target.readAsBytes(), _mp4);
      expect(await fileLink.exists(), isTrue);
      expect(await directoryLink.exists(), isTrue);
    },
    skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false,
  );

  test(
    'cleanup rejects a substituted Downloads symlink without touching target',
    () async {
      final root = await _sandbox();
      final brand = await Directory('${root.path}/MITV').create();
      final outside = await Directory('${root.path}/outside').create();
      final target = File('${outside.path}/preserved.mp4');
      await target.writeAsBytes(_mp4);
      await Link('${brand.path}/Downloads').create(outside.path);
      await expectLater(
        StorageCleanup.clearDownloads(
          documentsDirectoryProvider: () async => root,
        ),
        throwsA(isA<FileSystemException>()),
      );
      expect(await target.readAsBytes(), _mp4);
      expect(DownloadCleanupCoordinator.instance.isClearing, isFalse);
    },
    skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false,
  );

  test('cleanup rejects a substituted MITV parent symlink', () async {
    final root = await _sandbox();
    final outside = await Directory(
      '${root.path}/outside/Downloads',
    ).create(recursive: true);
    final target = File('${outside.path}/preserved.mp4');
    await target.writeAsBytes(_mp4);
    await Link('${root.path}/MITV').create(outside.parent.path);
    await expectLater(
      StorageCleanup.clearDownloads(
        documentsDirectoryProvider: () async => root,
      ),
      throwsA(isA<FileSystemException>()),
    );
    expect(await target.readAsBytes(), _mp4);
    expect(DownloadCleanupCoordinator.instance.isClearing, isFalse);
  }, skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false);

  test('empty cleanup neither creates directories nor leaves registration gate '
      'closed', () async {
    final root = await _sandbox();
    final result = await StorageCleanup.clearDownloads(
      documentsDirectoryProvider: () async => root,
    );
    expect(result.deletedFiles, 0);
    expect(await _downloads(root).exists(), isFalse);
    expect(DownloadCleanupCoordinator.instance.isClearing, isFalse);
  });

  test('downloads cannot write through a partial-file symlink', () async {
    final root = await _sandbox();
    final downloads = await _downloads(root).create(recursive: true);
    final outside = File('${root.path}/preserved.mp4');
    await outside.writeAsBytes(_mp4);
    final link = await Link(
      '${downloads.path}/.mitv-linked.part',
    ).create(outside.path);
    var sends = 0;
    final service = DownloadService(
      client: MockClient((_) async {
        sends++;
        return http.Response.bytes(_mp4, 200);
      }),
      directoryProvider: () async => downloads,
    );
    addTearDown(service.close);
    await expectLater(
      service.download(_uri, resumeKey: 'linked'),
      throwsA(
        isA<DownloadException>().having(
          (error) => error.code,
          'code',
          'INVALID_PARTIAL_FILE',
        ),
      ),
    );
    expect(sends, 0);
    expect(await outside.readAsBytes(), _mp4);
    expect(await link.exists(), isTrue);
    expect(DownloadCleanupCoordinator.instance.activeJobs, 0);
  }, skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false);

  test('headers arriving after global cancellation cannot revive a file and '
      'their response stream is cancelled', () async {
    final root = await _sandbox();
    final downloads = await _downloads(root).create(recursive: true);
    final response = Completer<http.StreamedResponse>();
    final sent = Completer<void>();
    final cancelled = Completer<void>();
    final body = StreamController<List<int>>(
      onCancel: () => cancelled.complete(),
    );
    addTearDown(body.close);
    final service = DownloadService(
      client: _PendingHeadersClient(response.future, sent),
      directoryProvider: () async => downloads,
    );
    addTearDown(service.close);
    final download = service.download(_uri);
    final rejected = expectLater(download, _cancelled);
    await sent.future;
    await StorageCleanup.clearDownloads(
      documentsDirectoryProvider: () async => root,
    );
    await rejected;
    response.complete(http.StreamedResponse(body.stream, 200));
    await cancelled.future;
    body.add(_mp4);
    await Future<void>.delayed(Duration.zero);
    expect(await downloads.list().toList(), isEmpty);
    expect(DownloadCleanupCoordinator.instance.activeJobs, 0);
  });

  test('stored download lookup refuses symlinked completed files', () async {
    final root = await _sandbox();
    final downloads = await _downloads(root).create(recursive: true);
    final privateFile = await File(
      '${root.path}/private.mp4',
    ).writeAsBytes(_mp4);
    await Link('${downloads.path}/episode.mp4').create(privateFile.path);
    final service = DownloadService(directoryProvider: () async => downloads);
    addTearDown(service.close);
    expect(await service.verifiedDownload('episode.mp4'), isNull);
    expect(await service.listDownloads(), isEmpty);
    expect(await privateFile.readAsBytes(), _mp4);
  }, skip: Platform.isWindows ? 'Windows CI cannot create symlinks' : false);
}

class _PendingHeadersClient extends http.BaseClient {
  _PendingHeadersClient(this.response, this.sent);
  final Future<http.StreamedResponse> response;
  final Completer<void> sent;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    sent.complete();
    return response;
  }
}

class _StreamingClient extends http.BaseClient {
  _StreamingClient(this.stream);

  final Stream<List<int>> stream;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(
        stream,
        200,
        request: request,
        headers: {'content-type': 'video/mp4'},
      );
}
