import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:enough_convert/windows.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mitv/src/models.dart';
import 'package:mitv/src/subtitle_service.dart';

const srt = '1\n00:00:01,000 --> 00:00:03,000\nمرحبًا بالعالم\n';
Uint8List bytes(String text) => Uint8List.fromList(utf8.encode(text));

class MemoryStore implements SubtitleTemporaryStore {
  final values = <String>[];
  final formats = <String>[];
  bool closed = false;
  @override
  Future<String> prepare(Uint8List value, String format) async {
    values.add(utf8.decode(value));
    formats.add(format);
    return 'file:///tmp/subtitle-${values.length}.$format';
  }

  @override
  Future<void> close() async {
    closed = true;
  }
}

class AbortTrackingClient extends http.BaseClient {
  final started = Completer<void>();
  bool aborted = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final cancellable = request as http.Abortable;
    started.complete();
    await cancellable.abortTrigger;
    aborted = true;
    throw http.RequestAbortedException(request.url);
  }
}

const descriptor = SubtitleDescriptor(
  id: 'ar',
  url: 'https://captions.example/ar.srt',
  format: 'srt',
  headers: {
    'Referer': 'https://source.example/watch',
    'Origin': 'https://source.example',
    'User-Agent': 'Mozilla/5.0 MITV fixture',
  },
);

void main() {
  test(
    'actual UTF8 wins over metadata hints; CP1256 fallback preserves Arabic',
    () {
      expect(decodeSubtitleBytes(bytes(srt)), srt);
      expect(
        decodeSubtitleBytes(
          Uint8List.fromList([0xef, 0xbb, 0xbf, ...utf8.encode(srt)]),
        ),
        srt,
      );
      final cp = Uint8List.fromList(const Windows1256Codec().encode(srt));
      expect(() => utf8.decode(cp), throwsFormatException);
      expect(decodeSubtitleBytes(cp), srt);
      expect(
        () => decodeSubtitleBytes(Uint8List.fromList([0xef, 0xbb, 0xbf, 0xff])),
        throwsFormatException,
      );
    },
  );
  test('UTF16 BOM handles Arabic and rejects malformed surrogate data', () {
    final encoded = <int>[0xff, 0xfe];
    for (final unit in ('$srt😀').codeUnits) {
      encoded.addAll([unit & 255, unit >> 8]);
    }
    expect(decodeSubtitleBytes(Uint8List.fromList(encoded)), '$srt😀');
    expect(
      () => decodeSubtitleBytes(Uint8List.fromList([0xff, 0xfe, 0x00, 0xd8])),
      throwsFormatException,
    );
    expect(
      () => decodeSubtitleBytes(Uint8List.fromList([0xff, 0xfe, 1])),
      throwsFormatException,
    );
  });
  test('ZIP, HTML, scripts and untimed data are rejected', () {
    expect(
      () => decodeSubtitleBytes(Uint8List.fromList([80, 75, 3, 4, 0])),
      throwsFormatException,
    );
    expect(
      () => normalizeSubtitleText('<html>blocked</html>', 'srt'),
      throwsFormatException,
    );
    expect(
      () => normalizeSubtitleText('$srt<script>alert(1)</script>', 'srt'),
      throwsFormatException,
    );
    expect(
      () => normalizeSubtitleText('not a caption', 'srt'),
      throwsFormatException,
    );
    expect(
      () => normalizeSubtitleText(
        'WEBVTTJunk\n\n00:01.000 --> 00:03.000\nHi',
        'vtt',
      ),
      throwsFormatException,
    );
  });
  test('SRT converts to WebVTT and delay derives from original cue times', () {
    final vtt = normalizeSubtitleText(srt, 'srt', web: true);
    expect(vtt, startsWith('WEBVTT'));
    expect(vtt, contains('00:00:01.000 --> 00:00:03.000'));
    expect(shiftVtt(vtt, 0.5), contains('00:00:01.500 --> 00:00:03.500'));
    expect(shiftVtt(vtt, -2), contains('00:00:00.000 --> 00:00:01.000'));
    expect(shiftVtt(vtt, -4), 'WEBVTT\n');
    expect(() => shiftVtt(vtt, double.infinity), throwsFormatException);
  });
  test('native ASS remains intact; web ASS becomes safe timed plain text', () {
    const ass =
        '[Script Info]\nTitle: Arabic\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,{\\b1}مرحبًا\\Nبالعالم,صديق\n';
    expect(normalizeSubtitleText(ass, 'ass'), ass);
    final vtt = normalizeSubtitleText(ass, 'ass', web: true);
    expect(
      vtt,
      contains('00:00:01.000 --> 00:00:03.000\nمرحبًا\nبالعالم,صديق'),
    );
    expect(vtt, isNot(contains('{\\b1}')));
  });
  test(
    'protected captions preserve approved headers and cached reselect downloads once',
    () async {
      var calls = 0;
      final store = MemoryStore();
      final service = SubtitleService(
        store: store,
        client: MockClient((r) async {
          calls++;
          expect(r.headers['Referer'], descriptor.headers['Referer']);
          expect(r.followRedirects, false);
          return http.Response.bytes(
            bytes(srt),
            200,
            headers: {'content-type': 'application/x-subrip'},
          );
        }),
      );
      final results = await Future.wait([
        service.loadDescriptor(descriptor),
        service.loadDescriptor(descriptor),
      ]);
      expect(results[0].text, srt);
      expect(results[0].uri, results[1].uri);
      expect(calls, 1);
      expect(store.values, [srt]);
      await service.dispose();
      expect(store.closed, true);
    },
  );
  test(
    'private URLs, unsafe headers and cross-host redirects never fetch destination',
    () async {
      final calls = <Uri>[];
      final service = SubtitleService(
        store: MemoryStore(),
        client: MockClient((r) async {
          calls.add(r.url);
          return http.Response(
            '',
            302,
            headers: {'location': 'https://127.0.0.1/sub.srt'},
          );
        }),
      );
      for (final url in [
        'http://captions.example/a.srt',
        'https://127.0.0.1/a.srt',
        'https://127.1/a.srt',
        'https://host.local/a.srt',
        'https://user:pass@captions.example/a.srt',
      ]) {
        await expectLater(
          service.loadDescriptor(
            SubtitleDescriptor(id: '', url: url, format: 'srt'),
          ),
          throwsFormatException,
        );
      }
      expect(calls, isEmpty);
      await expectLater(
        service.loadDescriptor(
          const SubtitleDescriptor(
            id: '',
            url: 'https://captions.example/ar.srt',
            format: 'srt',
            headers: {'Cookie': 'secret'},
          ),
        ),
        throwsFormatException,
      );
      await expectLater(
        service.loadDescriptor(descriptor),
        throwsFormatException,
      );
      expect(calls.length, 1);
      await service.dispose();
    },
  );
  test(
    'same-host redirect is followed once and body limit is enforced while streaming',
    () async {
      var calls = 0;
      final service = SubtitleService(
        store: MemoryStore(),
        client: MockClient((r) async {
          calls++;
          return calls == 1
              ? http.Response('', 302, headers: {'location': '/new.srt'})
              : http.Response.bytes(bytes(srt), 200);
        }),
      );
      expect((await service.loadDescriptor(descriptor)).text, srt);
      expect(calls, 2);
      await service.dispose();
      final oversized = SubtitleService(
        store: MemoryStore(),
        client: MockClient(
          (_) async => http.Response.bytes(
            Uint8List(SubtitleService.maximumBytes + 1),
            200,
          ),
        ),
      );
      await expectLater(
        oversized.loadDescriptor(descriptor),
        throwsFormatException,
      );
      await oversized.dispose();
    },
  );
  test('remote HTML and ZIP content types fail without temp files', () async {
    for (final type in ['text/html', 'application/zip', 'video/mp4']) {
      final store = MemoryStore();
      final service = SubtitleService(
        store: store,
        client: MockClient(
          (_) async => http.Response.bytes(
            bytes(srt),
            200,
            headers: {'content-type': type},
          ),
        ),
      );
      await expectLater(
        service.loadDescriptor(descriptor),
        throwsFormatException,
      );
      expect(store.values, isEmpty);
      await service.dispose();
    }
  });
  test(
    'web uses normalized VTT and omits browser-controlled native headers',
    () async {
      final store = MemoryStore();
      var calls = 0;
      final service = SubtitleService(
        store: store,
        web: true,
        client: MockClient((request) async {
          ++calls;
          expect(
            request.headers.keys.map((s) => s.toLowerCase()),
            isNot(
              anyOf(
                contains('referer'),
                contains('origin'),
                contains('user-agent'),
              ),
            ),
          );
          expect(request.url, Uri.parse(descriptor.url));
          return http.Response.bytes(bytes(srt), 200);
        }),
      );
      final remote = await service.loadDescriptor(descriptor);
      expect(remote.format, 'vtt');
      expect(calls, 1);
      await service.dispose();
      final localStore = MemoryStore();
      final local = SubtitleService(store: localStore, web: true);
      final prepared = await local.loadLocalBytes(bytes(srt), 'local.srt');
      expect(prepared.format, 'vtt');
      expect(localStore.formats, ['vtt']);
      await local.dispose();
    },
  );
  test(
    'browser CORS refusal does not create a subtitle file or retry through a proxy',
    () async {
      var calls = 0;
      final store = MemoryStore();
      final service = SubtitleService(
        store: store,
        web: true,
        client: MockClient((request) async {
          ++calls;
          throw http.ClientException('CORS access refused', request.url);
        }),
      );
      await expectLater(
        service.loadDescriptor(descriptor),
        throwsA(isA<http.ClientException>()),
      );
      expect(calls, 1);
      expect(store.values, isEmpty);
      await service.dispose();
    },
  );
  test(
    'Stremio search requires verified IMDb/type and explicit series coordinates',
    () async {
      var calls = 0;
      final service = SubtitleService(
        store: MemoryStore(),
        client: MockClient((r) async {
          calls++;
          expect(r.url.path, '/subtitles/series/tt1234567:2:3.json');
          return http.Response(
            jsonEncode({
              'subtitles': [
                {
                  'id': 'a',
                  'lang': 'ara',
                  'subtitleFileName': 'ar.srt',
                  'url': 'https://subs5.strem.io/ar',
                  'SubEncoding': 'CP1256',
                },
                {
                  'id': 'b',
                  'lang': 'eng',
                  'subtitleFileName': 'en.srt',
                  'url': 'https://subs5.strem.io/en',
                },
                {
                  'id': 'c',
                  'lang': 'ara',
                  'subtitleFileName': 'bad.zip',
                  'url': 'https://evil.example/ar',
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      await expectLater(
        service.searchStremio(
          imdbId: 'tt1234567',
          workIdentityVerified: false,
          mediaType: 'movie',
        ),
        throwsFormatException,
      );
      await expectLater(
        service.searchStremio(
          imdbId: 'tt1234567',
          workIdentityVerified: true,
          mediaType: 'series',
        ),
        throwsFormatException,
      );
      expect(calls, 0);
      final results = await service.searchStremio(
        imdbId: 'tt1234567',
        workIdentityVerified: true,
        mediaType: 'series',
        season: 2,
        episode: 3,
      );
      expect(results.length, 1);
      expect(results.single.encodingHint, 'CP1256');
      await service.dispose();
    },
  );
  test(
    'in-flight subtitle loads are bounded and disposal prevents late writes',
    () async {
      var calls = 0;
      final response = Completer<http.Response>();
      final store = MemoryStore();
      final service = SubtitleService(
        store: store,
        client: MockClient((_) {
          ++calls;
          return response.future;
        }),
      );
      final pending = [
        for (var i = 0; i < 8; i++)
          service.loadDescriptor(
            SubtitleDescriptor(
              id: '$i',
              url: 'https://captions.example/$i.srt',
              format: 'srt',
            ),
          ),
      ];
      final failures = pending
          .map((future) => expectLater(future, throwsStateError))
          .toList();
      await expectLater(
        service.loadDescriptor(
          const SubtitleDescriptor(
            id: 'overflow',
            url: 'https://captions.example/9.srt',
            format: 'srt',
          ),
        ),
        throwsStateError,
      );
      await Future<void>.delayed(Duration.zero);
      expect(calls, 8);
      await service.dispose();
      response.complete(http.Response.bytes(bytes(srt), 200));
      await Future.wait(failures);
      expect(store.values, isEmpty);
      expect(store.closed, true);
      await expectLater(service.loadDescriptor(descriptor), throwsStateError);
    },
  );
  test(
    'disposing the subtitle service aborts an unfinished HTTP request',
    () async {
      final client = AbortTrackingClient();
      final service = SubtitleService(client: client, store: MemoryStore());
      final pending = service.loadDescriptor(descriptor);
      final rejected = expectLater(
        pending,
        throwsA(isA<http.RequestAbortedException>()),
      );
      await client.started.future;
      await service.dispose();
      await rejected;
      expect(client.aborted, true);
    },
  );
  test(
    'malformed optional subtitle JSON cannot break stream or create trusted cut',
    () {
      final source = StreamSource.fromJson({
        'url': 'https://video.example/a.mp4',
        'source_ref': 'laroza:source',
        'subtitles': [
          {
            'url': 'https://captions.example/ar.vtt',
            'format': 'vtt',
            'kind': 'subtitles',
            'headers': {'Referer': 'safe\r\nInjected: yes'},
          },
          {'url': 'https://127.0.0.1/ar.vtt', 'format': 'vtt'},
          {1: 'malformed'},
        ],
      });
      expect(source.attachedSubtitles.length, 1);
      expect(source.attachedSubtitles.single.headers, isEmpty);
      expect(source.sourceRef, 'laroza:source');
      final item = MediaItem.fromJson({
        'work_identity_verified': true,
        'imdb_id': 'tt1234567',
      });
      expect(item.workIdentityVerified, true);
      expect(item.identityVerified, false);
      expect(item.copyWith(title: 'renamed').workIdentityVerified, true);
    },
  );
}
