import 'stream_bridge.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:video_player/video_player.dart';

import 'api_client.dart';
import 'app_target.dart';
import 'library_store.dart';
import 'media_format_policy.dart';
import 'models.dart';
import 'player_controls.dart';
import 'universal_player.dart';
import 'package:media_kit/media_kit.dart' as mk;

class PlayerPage extends StatefulWidget {
  const PlayerPage({
    super.key,
    required this.api,
    required this.store,
    required this.item,
    required this.title,
    this.sourceRef = '',
    this.mediaPath = '',
    this.mediaType = '',
    this.playbackMode = 'proxy',
    this.playbackHeaders = const {},
    this.playerFactory,
    this.streamBridgeFactory,
    this.episodeId = '',
    this.episodeNumber,
  });

  final AlQahtaniApi api;
  final LocalLibraryStore store;
  final CatalogItem item;
  final String title;
  final String sourceRef;
  final String mediaPath;
  final String mediaType;
  final String playbackMode;
  final Map<String, String> playbackHeaders;
  final String episodeId;
  final int? episodeNumber;
  final UniversalPlayer Function(Uri, String, Map<String, String>, bool)?
      playerFactory;

  final StreamBridge Function()? streamBridgeFactory;

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  UniversalPlayer? _controller;
  Timer? _progressTimer;
  Timer? _nativeStartupTimer;
  String _status = 'جاري تجهيز المشاهدة…';
  String _resolvedPlaybackMode = 'proxy';
  Map<String, String> _resolvedHeaders = const {};
  int _directRefreshAttempts = 0;
  bool _failed = false;
  bool _nativeFailureInFlight = false;
  double _playbackSpeed = 1.0;
  double _volume = 1.0;
  double _brightness = 1.0;
  bool _nativeBrightness = false;
  bool _fullscreen = true;
  Timer? _seekFeedbackTimer;
  String _seekFeedback = "";
  bool _controlsVisible = true;
  Timer? _controlsTimer;
  DateTime _lastBrightnessUpdate = DateTime.fromMillisecondsSinceEpoch(0);
  bool _gestureRight = false;
  StreamBridge? _streamBridge;
  final _sources = <PlaybackSource>[];
  int _sourceIndex = 0;
  int _generation = 0;
  DateTime? _expiresAt;
  Duration? _handoffPosition;
  final _decoderRetries = <int>{};
  int _bufferedTicks = 0;
  bool _requestedPlaying = true;

  @override
  void initState() {
    super.initState();
    _initialize();
    unawaited(_enterDisplay());
    unawaited(_readBrightness());
    unawaited(_keepScreenOn(true));
  }

  Future<void> _enterDisplay() async {
    if (kIsWeb) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (!isTvTarget) {
      await SystemChrome.setPreferredOrientations(
          [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    }
  }

  void _doubleTapSeek() {
    unawaited(_seekBy(Duration(seconds: _gestureRight ? 10 : -10)));
    _seekFeedbackTimer?.cancel();
    setState(() => _seekFeedback = _gestureRight ? '+10 ثوانٍ' : '−10 ثوانٍ');
    _seekFeedbackTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _seekFeedback = '');
    });
  }

  Future<void> _keepScreenOn(bool value) async {
    try {
      await WakelockPlus.toggle(enable: value);
    } catch (_) {}
  }

  Future<void> _readBrightness() async {
    if (isTvTarget) return;
    try {
      final value = await ScreenBrightness.instance.application;
      if (mounted) setState(() => _brightness = value.clamp(.15, 1));
    } catch (_) {}
  }

  Future<void> _setBrightness() async {
    if (DateTime.now().difference(_lastBrightnessUpdate).inMilliseconds < 100) {
      return;
    }
    _lastBrightnessUpdate = DateTime.now();
    try {
      await ScreenBrightness.instance
          .setApplicationScreenBrightness(_brightness);
      if (mounted && !_nativeBrightness) {
        setState(() => _nativeBrightness = true);
      }
    } catch (_) {}
  }

  void _revealControls() {
    _controlsTimer?.cancel();
    if (mounted) setState(() => _controlsVisible = true);
    if (!isTvTarget) {
      _controlsTimer = Timer(const Duration(seconds: 4), () {
        if (mounted && _controller?.value.isPlaying == true) {
          setState(() => _controlsVisible = false);
        }
      });
    }
  }

  Future<void> _toggleFullscreen() async {
    setState(() => _fullscreen = !_fullscreen);
    _revealControls();
    await SystemChrome.setEnabledSystemUIMode(
        _fullscreen ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);
    if (!isTvTarget) {
      await SystemChrome.setPreferredOrientations(_fullscreen
          ? [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]
          : DeviceOrientation.values);
    }
  }

  Future<void> _restoreDisplay() async {
    try {
      if (_nativeBrightness) {
        await ScreenBrightness.instance.resetApplicationScreenBrightness();
      }
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      if (!isTvTarget) {
        await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      }
    } catch (_) {}
  }

  Future<void> _initialize(
      {bool forceRefresh = false,
      bool keepSources = false,
      bool software = false}) async {
    final generation = ++_generation;
    _nativeStartupTimer?.cancel();
    _nativeFailureInFlight = false;
    try {
      var mediaPath = widget.mediaPath;
      var mediaType = widget.mediaType;
      var playbackMode = widget.playbackMode;
      var playbackHeaders = widget.playbackHeaders;
      DateTime? expiresAt;
      if (!keepSources && (mediaPath.isEmpty || widget.sourceRef.isNotEmpty)) {
        final TitleDetails resolved = await widget.api
            .resolvePlayback(widget.sourceRef, refresh: forceRefresh);
        if (!mounted || generation != _generation) return;
        mediaPath = resolved.mediaPath;
        mediaType = resolved.mediaType;
        playbackMode = resolved.playbackMode;
        playbackHeaders = resolved.playbackHeaders;
        expiresAt = resolved.expiresAt;
        _expiresAt = expiresAt;
        _sources.clear();
        _sourceIndex = 0;
        _decoderRetries.clear();
        _sources.addAll(widget.api.sourceRouter.rank(
            resolved.mediaSources.isEmpty
                ? [PlaybackSource(mediaPath: mediaPath, mediaType: mediaType)]
                : resolved.mediaSources));
      }
      if (keepSources && _sources.isNotEmpty) {
        mediaPath = _sources[_sourceIndex].mediaPath;
        mediaType = _sources[_sourceIndex].mediaType;
        playbackMode = _sources[_sourceIndex].playbackMode.isNotEmpty
            ? _sources[_sourceIndex].playbackMode
            : _resolvedPlaybackMode;
        playbackHeaders = _sources[_sourceIndex].headers.isNotEmpty
            ? _sources[_sourceIndex].headers
            : _resolvedHeaders;
        expiresAt = _sources[_sourceIndex].expiresAt ?? _expiresAt;
      }
      _resolvedPlaybackMode = playbackMode;
      _resolvedHeaders = playbackHeaders;
      if (!mounted) return;
      final previousBridge = _streamBridge;
      _streamBridge = null;
      await previousBridge?.close();
      if (!mounted || generation != _generation) return;
      Uri uri;
      if (playbackMode == 'local_proxy' || playbackMode == 'edge_local_proxy') {
        final bridge = widget.streamBridgeFactory?.call() ??
            LocalStreamBridge(trustedEdge: playbackMode == 'edge_local_proxy');
        _streamBridge = bridge;
        uri = await bridge.open(Uri.parse(mediaPath), playbackHeaders);
        if (!mounted || generation != _generation) {
          await bridge.close();
          return;
        }
        // Upstream headers belong to the bridge, never to its loopback request.
        playbackHeaders = const {};
      } else {
        uri = widget.api.mediaUri(mediaPath,
            playbackMode: playbackMode, expiresAt: expiresAt);
      }
      final controller = widget.playerFactory
              ?.call(uri, mediaType, playbackHeaders, software) ??
          UniversalPlayer(
            uri,
            mediaType: mediaType,
            headers: playbackHeaders,
            software: software,
          );
      _controller = controller;
      controller.addListener(_nativeValueChanged);
      final startup = Stopwatch()..start();
      await controller.initialize().timeout(const Duration(seconds: 25));
      await controller.setPlaybackSpeed(_playbackSpeed);
      await controller.setVolume(_volume);
      if (!mounted || controller != _controller) return;
      final resume = _handoffPosition ??
          widget.store
              .resumePosition(widget.item.ref, episodeId: widget.episodeId);
      if ((_handoffPosition != null || resume >= const Duration(seconds: 5)) &&
          (controller.value.duration <= Duration.zero ||
              resume < controller.value.duration)) {
        await controller.seekTo(resume);
      }
      setState(() {
        _failed = false;
        _status = 'جاهز للمشاهدة • ${runtimeMediaLabel(mediaType)}';
      });
      _progressTimer?.cancel();
      final initialPosition = controller.value.position;
      _bufferedTicks = 0;
      _requestedPlaying = true;
      _progressTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        final value = controller.value;
        if (value.position > initialPosition + const Duration(seconds: 5)) {
          _directRefreshAttempts = 0;
        }
        if (_requestedPlaying && value.isBuffering) {
          _bufferedTicks++;
        } else {
          _bufferedTicks = 0;
        }
        if (_bufferedTicks >= 6 && !_nativeFailureInFlight) {
          unawaited(_fallbackFromNative('تعذر استمرار التشغيل'));
          return;
        }
        unawaited(_saveProgress());
      });
      widget.api.sourceRouter.record(mediaPath,
          success: true, latencyMs: startup.elapsedMilliseconds);
      await controller.play();
      _revealControls();
      _nativeStartupTimer = Timer(const Duration(seconds: 12), () {
        if (!mounted || controller != _controller) return;
        final value = controller.value;
        final neverStarted =
            value.position < const Duration(milliseconds: 500) &&
                !value.isPlaying;
        if (value.hasError || neverStarted) {
          unawaited(_fallbackFromNative('تعذر بدء التشغيل بالمشغل الأصلي'));
        }
      });
    } catch (_) {
      if (!mounted || generation != _generation) return;
      await _fallbackFromNative('تعذر تشغيل هذا المصدر داخل المشغل الأصلي');
    }
  }

  void _nativeValueChanged() {
    final controller = _controller;
    if (controller == null || _nativeFailureInFlight) {
      return;
    }
    if (controller.value.hasError) {
      unawaited(_fallbackFromNative('تعذر استمرار التشغيل بالمشغل الأصلي'));
    }
  }

  Future<void> _fallbackFromNative(String failureMessage) async {
    if (_nativeFailureInFlight) return;
    _nativeFailureInFlight = true;
    _nativeStartupTimer?.cancel();
    final controller = _controller;
    if (controller != null) {
      if (controller.value.isInitialized) {
        _handoffPosition = controller.value.position;
      }
      controller.removeListener(_nativeValueChanged);
      try {
        await controller.pause().timeout(const Duration(seconds: 2));
      } catch (_) {}
      try {
        await controller.dispose().timeout(const Duration(seconds: 2));
      } catch (_) {}
    }
    _controller = null;
    if (mounted) {
      setState(() {
        _failed = false;
        _status = 'جاري تجربة مصدر بديل…';
      });
    }
    _progressTimer?.cancel();
    if (!mounted) return;
    final edgeSources = _sources.any((s) => s.playbackMode.startsWith('edge_'));
    if (edgeSources && _sources.isNotEmpty) {
      widget.api.sourceRouter
          .record(_sources[_sourceIndex].mediaPath, success: false);
      if (_sourceIndex + 1 < _sources.length) {
        _sourceIndex += 1;
        _nativeFailureInFlight = false;
        await _initialize(keepSources: true);
        return;
      }
      if (_directRefreshAttempts < 1) {
        _directRefreshAttempts += 1;
        _nativeFailureInFlight = false;
        await _initialize(forceRefresh: true);
        return;
      }
    }
    if (!edgeSources &&
        widget.sourceRef.startsWith('3isk:') &&
        _directRefreshAttempts < 1) {
      _directRefreshAttempts += 1;
      _nativeFailureInFlight = false;
      await _initialize(forceRefresh: true);
      return;
    }
    if (!edgeSources &&
        !widget.sourceRef.startsWith('3isk:') &&
        _sources.isNotEmpty) {
      if (controller != null &&
          !controller.usesExtendedEngine &&
          _decoderRetries.add(_sourceIndex)) {
        _nativeFailureInFlight = false;
        await _initialize(keepSources: true, software: true);
        return;
      }
      widget.api.sourceRouter
          .record(_sources[_sourceIndex].mediaPath, success: false);
      if (_sourceIndex + 1 < _sources.length) {
        _sourceIndex += 1;
        _nativeFailureInFlight = false;
        await _initialize(keepSources: true);
        return;
      }
    }
    if (!edgeSources &&
        !widget.sourceRef.startsWith('3isk:') &&
        widget.sourceRef.isNotEmpty &&
        _directRefreshAttempts < 1) {
      _directRefreshAttempts += 1;
      _nativeFailureInFlight = false;
      await _initialize(forceRefresh: true);
      return;
    }
    setState(() {
      _failed = true;
      _status = kIsWeb
          ? 'تعذر التشغيل في المتصفح. جرّب تطبيق الهاتف أو التلفزيون.'
          : failureMessage;
    });
    _nativeFailureInFlight = false;
  }

  Future<void> _saveProgress() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        !controller.value.isPlaying) {
      return;
    }
    await widget.store.recordProgress(
      item: widget.item,
      position: controller.value.position,
      duration: controller.value.duration,
      episodeId: widget.episodeId,
      episodeNumber: widget.episodeNumber,
    );
  }

  Future<void> _seekBy(Duration delta) async {
    _revealControls();
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final duration = controller.value.duration;
    var target = controller.value.position + delta;
    if (target < Duration.zero) target = Duration.zero;
    if (duration > Duration.zero && target > duration) target = duration;
    await controller.seekTo(target);
  }

  Future<void> _togglePlay(UniversalPlayer controller) async {
    _revealControls();
    _requestedPlaying = !controller.value.isPlaying;
    if (controller.value.isPlaying) {
      await controller.pause();
    } else {
      await controller.play();
    }
  }

  Future<void> _setPlaybackSpeed(double speed) async {
    _revealControls();
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    await controller.setPlaybackSpeed(speed);
    if (!mounted) return;
    setState(() => _playbackSpeed = speed);
  }

  @override
  void dispose() {
    _generation++;
    _controlsTimer?.cancel();
    _seekFeedbackTimer?.cancel();
    unawaited(_restoreDisplay());
    unawaited(_keepScreenOn(false));
    _nativeStartupTimer?.cancel();
    _progressTimer?.cancel();
    _saveProgress();
    _controller?.removeListener(_nativeValueChanged);
    _controller?.dispose();
    unawaited(_streamBridge?.close() ?? Future.value());
    super.dispose();
  }

  Widget _modernControls(UniversalPlayer activeController) => Container(
        decoration: const BoxDecoration(
            gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Color(0xE6000000)])),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ValueListenableBuilder<VideoPlayerValue>(
            valueListenable: activeController,
            builder: (context, value, _) => PlayerControls(
              isPlaying: value.isPlaying,
              isTv: isTvTarget,
              playbackSpeed: _playbackSpeed,
              onRewind: () => _seekBy(const Duration(seconds: -10)),
              onTogglePlay: () => _togglePlay(activeController),
              onForward: () => _seekBy(const Duration(seconds: 10)),
              onPlaybackSpeedChanged: _setPlaybackSpeed,
            ),
          ),
          ValueListenableBuilder<VideoPlayerValue>(
              valueListenable: activeController,
              builder: (context, value, _) {
                final maximum = value.duration.inMilliseconds.toDouble();
                return Column(children: [
                  Slider(
                      value: value.position.inMilliseconds
                          .toDouble()
                          .clamp(0, maximum > 0 ? maximum : 1),
                      max: maximum > 0 ? maximum : 1,
                      onChanged: maximum > 0
                          ? (v) => activeController
                              .seekTo(Duration(milliseconds: v.round()))
                          : null),
                  Text(
                      '${_time(value.position)} • المتبقي ${_time(value.duration - value.position)}',
                      style: const TextStyle(fontSize: 12)),
                  _trackControls(activeController),
                ]);
              })
        ]),
      );

  String _time(Duration v) =>
      '${v.inMinutes}:${(v.inSeconds % 60).toString().padLeft(2, '0')}';
  Future<void> _externalSubtitle(mk.Player player) async {
    final input = TextEditingController();
    final raw = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('إضافة ترجمة'),
                content: TextField(
                    controller: input,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                        hintText: 'رابط HTTPS لملف SRT أو VTT')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('إلغاء')),
                  FilledButton(
                      onPressed: () =>
                          Navigator.pop(context, input.text.trim()),
                      child: const Text('إضافة'))
                ]));
    input.dispose();
    if (!mounted || raw == null) return;
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        !RegExp(r'\.(srt|vtt)$', caseSensitive: false).hasMatch(uri.path)) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('أدخل رابط ترجمة صالحًا')));
      return;
    }
    await player.setSubtitleTrack(
        mk.SubtitleTrack.uri(uri.toString(), title: 'ترجمة خارجية'));
    _revealControls();
  }

  Widget _trackControls(UniversalPlayer controller) {
    final player = controller.extendedPlayer;
    return Wrap(alignment: WrapAlignment.center, spacing: 12, children: [
      if (player == null)
        IconButton(
            tooltip: 'خيارات الصوت والترجمة',
            icon: const Icon(Icons.audiotrack),
            onPressed: () async {
              _handoffPosition = controller.value.position;
              controller.removeListener(_nativeValueChanged);
              await controller.dispose();
              _controller = null;
              _decoderRetries.add(_sourceIndex);
              await _initialize(keepSources: true, software: true);
            }),
      if (_sources.length > 1)
        PopupMenuButton<int>(
            tooltip: 'الجودة / المصدر',
            onOpened: () => _controlsTimer?.cancel(),
            onCanceled: _revealControls,
            icon: const Icon(Icons.high_quality),
            itemBuilder: (_) => [
                  for (var i = 0; i < _sources.length; i++)
                    PopupMenuItem(
                        value: i, child: Text(_sources[i].displayLabel))
                ],
            onSelected: (i) async {
              _revealControls();
              if (i == _sourceIndex) return;
              if (controller.value.isInitialized) {
                _handoffPosition = controller.value.position;
              }
              controller.removeListener(_nativeValueChanged);
              await controller.dispose();
              _controller = null;
              _sourceIndex = i;
              await _initialize(keepSources: true);
            }),
      if (player != null &&
          player.state.tracks.video
                  .where((t) => t.id != 'auto' && t.id != 'no')
                  .length >
              1)
        PopupMenuButton<mk.VideoTrack>(
            tooltip: 'الجودة',
            icon: const Icon(Icons.high_quality),
            itemBuilder: (_) => player.state.tracks.video
                .where((t) => t.id != 'no')
                .map((t) => PopupMenuItem(
                    value: t,
                    child: Text(t.id == 'auto' ? 'تلقائي' : t.title ?? t.id)))
                .toList(),
            onSelected: player.setVideoTrack),
      if (player != null && player.state.tracks.audio.length > 2)
        PopupMenuButton<mk.AudioTrack>(
            tooltip: 'الصوت',
            icon: const Icon(Icons.audiotrack),
            itemBuilder: (_) => player.state.tracks.audio
                .map((t) => PopupMenuItem(
                    value: t,
                    child: Text(t.id == 'auto'
                        ? 'تلقائي'
                        : t.id == 'no'
                            ? 'إيقاف'
                            : t.title ?? t.language ?? t.id)))
                .toList(),
            onSelected: player.setAudioTrack),
      if (player != null)
        IconButton(
            tooltip: 'إضافة ترجمة خارجية',
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: () => _externalSubtitle(player)),
      if (player != null && player.state.tracks.subtitle.length > 2)
        PopupMenuButton<mk.SubtitleTrack>(
            tooltip: 'الترجمة',
            icon: const Icon(Icons.subtitles),
            itemBuilder: (_) => player.state.tracks.subtitle
                .map((t) => PopupMenuItem(
                    value: t,
                    child: Text(t.id == 'auto'
                        ? 'تلقائي'
                        : t.id == 'no'
                            ? 'إيقاف'
                            : t.title ?? t.language ?? t.id)))
                .toList(),
            onSelected: player.setSubtitleTrack),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final activeController =
        controller?.value.isInitialized == true ? controller : null;
    return Scaffold(
      appBar: _fullscreen ? null : AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints:
                BoxConstraints(maxWidth: _fullscreen ? double.infinity : 1100),
            child: Padding(
              padding: EdgeInsets.all(_fullscreen ? 0 : 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (activeController != null)
                    Flexible(
                        child: AspectRatio(
                      aspectRatio: activeController.value.aspectRatio > 0
                          ? activeController.value.aspectRatio
                          : 16 / 9,
                      child: LayoutBuilder(
                          builder: (context, constraints) => GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => _controlsVisible
                                    ? setState(() => _controlsVisible = false)
                                    : _revealControls(),
                                onDoubleTapDown: (d) => _gestureRight =
                                    d.localPosition.dx >
                                        constraints.maxWidth / 2,
                                onDoubleTap: _doubleTapSeek,
                                onVerticalDragStart: isTvTarget
                                    ? null
                                    : (d) => _gestureRight =
                                        d.localPosition.dx >
                                            constraints.maxWidth / 2,
                                onVerticalDragUpdate: isTvTarget
                                    ? null
                                    : (d) {
                                        final change =
                                            -(d.primaryDelta ?? 0) / 240;
                                        setState(() {
                                          if (_gestureRight) {
                                            _volume =
                                                (_volume + change).clamp(0, 1);
                                          } else {
                                            _brightness = (_brightness + change)
                                                .clamp(.15, 1);
                                          }
                                        });
                                        if (_gestureRight) {
                                          unawaited(activeController
                                              .setVolume(_volume));
                                        } else {
                                          unawaited(_setBrightness());
                                        }
                                        _revealControls();
                                      },
                                child: Stack(fit: StackFit.expand, children: [
                                  activeController.video(),
                                  if (_seekFeedback.isNotEmpty)
                                    IgnorePointer(
                                        child: Align(
                                      alignment: _gestureRight
                                          ? Alignment.centerRight
                                          : Alignment.centerLeft,
                                      child: Container(
                                          margin: const EdgeInsets.all(28),
                                          padding: const EdgeInsets.all(16),
                                          decoration: BoxDecoration(
                                              color: Colors.black54,
                                              borderRadius:
                                                  BorderRadius.circular(20)),
                                          child: Text(_seekFeedback,
                                              style: const TextStyle(
                                                  fontSize: 22,
                                                  color: Colors.white))),
                                    )),
                                  if (_controlsVisible && _fullscreen)
                                    Positioned(
                                        top: 4,
                                        left: 4,
                                        child: IconButton(
                                            tooltip: 'رجوع',
                                            icon: const Icon(Icons.arrow_back),
                                            onPressed: () =>
                                                Navigator.of(context)
                                                    .maybePop())),
                                  if (_controlsVisible)
                                    Positioned(
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        child:
                                            _modernControls(activeController)),
                                  if (_controlsVisible)
                                    Positioned(
                                        top: 4,
                                        right: 4,
                                        child: IconButton(
                                            tooltip: _fullscreen
                                                ? 'تصغير'
                                                : 'ملء الشاشة',
                                            icon: Icon(_fullscreen
                                                ? Icons.fullscreen_exit
                                                : Icons.fullscreen),
                                            onPressed: _toggleFullscreen)),
                                  IgnorePointer(
                                      child: ColoredBox(
                                          color: Colors.black.withValues(
                                              alpha: _nativeBrightness
                                                  ? 0
                                                  : 1 - _brightness))),
                                ]),
                              )),
                    ))
                  else if (_failed)
                    const Icon(Icons.error_outline, size: 72)
                  else
                    const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  if (!_fullscreen || _failed)
                    Text(_status, textAlign: TextAlign.center),
                  if (_failed) ...[
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      autofocus: isTvTarget,
                      onPressed: () {
                        _controller?.dispose();
                        _controller = null;
                        setState(() {
                          _failed = false;
                          _status = 'جاري إعادة المحاولة…';
                        });
                        _initialize();
                      },
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                    const SizedBox(height: 8),
                    const Text('جرّب إعادة المحاولة أو اختيار عمل آخر.',
                        textAlign: TextAlign.center),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
