import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:media_kit_video/media_kit_video.dart' as mv;
import 'package:video_player/video_player.dart' show VideoPlayerValue;

/// One media_kit player for all formats and native platforms. On the web,
/// media_kit selects its HTML5 implementation; native platforms use libmpv.
/// VideoPlayerValue is retained only as the UI's existing listenable contract.
class UniversalPlayer implements ValueListenable<VideoPlayerValue> {
  UniversalPlayer(this.uri,
      {required this.mediaType,
      Map<String, String> headers = const {},
      this.software = false,
      this.mediaKitPlayerFactory,
      this.videoOutputFactory})
      : headers = Map.unmodifiable(headers);

  final Uri uri;
  final String mediaType;
  final Map<String, String> headers;

  /// A decoder retry creates a new player with GPU decoding disabled, rather
  /// than selecting a different playback plugin or dropping request headers.
  final bool software;

  /// Dependency seams let adapter tests exercise real media_kit Media/Player
  /// contracts without loading libmpv or creating a Flutter texture.
  @visibleForTesting
  final mk.Player Function()? mediaKitPlayerFactory;
  @visibleForTesting
  final Widget Function(mk.Player, mv.VideoControllerConfiguration)?
      videoOutputFactory;

  final _state = ValueNotifier(const VideoPlayerValue.uninitialized());
  final _subscriptions = <StreamSubscription<dynamic>>[];
  mk.Player? _player;
  mv.VideoController? _video;
  Widget? _injectedVideoOutput;
  Future<void>? _initialization;
  bool _closed = false;
  bool _failed = false;

  /// Kept for existing controls; every format now uses the extended engine.
  bool get usesExtendedEngine => true;
  mk.Player? get extendedPlayer => _player;
  @override
  VideoPlayerValue get value => _state.value;
  @override
  void addListener(VoidCallback listener) => _state.addListener(listener);
  @override
  void removeListener(VoidCallback listener) => _state.removeListener(listener);

  void _update(VideoPlayerValue next) {
    if (!_closed) _state.value = next;
  }

  Future<void> initialize() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    if (_closed) throw StateError('PLAYER_DISPOSED');
    if (mediaKitPlayerFactory == null) mk.MediaKit.ensureInitialized();
    final player = mediaKitPlayerFactory?.call() ?? mk.Player();
    _player = player;
    final configuration = mv.VideoControllerConfiguration(
        enableHardwareAcceleration: !software, hwdec: software ? 'no' : null);
    if (videoOutputFactory != null) {
      _injectedVideoOutput = videoOutputFactory!(player, configuration);
    } else {
      _video = mv.VideoController(player, configuration: configuration);
    }
    _subscriptions.addAll([
      player.stream.position.listen((v) {
        // libmpv can reset its clock to zero after an HTTP/decoder failure.
        // Keep the last position for a subsequent source/decoder handoff.
        if (!_failed) _update(value.copyWith(position: v));
      }),
      player.stream.duration
          .listen((v) => _update(value.copyWith(duration: v))),
      player.stream.playing.listen((v) {
        if (!_failed) _update(value.copyWith(isPlaying: v));
      }),
      player.stream.completed
          .listen((v) => _update(value.copyWith(isCompleted: v))),
      player.stream.buffering
          .listen((v) => _update(value.copyWith(isBuffering: v))),
      player.stream.width.listen((v) {
        if (v != null) {
          _update(value.copyWith(size: Size(v.toDouble(), value.size.height)));
        }
      }),
      player.stream.height.listen((v) {
        if (v != null) {
          _update(value.copyWith(size: Size(value.size.width, v.toDouble())));
        }
      }),
      player.stream.tracks.listen((_) => _update(value.copyWith())),
      player.stream.error.listen((v) {
        if (v.isNotEmpty) {
          _failed = true;
          // Native messages may contain signed URLs; keep them out of the UI.
          _update(value.copyWith(
              isPlaying: false, errorDescription: 'تعذر تشغيل المصدر'));
        }
      }),
    ]);
    await player.open(
        mk.Media(uri.toString(), httpHeaders: kIsWeb ? const {} : headers),
        play: false);
    if (_closed) throw StateError('PLAYER_DISPOSED');
    if (value.hasError) throw StateError('DECODER_OPEN_FAILED');
    _update(value.copyWith(
        isInitialized: true,
        duration: player.state.duration,
        size: Size((player.state.width ?? 0).toDouble(),
            (player.state.height ?? 0).toDouble())));
  }

  mk.Player get _activePlayer {
    if (_closed) throw StateError('PLAYER_DISPOSED');
    final player = _player;
    if (player == null) throw StateError('PLAYER_NOT_INITIALIZED');
    return player;
  }

  Future<void> play() => _activePlayer.play();
  Future<void> pause() => _activePlayer.pause();
  Future<void> seekTo(Duration position) => _activePlayer.seek(position);
  Future<void> setPlaybackSpeed(double speed) => _activePlayer.setRate(speed);
  Future<void> setVolume(double volume) =>
      _activePlayer.setVolume(volume * 100);

  Widget video() =>
      _injectedVideoOutput ??
      mv.Video(
          controller: _video!,
          fit: BoxFit.contain,
          controls: mv.NoVideoControls);

  Future<void> setSubtitleDelay(double seconds) async {
    try {
      final native = _player?.platform;
      if (native != null) {
        await (native as dynamic).setProperty('sub-delay', seconds.toString());
      }
    } catch (_) {}
  }

  Future<void> dispose() async {
    if (_closed) return;
    _closed = true;
    // Start all cancellation before releasing libmpv. In particular, an
    // unawaited widget disposal must not keep the native allocation alive while
    // waiting for a chain of stream cancellation futures.
    final cleanup = <Future<void>>[
      for (final subscription in _subscriptions) subscription.cancel(),
      if (_player != null) _player!.dispose(),
    ];
    _state.dispose();
    await Future.wait(cleanup);
  }
}
