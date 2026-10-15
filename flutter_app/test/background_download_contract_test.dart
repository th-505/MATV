import 'dart:async';

import 'package:mitv/src/background_download_contract.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'background coordinator exposes completed only after final-file verification',
    () async {
      final bridge = _FakeBridge();
      var verified = false;
      final coordinator = BackgroundDownloadCoordinator(
        bridge,
        completionVerifier: (event) async {
          expect(event.receivedBytes, 100);
          expect(event.totalBytes, 100);
          await Future<void>.delayed(Duration.zero);
          return verified;
        },
      );
      addTearDown(() async {
        await coordinator.dispose();
        await bridge.dispose();
      });

      final request = BackgroundDownloadRequest(
        taskId: 'episode-7',
        uri: Uri.parse('https://cdn.example.test/episode.mp4?token=fixture'),
        resumeKey: 'series:1:episode:7',
        fallbackName: 'Episode 7',
      );

      await coordinator.enqueue(request);
      expect(bridge.enqueued, same(request));
      expect(
        coordinator.stateFor('episode-7')?.state,
        BackgroundDownloadState.queued,
      );

      bridge.emit(
        const BackgroundDownloadEvent(
          taskId: 'episode-7',
          state: BackgroundDownloadState.running,
          receivedBytes: 50,
          totalBytes: 100,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(coordinator.stateFor('episode-7')?.receivedBytes, 50);

      bridge.emit(
        const BackgroundDownloadEvent(
          taskId: 'episode-7',
          state: BackgroundDownloadState.completed,
          receivedBytes: 100,
          totalBytes: 100,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(
        coordinator.stateFor('episode-7')?.state,
        BackgroundDownloadState.verifying,
      );
      await Future<void>.delayed(Duration.zero);
      expect(
        coordinator.stateFor('episode-7')?.state,
        BackgroundDownloadState.failed,
      );
      expect(
        coordinator.stateFor('episode-7')?.errorCode,
        'FINAL_FILE_VERIFICATION_FAILED',
      );

      final verifiedBridge = _FakeBridge();
      verified = true;
      final verifiedCoordinator = BackgroundDownloadCoordinator(
        verifiedBridge,
        completionVerifier: (_) async => verified,
      );
      addTearDown(() async {
        await verifiedCoordinator.dispose();
        await verifiedBridge.dispose();
      });
      await verifiedCoordinator.enqueue(
        BackgroundDownloadRequest(
          taskId: 'movie-1',
          uri: Uri.parse('https://cdn.example.test/movie.mp4?token=fixture'),
          resumeKey: 'movie:1',
          fallbackName: 'Movie 1',
        ),
      );
      verifiedBridge.emit(
        const BackgroundDownloadEvent(
          taskId: 'movie-1',
          state: BackgroundDownloadState.completed,
          receivedBytes: 838400000,
          totalBytes: 838400000,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(
        verifiedCoordinator.stateFor('movie-1')?.state,
        BackgroundDownloadState.completed,
      );
    },
  );

  test(
    'background coordinator rejects native completion when no verifier is installed',
    () async {
      final bridge = _FakeBridge();
      final coordinator = BackgroundDownloadCoordinator(bridge);
      addTearDown(() async {
        await coordinator.dispose();
        await bridge.dispose();
      });
      await coordinator.enqueue(
        BackgroundDownloadRequest(
          taskId: 'movie-unverified',
          uri: Uri.parse('https://cdn.example.test/movie.mp4?token=fixture'),
          resumeKey: 'movie:unverified',
          fallbackName: 'movie.mp4',
        ),
      );
      bridge.emit(
        const BackgroundDownloadEvent(
          taskId: 'movie-unverified',
          state: BackgroundDownloadState.completed,
          receivedBytes: 10,
          totalBytes: 10,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(
        coordinator.stateFor('movie-unverified')?.state,
        BackgroundDownloadState.failed,
      );
      expect(
        coordinator.stateFor('movie-unverified')?.errorCode,
        'FINAL_FILE_VERIFICATION_FAILED',
      );
    },
  );

  test('background coordinator rejects retired proxies, HLS and private URLs '
      'before enqueueing or publishing queued state', () async {
    final bridge = _FakeBridge();
    final coordinator = BackgroundDownloadCoordinator(bridge);
    addTearDown(() async {
      await coordinator.dispose();
      await bridge.dispose();
    });

    for (final value in [
      'https://matv.onrender.com/api/cinema/media?id=old&download=1',
      'https://cdn.example.test/master.m3u8',
      'http://cdn.example.test/video.mp4',
      'https://127.0.0.1/video.mp4',
      'https://localhost/video.mp4',
      'https://private.internal/video.mp4',
      'https://user:password@cdn.example.test/video.mp4',
      'https://cdn.example.test:8443/video.mp4',
      'https://cdn.example.test/video.mp4#fragment',
    ]) {
      await expectLater(
        coordinator.enqueue(
          BackgroundDownloadRequest(
            taskId: 'bad',
            uri: Uri.parse(value),
            resumeKey: 'bad',
            fallbackName: 'bad.mp4',
          ),
        ),
        throwsA(
          isA<BackgroundDownloadException>().having(
            (error) => error.code,
            'code',
            'INVALID_DOWNLOAD_REFERENCE',
          ),
        ),
        reason: value,
      );
      expect(bridge.enqueued, isNull);
      expect(coordinator.stateFor('bad'), isNull);
    }
  });

  test(
    'protected direct MP4 carries allowed source headers to native bridge',
    () async {
      final bridge = _FakeBridge();
      final coordinator = BackgroundDownloadCoordinator(bridge);
      addTearDown(() async {
        await coordinator.dispose();
        await bridge.dispose();
      });
      final request = BackgroundDownloadRequest(
        taskId: 'protected',
        uri: Uri.parse('https://cdn.example.test/video.MP4?token=signed'),
        resumeKey: 'protected:episode:1',
        fallbackName: 'episode.mp4',
        headers: const {
          'Referer': 'https://source.example.test/watch/episode?key=123',
          'Origin': 'https://source.example.test',
          'User-Agent': 'Mozilla/5.0 MITV',
        },
      );
      await coordinator.enqueue(request);
      expect(bridge.enqueued, same(request));
      expect(bridge.enqueued?.headers, request.headers);
      expect(bridge.enqueued?.uri.queryParameters['token'], 'signed');
      expect(
        coordinator.stateFor('protected')?.state,
        BackgroundDownloadState.queued,
      );
    },
  );

  test('unexpected or injected headers cannot reach native bridge', () async {
    final bridge = _FakeBridge();
    final coordinator = BackgroundDownloadCoordinator(bridge);
    addTearDown(() async {
      await coordinator.dispose();
      await bridge.dispose();
    });
    for (final headers in [
      {'Authorization': 'Bearer secret'},
      {'Cookie': 'session=secret'},
      {'Range': 'bytes=10-'},
      {'Origin': 'https://source.example.test\r\nCookie: injected'},
      {'User-Agent': 'MITV\nInjected'},
    ]) {
      await expectLater(
        coordinator.enqueue(
          BackgroundDownloadRequest(
            taskId: 'unsafe',
            uri: Uri.parse('https://cdn.example.test/video.mp4'),
            resumeKey: 'unsafe',
            fallbackName: 'unsafe.mp4',
            headers: headers,
          ),
        ),
        throwsA(
          isA<BackgroundDownloadException>().having(
            (error) => error.code,
            'code',
            'INVALID_DOWNLOAD_HEADERS',
          ),
        ),
      );
      expect(bridge.enqueued, isNull);
      expect(coordinator.stateFor('unsafe'), isNull);
    }
  });

  test('cancellation during verification remains terminal after verifier '
      'finishes', () async {
    final bridge = _FakeBridge();
    final verificationStarted = Completer<void>();
    final verified = Completer<bool>();
    final coordinator = BackgroundDownloadCoordinator(
      bridge,
      completionVerifier: (_) {
        verificationStarted.complete();
        return verified.future;
      },
    );
    addTearDown(() async {
      if (!verified.isCompleted) verified.complete(false);
      await coordinator.dispose();
      await bridge.dispose();
    });
    await coordinator.enqueue(
      BackgroundDownloadRequest(
        taskId: 'cancelled',
        uri: Uri.parse('https://cdn.example.test/video.mp4'),
        resumeKey: 'cancelled',
        fallbackName: 'video.mp4',
      ),
    );
    bridge.emit(
      const BackgroundDownloadEvent(
        taskId: 'cancelled',
        state: BackgroundDownloadState.completed,
        receivedBytes: 100,
        totalBytes: 100,
      ),
    );
    await verificationStarted.future;
    expect(
      coordinator.stateFor('cancelled')?.state,
      BackgroundDownloadState.verifying,
    );
    await coordinator.cancel('cancelled');
    expect(bridge.cancelled, 'cancelled');
    bridge.emit(
      const BackgroundDownloadEvent(
        taskId: 'cancelled',
        state: BackgroundDownloadState.cancelled,
        receivedBytes: 100,
        totalBytes: 100,
      ),
    );
    await Future<void>.delayed(Duration.zero);
    verified.complete(true);
    await Future<void>.delayed(Duration.zero);
    expect(
      coordinator.stateFor('cancelled')?.state,
      BackgroundDownloadState.cancelled,
    );
  });
}

class _FakeBridge implements BackgroundDownloadBridge {
  final StreamController<BackgroundDownloadEvent> _events =
      StreamController<BackgroundDownloadEvent>.broadcast();
  BackgroundDownloadRequest? enqueued;
  String? cancelled;

  @override
  Stream<BackgroundDownloadEvent> get events => _events.stream;

  @override
  Future<void> enqueue(BackgroundDownloadRequest request) async {
    enqueued = request;
  }

  @override
  Future<void> cancel(String taskId) async {
    cancelled = taskId;
  }

  void emit(BackgroundDownloadEvent event) => _events.add(event);
  Future<void> dispose() => _events.close();
}
