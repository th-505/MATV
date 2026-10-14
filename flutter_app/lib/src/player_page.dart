import 'stream_bridge.dart';
import 'fullscreen_video_surface.dart';
import 'download_service.dart';
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
import 'subtitles_service.dart';
import 'package:media_kit/media_kit.dart' as mk;

bool sourcesShareTimeline(PlaybackSource from, PlaybackSource to) {
  final fromEdition = from.edition.trim();
  final toEdition = to.edition.trim();
  if (fromEdition.isNotEmpty &&
      toEdition.isNotEmpty &&
      fromEdition != toEdition) {
    return false;
  }
  if (from.mediaPath == to.mediaPath && from.mediaPath.isNotEmpty) return true;
  const providers = {'3isk', 'akoam', 'alooy', 'laroza', 'matches'};
  final sameProvider =
      providers.contains(from.providerId) && from.providerId == to.providerId;
  return sameProvider ||
      (from.timelineVerified &&
          to.timelineVerified &&
          fromEdition.isNotEmpty &&
          fromEdition == toEdition);
}

Duration sourceHandoffPosition(
    Duration position, PlaybackSource from, PlaybackSource to) {
  if (!sourcesShareTimeline(from, to)) return Duration.zero;
  final verifiedOffsets = from.timelineVerified &&
      to.timelineVerified &&
      from.edition.trim().isNotEmpty &&
      from.edition.trim() == to.edition.trim();
  final milliseconds = position.inMilliseconds -
      (verifiedOffsets ? from.timelineOffsetMs ?? 0 : 0) +
      (verifiedOffsets ? to.timelineOffsetMs ?? 0 : 0);
  return Duration(milliseconds: milliseconds < 0 ? 0 : milliseconds);
}

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
    this.isLive = false,
    this.localFileUri,
    this.persistProgress = true,
  });

  final MitvApi api;
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
  final bool isLive;
  final Uri? localFileUri;
  final bool persistProgress;
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
  BoxFit _videoFit = BoxFit.contain;
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
  Duration? _lastObservedPosition;
  PlaybackSource? _activeSource;
  final _decoderRetries = <int>{};
  int _bufferedTicks = 0;
  bool _requestedPlaying = true;
  String _currentMediaPath = '';
  String _currentMediaType = '';
  Map<String, String> _currentHeaders = const {};
  DownloadService? _downloadService;
  DownloadCancellationToken? _downloadToken;
  DownloadProgress? _downloadProgress;
  double _subDelay = 0.0;
  final SubtitlesService _subtitlesService = SubtitlesService();

  @override
  void initState() {
    super.initState();
    _initialize();
    unawaited(_enterDisplay());
    unawaited(_readBrightness());
    unawaited(_keepScreenOn(true));
  }

  Future<void> _enterDisplay() async {
    if (kIsWeb || isDesktopTarget) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (!isTvTarget && !isDesktopTarget) {
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
      if (mounted) {
        setState(() {
          _brightness = value.clamp(.15, 1);
          _nativeBrightness = true;
        });
      }
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
    _controlsTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && _controller?.value.isPlaying == true) {
        setState(() => _controlsVisible = false);
      }
    });
  }

  Future<void> _toggleFullscreen() async {
    setState(() => _fullscreen = !_fullscreen);
    _revealControls();
    await SystemChrome.setEnabledSystemUIMode(
        _fullscreen ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);
    if (!isTvTarget && !isDesktopTarget) {
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
      if (!isTvTarget && !isDesktopTarget) {
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
      var mediaPath = widget.localFileUri?.toString() ?? widget.mediaPath;
      var mediaType = widget.mediaType;
      var playbackMode = widget.playbackMode;
      var playbackHeaders = widget.playbackHeaders;
      DateTime? expiresAt;
      if (!keepSources && (mediaPath.isEmpty || widget.sourceRef.isNotEmpty)) {
        final previousSource = _activeSource;
        final previousPosition = _handoffPosition;
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
        if (previousSource != null) {
          final compatible = _sources.indexWhere(
              (source) => sourcesShareTimeline(previousSource, source));
          if (compatible < 0) {
            throw StateError('NO_COMPATIBLE_SOURCE_TIMELINE');
          }
          _sourceIndex = compatible;
          if (previousPosition != null) {
            _handoffPosition = sourceHandoffPosition(
                previousPosition, previousSource, _sources[compatible]);
          }
        }
      }
      if (_sources.isNotEmpty) {
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
      _currentMediaPath = mediaPath;
      _currentMediaType = mediaType;
      _currentHeaders = playbackHeaders;
      _resolvedPlaybackMode = playbackMode;
      _resolvedHeaders = playbackHeaders;
      if (!mounted) return;
      final previousBridge = _streamBridge;
      _streamBridge = null;
      await previousBridge?.close();
      if (!mounted || generation != _generation) return;
      Uri uri;
      if (widget.localFileUri != null) {
        uri = widget.localFileUri!;
        if (uri.scheme != 'file' || uri.host.isNotEmpty) {
          throw StateError('INVALID_LOCAL_FILE');
        }
      } else if (playbackMode == 'local_proxy' ||
          playbackMode == 'edge_local_proxy') {
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
      if (_sources.isNotEmpty) {
        if (_activeSource?.mediaPath != _sources[_sourceIndex].mediaPath) {
          _lastObservedPosition = null;
        }
        _activeSource = _sources[_sourceIndex];
      }
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
      if (!widget.isLive &&
          (_handoffPosition != null || resume >= const Duration(seconds: 5)) &&
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
          final isNoMatch = widget.isLive;
          final msg = isNoMatch
              ? 'لم يبدأ البث بعد أو المصدر غير متاح حالياً. يرجى تجربة خادم آخر أو المحاولة عند بداية المباراة.'
              : 'تعذر بدء التشغيل بالمشغل الأصلي';
          unawaited(_fallbackFromNative(msg));
        }
      });
    } catch (e) {
      if (!mounted || generation != _generation) return;
      final isNoMatch = widget.isLive || e.toString().contains('NO_MATCH_MEDIA');
      final msg = isNoMatch
          ? 'لم يبدأ البث بعد أو المصدر غير متاح حالياً. يرجى تجربة خادم آخر أو المحاولة عند بداية المباراة.'
          : 'تعذر تشغيل هذا المصدر داخل المشغل الأصلي';
      await _fallbackFromNative(msg);
    }
  }

  void _nativeValueChanged() {
    final controller = _controller;
    if (controller == null || _nativeFailureInFlight) {
      return;
    }
    if (!controller.value.hasError && controller.value.isInitialized) {
      _lastObservedPosition = controller.value.position;
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
      if (controller.value.isInitialized && !controller.value.hasError) {
        _handoffPosition = controller.value.position;
      } else if (_lastObservedPosition != null) {
        _handoffPosition = _lastObservedPosition;
      } else if (controller.value.isInitialized) {
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
    if (widget.localFileUri != null &&
        controller != null &&
        !controller.software &&
        _decoderRetries.add(-1)) {
      _nativeFailureInFlight = false;
      await _initialize(keepSources: true, software: true);
      return;
    }
    final edgeSources = _sources.any((s) => s.playbackMode.startsWith('edge_'));
    if (edgeSources && _sources.isNotEmpty) {
      widget.api.sourceRouter
          .record(_sources[_sourceIndex].mediaPath, success: false);
      final alternative = _compatibleAlternative();
      if (alternative != null) {
        _prepareHandoff(alternative);
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
          !controller.software &&
          _decoderRetries.add(_sourceIndex)) {
        _nativeFailureInFlight = false;
        await _initialize(keepSources: true, software: true);
        return;
      }
      widget.api.sourceRouter
          .record(_sources[_sourceIndex].mediaPath, success: false);
      final alternative = _compatibleAlternative();
      if (alternative != null) {
        _prepareHandoff(alternative);
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

  int? _compatibleAlternative() {
    final origin = _activeSource;
    if (origin == null) return null;
    for (var index = _sourceIndex + 1; index < _sources.length; index++) {
      if (sourcesShareTimeline(origin, _sources[index])) return index;
    }
    return null;
  }

  void _prepareHandoff(int index) {
    final origin = _activeSource;
    if (origin != null && _handoffPosition != null) {
      _handoffPosition =
          sourceHandoffPosition(_handoffPosition!, origin, _sources[index]);
    }
    _sourceIndex = index;
  }

  Future<void> _selectSource(int index) async {
    if (index < 0 || index >= _sources.length || _nativeFailureInFlight) return;
    final controller = _controller;
    if (index == _sourceIndex && controller != null) return;
    final origin = _activeSource;
    final position = controller?.value.isInitialized == true &&
            controller?.value.hasError == false
        ? controller!.value.position
        : _lastObservedPosition ?? _handoffPosition ?? Duration.zero;
    final compatible =
        origin != null && sourcesShareTimeline(origin, _sources[index]);
    _handoffPosition = compatible
        ? sourceHandoffPosition(position, origin, _sources[index])
        : Duration.zero;
    if (!compatible) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('نسخة هذا المصدر غير متطابقة؛ يبدأ التشغيل من البداية.')));
    }
    _nativeFailureInFlight = true;
    _nativeStartupTimer?.cancel();
    _progressTimer?.cancel();
    controller?.removeListener(_nativeValueChanged);
    _controller = null;
    if (mounted) {
      setState(() {
        _failed = false;
        _status = 'جاري تبديل المصدر…';
      });
    }
    await controller?.dispose();
    if (!mounted) return;
    _sourceIndex = index;
    await _initialize(keepSources: true);
  }

  Widget _sourceMenu() => PopupMenuButton<int>(
      tooltip: 'الجودة / المصدر',
      onOpened: () => _controlsTimer?.cancel(),
      onCanceled: _revealControls,
      icon: const Icon(Icons.high_quality),
      itemBuilder: (_) => [
            for (var i = 0; i < _sources.length; i++)
              PopupMenuItem(value: i, child: Text(_sources[i].displayLabel))
          ],
      onSelected: _selectSource);

  Future<void> _saveProgress() async {
    if (widget.isLive || !widget.persistProgress) return;
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
    if (widget.isLive && duration <= Duration.zero) return;
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
    _downloadToken?.cancel();
    _downloadService?.close();
    _subtitlesService.close();
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
                  if (!widget.isLive || maximum > 0)
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
                      widget.isLive
                          ? 'بث مباشر • ${_time(value.position)}'
                          : '${_time(value.position)} • المتبقي ${_time(value.duration - value.position)}',
                      style: const TextStyle(fontSize: 12)),
                  _trackControls(activeController),
                ]);
              })
        ]),
      );

  String _time(Duration v) =>
      '${v.inMinutes}:${(v.inSeconds % 60).toString().padLeft(2, '0')}';
  Future<void> _adjustSubtitleDelay(UniversalPlayer controller, double delta) async {
    setState(() => _subDelay = double.parse((_subDelay + delta).toStringAsFixed(2)));
    await controller.setSubtitleDelay(_subDelay);
    if (mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        duration: const Duration(seconds: 1),
        content: Text('تزامن الترجمة: ${_subDelay >= 0 ? '+' : ''}${_subDelay.toStringAsFixed(2)} ث'),
      ));
    }
  }

  Future<void> _resetSubtitleDelay(UniversalPlayer controller) async {
    setState(() => _subDelay = 0.0);
    await controller.setSubtitleDelay(0.0);
    if (mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        duration: Duration(seconds: 1),
        content: Text('تمت إعادة ضبط تزامن الترجمة إلى 0.0 ث'),
      ));
    }
  }

  void _showSubtitleDelayDialog(UniversalPlayer controller) {
    _controlsTimer?.cancel();
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF151F32),
          title: const Text('موازنة تزامن الترجمة (sub-delay)'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'التأخير الحالي: ${_subDelay >= 0 ? '+' : ''}${_subDelay.toStringAsFixed(2)} ث',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFDEE9F8)),
              ),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: () {
                      _adjustSubtitleDelay(controller, -0.5);
                      setDialogState(() {});
                    },
                    child: const Text('−0.5 ث'),
                  ),
                  OutlinedButton(
                    onPressed: () {
                      _adjustSubtitleDelay(controller, -0.25);
                      setDialogState(() {});
                    },
                    child: const Text('−0.25 ث'),
                  ),
                  FilledButton.tonal(
                    onPressed: () {
                      _resetSubtitleDelay(controller);
                      setDialogState(() {});
                    },
                    child: const Text('إعادة ضبط (0 ث)'),
                  ),
                  OutlinedButton(
                    onPressed: () {
                      _adjustSubtitleDelay(controller, 0.25);
                      setDialogState(() {});
                    },
                    child: const Text('+0.25 ث'),
                  ),
                  OutlinedButton(
                    onPressed: () {
                      _adjustSubtitleDelay(controller, 0.5);
                      setDialogState(() {});
                    },
                    child: const Text('+0.5 ث'),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('إغلاق'),
            ),
          ],
        ),
      ),
    ).then((_) => _revealControls());
  }

  Future<void> _externalSubtitle(mk.Player player) async {
    _controlsTimer?.cancel();
    final effectiveImdb = widget.item.imdbId.isNotEmpty ? widget.item.imdbId : '';
    final searchController = TextEditingController(text: effectiveImdb);
    final urlController = TextEditingController();

    List<ExternalSubtitleItem>? fetchedSubtitles;
    bool loading = false;
    String? fetchError;

    Future<void> loadOpenSubtitles(String imdbId, StateSetter setModalState) async {
      if (imdbId.trim().isEmpty) return;
      setModalState(() {
        loading = true;
        fetchError = null;
      });
      final results = await _subtitlesService.fetchSubtitles(
        imdbId: imdbId.trim(),
        season: widget.item.season,
        episode: widget.episodeNumber ?? widget.item.episode,
      );
      if (mounted) {
        setModalState(() {
          loading = false;
          fetchedSubtitles = results;
          if (results.isEmpty) {
            fetchError = 'لم يتم العثور على ترجمات لهذا المعرّف في OpenSubtitles v3';
          }
        });
      }
    }

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF151F32),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) {
          if (effectiveImdb.isNotEmpty && fetchedSubtitles == null && !loading && fetchError == null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) loadOpenSubtitles(effectiveImdb, setModalState);
            });
          }
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'ترجمات Stremio OpenSubtitles v3',
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFFDEE9F8)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: searchController,
                          decoration: const InputDecoration(
                            hintText: 'معرف IMDb (مثال: tt0111161)',
                            prefixIcon: Icon(Icons.search),
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: loading
                            ? null
                            : () => loadOpenSubtitles(
                                searchController.text.trim(), setModalState),
                        child: const Text('بحث'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (loading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24.0),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (fetchError != null)
                    Padding(
                      padding: const EdgeInsets.all(12.0),
                      child: Text(
                        fetchError!,
                        style: const TextStyle(color: Colors.orangeAccent),
                        textAlign: TextAlign.center,
                      ),
                    )
                  else if (fetchedSubtitles != null && fetchedSubtitles!.isNotEmpty)
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxHeight: MediaQuery.sizeOf(context).height * 0.4,
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: fetchedSubtitles!.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final sub = fetchedSubtitles![i];
                          final isArabic = sub.lang == 'ara' || sub.lang == 'ar';
                          return ListTile(
                            dense: true,
                            leading: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: isArabic
                                    ? const Color(0xFF708DB8).withAlpha(50)
                                    : Colors.white10,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: isArabic
                                      ? const Color(0xFF708DB8)
                                      : Colors.white24,
                                ),
                              ),
                              child: Text(
                                sub.lang.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: isArabic
                                      ? const Color(0xFFDEE9F8)
                                      : Colors.white70,
                                ),
                              ),
                            ),
                            title: Text(
                              sub.languageLabel,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                            subtitle: Text(
                              sub.fileName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12, color: Colors.white60),
                            ),
                            onTap: () async {
                              Navigator.pop(context);
                              await player.setSubtitleTrack(mk.SubtitleTrack.uri(
                                sub.url,
                                title: '${sub.languageLabel} (${sub.lang})',
                              ));
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                      content: Text(
                                          'تم تفعيل الترجمة: ${sub.languageLabel}')),
                                );
                              }
                            },
                          );
                        },
                      ),
                    ),
                  const Divider(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: urlController,
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(
                            hintText: 'أو أدخل رابط HTTPS لملف SRT/VTT مباشر',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () async {
                          final raw = urlController.text.trim();
                          final uri = Uri.tryParse(raw);
                          if (uri == null ||
                              uri.scheme != 'https' ||
                              uri.host.isEmpty ||
                              uri.userInfo.isNotEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('أدخل رابط HTTPS صالحًا للترجمة')),
                            );
                            return;
                          }
                          Navigator.pop(context);
                          await player.setSubtitleTrack(mk.SubtitleTrack.uri(
                            uri.toString(),
                            title: 'ترجمة خارجية مخصصة',
                          ));
                        },
                        child: const Text('إضافة'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    searchController.dispose();
    urlController.dispose();
    _revealControls();
  }

  Future<void> _downloadCurrent() async {
    if (_downloadToken != null) {
      _downloadToken!.cancel();
      return;
    }
    if (widget.isLive || _currentMediaType != 'mp4') return;
    final token = DownloadCancellationToken();
    _downloadService ??= DownloadService();
    setState(() => _downloadToken = token);
    try {
      final uri = widget.api.mediaUri(_currentMediaPath,
          download: true,
          playbackMode: _resolvedPlaybackMode == 'edge_local_proxy'
              ? 'edge_direct'
              : _resolvedPlaybackMode,
          expiresAt: _expiresAt);
      await _downloadService!.download(uri,
          headers: _currentHeaders,
          fallbackName: '${widget.title}.mp4',
          resumeKey: '${widget.item.ref}:${widget.episodeId}',
          cancellationToken: token, onProgress: (p) {
        if (mounted) setState(() => _downloadProgress = p);
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('اكتمل تنزيل MP4. الملف متاح في مكتبتك.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(token.isCancelled
                ? 'تم إلغاء التنزيل'
                : 'تعذر تنزيل هذا المصدر. أعد استخراج الرابط ثم حاول مجددًا.')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _downloadToken = null;
          _downloadProgress = null;
        });
      }
    }
  }

  Widget _trackControls(UniversalPlayer controller) {
    final player = controller.extendedPlayer;
    return Wrap(alignment: WrapAlignment.center, spacing: 12, children: [
      if (!kIsWeb &&
          !widget.isLive &&
          widget.localFileUri == null &&
          _currentMediaType == 'mp4')
        IconButton(
            tooltip: _downloadToken == null ? 'تنزيل MP4' : 'إلغاء التنزيل',
            onPressed: _downloadCurrent,
            icon: Icon(_downloadToken == null ? Icons.download : Icons.cancel)),
      if (_downloadProgress != null)
        Text('${((_downloadProgress!.fraction ?? 0) * 100).round()}%'),
      if (widget.isLive)
        const Padding(
            padding: EdgeInsets.all(12),
            child: Text('● مباشر', style: TextStyle(color: Colors.redAccent))),
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
      if (_sources.length > 1) _sourceMenu(),
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
            tooltip: 'موازنة تزامن الترجمة',
            icon: const Icon(Icons.av_timer),
            onPressed: () => _showSubtitleDelayDialog(controller)),
      if (player != null)
        IconButton(
            tooltip: 'ترجمات Stremio OpenSubtitles v3',
            icon: const Icon(Icons.subtitles_outlined),
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
    final active = controller?.value.isInitialized == true ? controller : null;
    final insets = MediaQuery.viewPaddingOf(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: _fullscreen ? null : AppBar(title: Text(widget.title)),
      body: Focus(
          autofocus: isTvTarget,
          onKeyEvent: (_, event) {
            if (isTvTarget && event is KeyDownEvent) _revealControls();
            return KeyEventResult.ignored;
          },
          child: SizedBox.expand(
              child: Stack(fit: StackFit.expand, children: [
            if (active != null)
              GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _controlsVisible
                      ? setState(() => _controlsVisible = false)
                      : _revealControls(),
                  onDoubleTapDown: (d) => _gestureRight =
                      d.localPosition.dx > MediaQuery.sizeOf(context).width / 2,
                  onDoubleTap: _doubleTapSeek,
                  onVerticalDragStart: isTvTarget
                      ? null
                      : (d) => _gestureRight = d.localPosition.dx >
                          MediaQuery.sizeOf(context).width / 2,
                  onVerticalDragUpdate: isTvTarget
                      ? null
                      : (d) {
                          final change = -(d.primaryDelta ?? 0) /
                              MediaQuery.sizeOf(context).height;
                          setState(() {
                            if (_gestureRight) {
                              _volume = (_volume + change).clamp(0, 1);
                            } else {
                              _brightness =
                                  (_brightness + change).clamp(.15, 1);
                            }
                          });
                          if (_gestureRight) {
                            unawaited(active.setVolume(_volume));
                          } else {
                            unawaited(_setBrightness());
                          }
                          _revealControls();
                        },
                  child: Stack(fit: StackFit.expand, children: [
                    ValueListenableBuilder<VideoPlayerValue>(
                        valueListenable: active,
                        child: active.video(),
                        builder: (_, value, video) => FullscreenVideoSurface(
                            videoSize: value.size,
                            fit: _videoFit,
                            child: video!)),
                    if (!_nativeBrightness && _brightness < 1)
                      IgnorePointer(
                          child: ColoredBox(
                              color: Colors.black
                                  .withValues(alpha: 1 - _brightness))),
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
                                      borderRadius: BorderRadius.circular(20)),
                                  child: Text(_seekFeedback,
                                      style: const TextStyle(
                                          fontSize: 22,
                                          color: Colors.white))))),
                  ])),
            if (active == null)
              Center(
                  child: SafeArea(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                _failed
                    ? const Icon(Icons.error_outline, size: 64)
                    : const CircularProgressIndicator(),
                const SizedBox(height: 16),
                Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(_status, textAlign: TextAlign.center)),
                if (_failed)
                  FilledButton(
                      onPressed: () {
                        setState(() => _failed = false);
                        _initialize(forceRefresh: true);
                      },
                      child: const Text('إعادة المحاولة')),
                if (_failed && _sources.length > 1) _sourceMenu(),
                TextButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    child: const Text('رجوع')),
              ]))),
            if (active != null && _controlsVisible) ...[
              Positioned(
                  top: insets.top + 4,
                  left: insets.left + 4,
                  child: IconButton(
                      tooltip: 'رجوع',
                      icon: const Icon(Icons.arrow_back),
                      onPressed: () => Navigator.of(context).maybePop())),
              Positioned(
                  top: insets.top + 4,
                  right: insets.right + 4,
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(
                        key: const Key('player-fit-toggle'),
                        tooltip: _videoFit == BoxFit.contain
                            ? 'ملء الأبعاد مع قص الأطراف'
                            : 'عرض الأبعاد الأصلية',
                        icon: Icon(_videoFit == BoxFit.contain
                            ? Icons.crop_free
                            : Icons.fit_screen),
                        onPressed: () {
                          setState(() => _videoFit = _videoFit == BoxFit.contain
                              ? BoxFit.cover
                              : BoxFit.contain);
                          _revealControls();
                        }),
                    IconButton(
                        tooltip: _fullscreen ? 'تصغير' : 'ملء الشاشة',
                        icon: Icon(_fullscreen
                            ? Icons.fullscreen_exit
                            : Icons.fullscreen),
                        onPressed: _toggleFullscreen)
                  ])),
              Positioned(
                  left: insets.left,
                  right: insets.right,
                  bottom: insets.bottom,
                  child: _modernControls(active)),
            ],
          ]))),
    );
  }
}
