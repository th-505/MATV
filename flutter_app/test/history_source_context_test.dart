import 'package:flutter_test/flutter_test.dart';
import 'package:mitv/src/library_store.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/player_page.dart';

WatchEntry saved({
  String ref = '3isk:one',
  String provider = '3isk',
  String edition = 'original',
  bool verified = false,
  int offset = 0,
}) => WatchEntry(
  contentRef: '3isk:one',
  contentId: 'one',
  title: 'one',
  poster: '',
  type: 'movie',
  positionMs: 23000,
  durationMs: 120000,
  updatedAtMs: 1,
  selectedSourceRef: ref,
  providerId: provider,
  edition: edition,
  timelineVerified: verified,
  timelineOffsetMs: offset,
);
PlaybackSource source({
  String ref = '3isk:one',
  String provider = '3isk',
  String edition = 'original',
  bool verified = false,
  int offset = 0,
}) => PlaybackSource(
  mediaPath: 'https://media.example/video.mp4',
  mediaType: 'mp4',
  sourceRef: ref,
  providerId: provider,
  edition: edition,
  timelineVerified: verified,
  timelineOffsetMs: offset,
);
void main() {
  test('stable source resumes across changing signed media URLs', () {
    expect(
      historyPositionForSource(saved(), source(), requestedRef: '3isk:one'),
      const Duration(seconds: 23),
    );
  });
  test('another unverified cut or episode cannot reuse a saved clock', () {
    expect(
      historyPositionForSource(
        saved(),
        source(ref: 'laroza:one', provider: 'laroza'),
        requestedRef: '3isk:one',
      ),
      Duration.zero,
    );
    expect(
      historyPositionForSource(
        saved(),
        source(ref: '3isk:two'),
        requestedRef: '3isk:two',
      ),
      Duration.zero,
    );
    expect(
      historyPositionForSource(
        saved(),
        source(edition: 'arabic-dubbed'),
        requestedRef: '3isk:one',
      ),
      Duration.zero,
    );
  });
  test(
    'proven shared edition transfers the canonical clock and clamps zero',
    () {
      expect(
        historyPositionForSource(
          saved(verified: true, offset: 5000),
          source(
            ref: 'laroza:one',
            provider: 'laroza',
            verified: true,
            offset: 2000,
          ),
          requestedRef: '3isk:one',
        ),
        const Duration(seconds: 20),
      );
      expect(
        historyPositionForSource(
          saved(verified: true, offset: 30000),
          source(ref: 'laroza:one', provider: 'laroza', verified: true),
          requestedRef: '3isk:one',
        ),
        Duration.zero,
      );
    },
  );
  test('legacy title clocks do not invent an episode mapping', () {
    expect(
      historyPositionForSource(
        saved(ref: ''),
        source(),
        requestedRef: '3isk:one',
      ),
      const Duration(seconds: 23),
    );
    expect(
      historyPositionForSource(
        saved(ref: ''),
        source(ref: '3isk:episode'),
        requestedRef: '3isk:episode',
      ),
      Duration.zero,
    );
  });
}
