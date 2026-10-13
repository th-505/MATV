import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart' as mk;
import 'package:media_kit_video/media_kit_video.dart' as mv;
import 'package:video_player/video_player.dart';
import 'media_format_policy.dart';

/// Native decoding for common HLS/MP4; libmpv/FFmpeg for other containers
/// and for an explicit native decoder retry. Media headers reach both engines.
class UniversalPlayer implements ValueListenable<VideoPlayerValue> {
  UniversalPlayer(this.uri,
      {required this.mediaType,
      this.headers = const {},
      this.software = false});
  final Uri uri;
  final String mediaType;
  final Map<String, String> headers;
  final bool software;
  final _state = ValueNotifier(const VideoPlayerValue.uninitialized());
  final _subscriptions = <StreamSubscription<dynamic>>[];
  VideoPlayerController? _native;
  mk.Player? _player;
  mv.VideoController? _video;
  bool _closed = false;
  bool get usesExtendedEngine =>
      software || usesExtendedMediaEngine(mediaType, uri.path);
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

  void _nativeChanged() {
    final controller = _native;
    if (controller != null) _update(controller.value);
  }

  Future<void> initialize() async {
    if (!usesExtendedEngine) {
      _native = uri.scheme == 'file'
          ? VideoPlayerController.file(File(uri.toFilePath()))
          : VideoPlayerController.networkUrl(uri,
              httpHeaders: headers,
              formatHint: videoFormatHintForRuntimeMedia(mediaType));
      _native!.addListener(_nativeChanged);
      await _native!.initialize();
      return;
    }
    mk.MediaKit.ensureInitialized();
    final player = mk.Player();
    _player = player;
    _video = mv.VideoController(player);
    _subscriptions.addAll([
      player.stream.position
          .listen((v) => _update(value.copyWith(position: v))),
      player.stream.duration
          .listen((v) => _update(value.copyWith(duration: v))),
      player.stream.playing
          .listen((v) => _update(value.copyWith(isPlaying: v))),
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
          _update(VideoPlayerValue.erroneous('تعذر تشغيل المصدر'));
        }
      }),
    ]);
    await player.open(mk.Media(uri.toString(), httpHeaders: headers),
        play: false);
    if (value.hasError) throw StateError('DECODER_OPEN_FAILED');
    _update(value.copyWith(
        isInitialized: true,
        duration: player.state.duration,
        size: Size((player.state.width ?? 1920).toDouble(),
            (player.state.height ?? 1080).toDouble())));
  }

  Future<void> play() => _native?.play() ?? _player!.play();
  Future<void> pause() => _native?.pause() ?? _player!.pause();
  Future<void> seekTo(Duration position) =>
      _native?.seekTo(position) ?? _player!.seek(position);
  Future<void> setPlaybackSpeed(double speed) =>
      _native?.setPlaybackSpeed(speed) ?? _player!.setRate(speed);
  Future<void> setVolume(double volume) =>
      _native?.setVolume(volume) ?? _player!.setVolume(volume * 100);
  Widget video() => _native != null
      ? VideoPlayer(_native!)
      : mv.Video(controller: _video!, controls: mv.NoVideoControls);
  Future<void> dispose() async {
    if (_closed) return;
    _closed = true;
    _native?.removeListener(_nativeChanged);
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    await _native?.dispose();
    await _player?.dispose();
    _state.dispose();
  }
}
