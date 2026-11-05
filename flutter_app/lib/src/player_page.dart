import 'cloud_library.dart';
import 'pip_bridge.dart';
import 'playback_resume.dart';
import 'search_work_groups.dart';
import 'app_preferences.dart';
import 'source_selection_memory.dart';
import 'details_page.dart';
import 'source_editions_panel.dart';
import 'playback_policy.dart';
import 'najd_panels.dart';
import 'stitch_design.dart';
import 'najd_theme.dart';
import 'source_picker.dart';
import 'cycle_feature_policy.dart';
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

import 'package:media_kit/media_kit.dart' as mk;
import 'package:file_selector/file_selector.dart' as picker;

import 'subtitle_service.dart';
import 'subtitle_delay.dart';

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
  Duration position,
  PlaybackSource from,
  PlaybackSource to,
) {
  if (!sourcesShareTimeline(from, to)) return Duration.zero;
  final verifiedOffsets =
      from.timelineVerified &&
      to.timelineVerified &&
      from.edition.trim().isNotEmpty &&
      from.edition.trim() == to.edition.trim();
  final milliseconds =
      position.inMilliseconds -
      (verifiedOffsets ? from.timelineOffsetMs ?? 0 : 0) +
      (verifiedOffsets ? to.timelineOffsetMs ?? 0 : 0);
  return Duration(milliseconds: milliseconds < 0 ? 0 : milliseconds);
}

/// A saved clock belongs to its stable source/cut, not every URL of a title.
Duration historyPositionForSource(
  WatchEntry? entry,
  PlaybackSource? current, {
  required String requestedRef,
}) {
  if (entry == null || entry.positionMs <= 0) return Duration.zero;
  final saved = Duration(milliseconds: entry.positionMs);
  if (entry.selectedSourceRef.isEmpty) {
    // Old records lack cut context. Only an unchanged direct title reference
    // can be resumed without inventing an episode/cut mapping.
    return requestedRef == entry.contentRef ? saved : Duration.zero;
  }
  final currentRef = current?.sourceRef.isNotEmpty == true
      ? current!.sourceRef
      : requestedRef;
  if (entry.edition.isNotEmpty &&
      current?.edition.isNotEmpty == true &&
      entry.edition != current!.edition) {
    return Duration.zero;
  }
  if (entry.selectedSourceRef == currentRef &&
      (entry.providerId.isEmpty ||
          current?.providerId.isEmpty != false ||
          entry.providerId == current?.providerId)) {
    return saved;
  }
  if (current == null ||
      !entry.timelineVerified ||
      !current.timelineVerified ||
      entry.edition.isEmpty ||
      entry.edition != current.edition) {
    return Duration.zero;
  }
  final value =
      entry.positionMs -
      (entry.timelineOffsetMs ?? 0) +
      (current.timelineOffsetMs ?? 0);
  return Duration(milliseconds: value < 0 ? 0 : value);
}

EpisodeItem? nextObservedEpisode(
  List<EpisodeItem> episodes, {
  required int? number,
  required int? season,
}) {
  if (number == null || season == null) return null;
  final candidates = episodes
      .where(
        (e) =>
            e.watchAvailable &&
            e.hasEpisodeNumber &&
            e.ref.isNotEmpty &&
            ((e.season ?? season) > season ||
                ((e.season ?? season) == season && e.number > number)),
      )
      .toList();
  candidates.sort((a, b) {
    final s = (a.season ?? season).compareTo(b.season ?? season);
    return s != 0 ? s : a.number.compareTo(b.number);
  });
  return candidates.isEmpty ? null : candidates.first;
}

class PlayerPage extends StatefulWidget {
  const PlayerPage({
    super.key,
    required this.api,
    required this.store,
    required this.item,
    required this.title,
    this.sourceRef = '',
    this.searchMatches = const [],
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
    this.subtitles,
    this.episodeQueue = const [],
    this.initialPosition,
    this.providerCatalogRef = '',
    this.watchEntry,
    this.pipBridge,
  });

  final NajdPipBridge? pipBridge;
  final WatchEntry? watchEntry;
  final Duration? initialPosition;
  final String providerCatalogRef;
  final List<EpisodeItem> episodeQueue;
  final MitvApi api;
  final LocalLibraryStore store;
  final CatalogItem item;
  final String title;
  final String sourceRef;
  final List<CatalogItem> searchMatches;
  final String mediaPath;
  final String mediaType;
  final String playbackMode;
  final Map<String, String> playbackHeaders;
  final String episodeId;
  final int? episodeNumber;
  final bool isLive;
  final Uri? localFileUri;
  final bool persistProgress;
  final SubtitleService? subtitles;
  final UniversalPlayer Function(Uri, String, Map<String, String>, bool)?
  playerFactory;

  final StreamBridge Function()? streamBridgeFactory;

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> with WidgetsBindingObserver {
  static _PlayerPageState? _displayOwner;
  UniversalPlayer? _controller;
  late final SubtitleService _subtitles = widget.subtitles ?? SubtitleService();
  PreparedSubtitle? _externalCaption;
  String _captionEdition = '';
  String _captionProvider = '';
  bool _captionTimelineVerified = false;
  bool _subtitlesOff = false;
  double _subtitleDelay = 0;
  bool _subtitleBusy = false;
  int _subtitleGeneration = 0;

  late final NajdPipBridge _pip = widget.pipBridge ?? NajdPipBridge();
  StreamSubscription<NajdPipEvent>? _pipSubscription;
  bool _pipAvailable = false, _pipActive = false, _pipHandoff = false;
  bool? _lastPipPlaying;
  Size? _lastPipSize;
  Duration? _pipPosition, _pipDuration;
  bool _progressReady = false;
  bool _cloudPrepared = false;
  Duration? _pendingResumeTarget;
  Timer? _resumeSeekTimer;
  bool _resumeSeekInFlight = false;
  int _resumeSeekAttempts = 0;
  Future<ResumeAction?>? _resumePrompt;
  ResumeAction? _resumeAction;
  WatchEntry? get _savedEntry {
    final current = widget.store.resumeEntry(
      widget.item.ref,
      episodeId: widget.episodeId,
      seasonNumber: widget.item.season,
      episodeNumber: widget.episodeNumber,
      playbackRef: widget.sourceRef,
    );
    if (current != null) return current;
    final explicit = widget.watchEntry;
    return explicit != null &&
            explicit.contentRef == widget.item.ref &&
            explicit.matchesEpisode(
              episodeId: widget.episodeId,
              seasonNumber: widget.item.season,
              episodeNumber: widget.episodeNumber,
              playbackRef: widget.sourceRef,
            )
        ? explicit
        : null;
  }

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
  bool _boosting = false;
  int? _holdPointer;
  int _boostSerial = 0;
  Future<void> _rateQueue = Future.value();
  double _videoScale = 1;
  Timer? _controlsTimer;
  DateTime _lastBrightnessUpdate = DateTime.fromMillisecondsSinceEpoch(0);
  bool _gestureRight = false;
  StreamBridge? _streamBridge;
  final _sources = <PlaybackSource>[];
  int _sourceIndex = 0;
  final _generation = RequestGeneration();
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

  @override
  void initState() {
    super.initState();
    _displayOwner = this;
    _pipSubscription = _pip.events.listen(
      (event) => unawaited(_onPipEvent(event)),
    );
    WidgetsBinding.instance.addObserver(this);
    _handoffPosition = widget.initialPosition;
    _initialize();
    unawaited(_loadSourceQueue());
    unawaited(_rememberSelection());
    unawaited(_enterDisplay());
    unawaited(_readBrightness());
    unawaited(_keepScreenOn(true));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      unawaited(_endBoost());
      unawaited(_saveProgress(force: true));
    }
  }

  List<EpisodeItem>? _loadedSourceQueue;
  List<EpisodeItem> get _queue => _loadedSourceQueue ?? widget.episodeQueue;
  Future<void> _loadSourceQueue() async {
    if (widget.episodeQueue.isNotEmpty ||
        !widget.item.ref.startsWith('source:') ||
        widget.episodeNumber == null) {
      return;
    }
    try {
      var page = await widget.api.details(widget.sourceRef);
      final episodes = <String, EpisodeItem>{
        for (final ep in page.episodes) ep.ref: ep,
      };
      final seenOffsets = <int>{};
      if (mounted) {
        setState(() => _loadedSourceQueue = episodes.values.toList());
      }
      while (mounted &&
          page.episodeNextOffset != null &&
          !episodes.values.any((ep) => ep.number > widget.episodeNumber!) &&
          seenOffsets.add(page.episodeNextOffset!)) {
        page = await widget.api.moreSourceEpisodes(
          widget.item.ref,
          season: widget.item.season ?? 1,
          offset: page.episodeNextOffset!,
        );
        for (final ep in page.episodes) {
          episodes[ep.ref] = ep;
        }
        if (mounted) {
          setState(() => _loadedSourceQueue = episodes.values.toList());
        }
      }
    } catch (_) {
      /* The requested episode can play while catalogue retrieval is unavailable. */
    }
  }

  Future<void> _rememberSelection() async {
    if (!SourceSelectionMemory.canonical(widget.providerCatalogRef)) return;
    try {
      await SourceSelectionMemory.remember(
        widget.providerCatalogRef,
        SourceSelection(
          workRef: widget.item.ref,
          episodeRef: widget.sourceRef,
          episodeId: widget.episodeId,
          title: widget.item.title,
          provider: widget.item.source,
          season: widget.item.season,
          number: widget.episodeNumber,
        ),
      );
    } catch (_) {
      /* Playback does not depend on preference storage. */
    }
  }

  Future<void> _enterDisplay() async {
    if (kIsWeb || isDesktopTarget) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (!isTvTarget && !isDesktopTarget) {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
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
      await ScreenBrightness.instance.setApplicationScreenBrightness(
        _brightness,
      );
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
      _fullscreen ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge,
    );
    if (!isTvTarget && !isDesktopTarget) {
      await SystemChrome.setPreferredOrientations(
        _fullscreen
            ? [
                DeviceOrientation.landscapeLeft,
                DeviceOrientation.landscapeRight,
              ]
            : DeviceOrientation.values,
      );
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

  Future<void> _initialize({
    bool forceRefresh = false,
    bool keepSources = false,
    bool software = false,
  }) async {
    final generation = _generation.next();
    if (!_cloudPrepared) {
      _cloudPrepared = true;
      await CloudLibrarySync.refreshForPlayback(
        widget.store,
        contentRef: widget.item.ref,
        episodeId: widget.episodeId,
        seasonNumber: widget.item.season,
        episodeNumber: widget.episodeNumber,
        playbackRef: widget.sourceRef,
      );
      if (!mounted || !_generation.isCurrent(generation)) return;
    }
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
        final TitleDetails resolved = await widget.api.resolvePlayback(
          widget.sourceRef,
          refresh: forceRefresh,
        );
        if (!mounted || !_generation.isCurrent(generation)) return;
        mediaPath = resolved.mediaPath;
        mediaType = resolved.mediaType;
        playbackMode = resolved.playbackMode;
        playbackHeaders = resolved.playbackHeaders;
        expiresAt = resolved.expiresAt;
        _expiresAt = expiresAt;
        _sources.clear();
        _sourceIndex = 0;
        _decoderRetries.clear();
        _sources.addAll(
          widget.api.sourceRouter.rank(
            resolved.mediaSources.isEmpty
                ? [PlaybackSource(mediaPath: mediaPath, mediaType: mediaType)]
                : resolved.mediaSources,
          ),
        );
        if (previousSource == null) {
          final saved = _savedEntry;
          if (saved != null && saved.providerId.isNotEmpty) {
            final preferred = _sources.indexWhere(
              (source) =>
                  source.providerId == saved.providerId &&
                  (source.sourceRef.isEmpty
                          ? widget.sourceRef
                          : source.sourceRef) ==
                      saved.selectedSourceRef &&
                  (saved.edition.isEmpty || source.edition == saved.edition),
            );
            if (preferred >= 0) _sourceIndex = preferred;
          }
        }
        if (previousSource != null) {
          final compatible = _sources.indexWhere(
            (source) => sourcesShareTimeline(previousSource, source),
          );
          // Renewed URLs can represent another cut. Retry playback from zero
          // when no timeline is proven, preserving the same player and controls.
          final savedClock =
              previousPosition ??
              historyPositionForSource(
                _savedEntry,
                previousSource,
                requestedRef: widget.sourceRef,
              );
          if (compatible < 0 &&
              savedClock >= const Duration(milliseconds: 500)) {
            throw StateError('NO_COMPATIBLE_SOURCE_TIMELINE');
          }
          _sourceIndex = compatible < 0 ? 0 : compatible;
          if (previousPosition != null) {
            _handoffPosition = compatible < 0
                ? Duration.zero
                : sourceHandoffPosition(
                    previousPosition,
                    previousSource,
                    _sources[compatible],
                  );
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
      if (!mounted || !_generation.isCurrent(generation)) return;
      Uri uri;
      if (widget.localFileUri != null) {
        uri = widget.localFileUri!;
        if (uri.scheme != 'file' || uri.host.isNotEmpty) {
          throw StateError('INVALID_LOCAL_FILE');
        }
      } else if (playbackMode == 'local_proxy' ||
          playbackMode == 'edge_local_proxy') {
        final bridge =
            widget.streamBridgeFactory?.call() ??
            LocalStreamBridge(trustedEdge: playbackMode == 'edge_local_proxy');
        _streamBridge = bridge;
        uri = await bridge.open(Uri.parse(mediaPath), playbackHeaders);
        if (!mounted || !_generation.isCurrent(generation)) {
          await bridge.close();
          return;
        }
        // Upstream headers belong to the bridge, never to its loopback request.
        playbackHeaders = const {};
      } else {
        uri = widget.api.mediaUri(
          mediaPath,
          playbackMode: playbackMode,
          expiresAt: expiresAt,
        );
      }
      final controller =
          widget.playerFactory?.call(
            uri,
            mediaType,
            playbackHeaders,
            software,
          ) ??
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
      final saved = _savedEntry;
      var resume =
          _handoffPosition ??
          historyPositionForSource(
            saved,
            _activeSource,
            requestedRef: widget.sourceRef.isNotEmpty
                ? widget.sourceRef
                : widget.item.ref,
          );
      if (!widget.isLive &&
          widget.initialPosition == null &&
          _handoffPosition == null &&
          saved != null &&
          saved.positionMs >= 5000 &&
          saved.progress < .95 &&
          _resumeAction == null) {
        _resumePrompt ??= showResumeChoice(
          context,
          saved,
          differentSource: resume == Duration.zero,
        );
        final action = await _resumePrompt;
        if (!mounted || controller != _controller) return;
        if (action == null) {
          if (Navigator.of(context).canPop()) Navigator.of(context).pop();
          return;
        }
        _resumeAction = action;
      }
      if ((_handoffPosition == null && _resumeAction == ResumeAction.restart) ||
          (_handoffPosition == null &&
              saved != null &&
              saved.progress >= .95 &&
              widget.initialPosition == null)) {
        resume = Duration.zero;
      } else if (_handoffPosition == null &&
          _resumeAction == ResumeAction.resume &&
          resume == Duration.zero &&
          saved != null) {
        // Explicit user choice permits a clock handoff; it is not a verified cut mapping.
        resume = Duration(milliseconds: saved.positionMs);
      }
      if (!widget.isLive && resume > Duration.zero) {
        if (controller.value.duration > Duration.zero &&
            resume >= controller.value.duration) {
          throw StateError('SAVED_POSITION_OUTSIDE_SOURCE');
        }
        _pendingResumeTarget = resume;
        _progressReady = false;
        _resumeSeekAttempts = 0;
        await controller.seekTo(resume);
        _confirmResumePosition();
      } else {
        _pendingResumeTarget = null;
        _progressReady = true;
        if (!widget.isLive &&
            (_resumeAction == ResumeAction.restart ||
                _handoffPosition != null)) {
          await controller.seekTo(Duration.zero);
        }
      }
      _startResumeRetry(controller);
      unawaited(_configurePip(controller));
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
      widget.api.sourceRouter.record(
        mediaPath,
        success: true,
        latencyMs: startup.elapsedMilliseconds,
      );
      await controller.play();
      unawaited(_restoreCaption(controller));
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
      if (!mounted || !_generation.isCurrent(generation)) return;
      await _fallbackFromNative('تعذر تشغيل هذا المصدر داخل المشغل الأصلي');
    }
  }

  void _confirmResumePosition() {
    final target = _pendingResumeTarget, player = _controller;
    if (target == null || player == null) return;
    if ((player.value.position - target).inMilliseconds.abs() <= 2000) {
      _pendingResumeTarget = null;
      _progressReady = true;
      _resumeSeekTimer?.cancel();
    }
  }

  void _startResumeRetry(UniversalPlayer player) {
    _resumeSeekTimer?.cancel();
    if (_pendingResumeTarget == null) return;
    final deadline = DateTime.now().add(const Duration(seconds: 25));
    _resumeSeekTimer = Timer.periodic(const Duration(milliseconds: 500), (
      timer,
    ) async {
      if (!mounted || player != _controller || _pendingResumeTarget == null) {
        timer.cancel();
        return;
      }
      _confirmResumePosition();
      final target = _pendingResumeTarget;
      if (target == null) return;
      if (DateTime.now().isAfter(deadline)) {
        timer.cancel();
        await player.pause();
        if (mounted) {
          setState(() {
            _failed = true;
            _status = 'تعذر استئناف الدقيقة المحفوظة. أعد المحاولة أو اختر مصدرًا آخر.';
          });
        }
        return;
      }
      if (_resumeSeekInFlight ||
          _resumeSeekAttempts >= 3 ||
          player.value.isBuffering ||
          player.value.duration <= target) {
        return;
      }
      _resumeSeekInFlight = true;
      _resumeSeekAttempts++;
      try {
        await player.seekTo(target);
        _confirmResumePosition();
      } catch (_) {
      } finally {
        _resumeSeekInFlight = false;
      }
    });
  }

  void _nativeValueChanged() {
    _confirmResumePosition();
    _updatePipPlayback();
    final controller = _controller;
    if (controller == null || _nativeFailureInFlight) {
      return;
    }
    if (_progressReady &&
        !controller.value.hasError &&
        controller.value.isInitialized) {
      _lastObservedPosition = controller.value.position;
    }
    final next = _nextEpisode;
    if (next != null && !widget.isLive && !controller.value.hasError) {
      final value = controller.value;
      if (value.isPlaying && !_nextPrepared) {
        _nextPrepared = true;
        unawaited(_prepareNext(next));
      }
      if (value.duration > Duration.zero &&
          value.duration - value.position < const Duration(seconds: 60) &&
          !_nextRenewed) {
        _nextRenewed = true;
        if (widget.api
                .cachedPlayback(next.ref)
                ?.expiresAt
                ?.isAfter(DateTime.now().add(const Duration(minutes: 2))) !=
            true) {
          unawaited(_prepareNext(next, refresh: true));
        }
      }
      if (value.isCompleted) unawaited(_advanceEpisode(next));
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
    final failureCode = controller?.value.hasError == true
        ? 'NATIVE_DECODER_ERROR'
        : failureMessage.contains('استمرار')
        ? 'BUFFER_STALLED'
        : 'PLAYER_START_FAILED';
    unawaited(
      widget.api.reportPlaybackFailure(
        ref: widget.sourceRef,
        provider: _activeSource?.providerId.isNotEmpty == true
            ? _activeSource!.providerId
            : _activeSource?.provider ?? '',
        code: failureCode,
      ),
    );
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
      widget.api.sourceRouter.record(
        _sources[_sourceIndex].mediaPath,
        success: false,
      );
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
      widget.api.sourceRouter.record(
        _sources[_sourceIndex].mediaPath,
        success: false,
      );
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
      if (sourcesShareTimeline(origin, _sources[index]) ||
          (_handoffPosition ??
                  historyPositionForSource(
                    _savedEntry,
                    origin,
                    requestedRef: widget.sourceRef,
                  )) <
              const Duration(milliseconds: 500)) {
        return index;
      }
    }
    return null;
  }

  void _prepareHandoff(int index) {
    final origin = _activeSource;
    if (origin != null && _handoffPosition != null) {
      _handoffPosition = sourceHandoffPosition(
        _handoffPosition!,
        origin,
        _sources[index],
      );
    }
    _sourceIndex = index;
  }

  Future<void> _selectSource(int index) async {
    if (index < 0 || index >= _sources.length || _nativeFailureInFlight) return;
    final controller = _controller;
    if (index == _sourceIndex && controller != null) return;
    final origin = _activeSource;
    final position =
        controller?.value.isInitialized == true &&
            controller?.value.hasError == false
        ? controller!.value.position
        : _lastObservedPosition ?? _handoffPosition ?? Duration.zero;
    final compatible =
        origin != null && sourcesShareTimeline(origin, _sources[index]);
    _handoffPosition = compatible
        ? sourceHandoffPosition(position, origin, _sources[index])
        : position;
    // An explicit source selection keeps the user's current clock. Automatic
    // fallback still requires a verified timeline and never invents numbering.
    _nativeFailureInFlight = true;
    _nativeStartupTimer?.cancel();
    _progressTimer?.cancel();
    await _saveProgress(force: true);
    if (!mounted) return;
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

  Widget _sourceMenu() => SourcePickerButton(
    sources: _sources,
    selected: _sourceIndex,
    onOpened: () => _controlsTimer?.cancel(),
    onClosed: _revealControls,
    onSelected: _selectSource,
  );

  Future<void> _episodeMenu() async {
    _controlsTimer?.cancel();
    final selected = await showNajdOptions<EpisodeItem>(
      context,
      title: 'الحلقات',
      description: widget.item.ref.startsWith('source:')
          ? 'الحلقات حسب ترقيم هذا المزود'
          : null,
      icon: Icons.video_library_outlined,
      options: [
        for (final ep in _queue)
          NajdOption(
            ep,
            ep.title.isEmpty ? 'الحلقة ${ep.number}' : ep.title,
            subtitle:
                'الموسم ${ep.season ?? widget.item.season ?? 1} • الحلقة ${ep.number}',
            selected: ep.ref == widget.sourceRef,
            enabled: ep.watchAvailable && ep.ref.isNotEmpty,
            icon: Icons.play_circle_outline,
          ),
      ],
    );
    if (!mounted) return;
    if (selected != null && selected.ref != widget.sourceRef) {
      await _advanceEpisode(selected);
    }
    _revealControls();
  }

  Future<void> _providerCatalogue() async {
    if (widget.api.providerBrowser) {
      await _episodeMenu();
      return;
    }
    await _endBoost();
    if (!mounted) return;
    final returnRoute = ModalRoute.of(context);
    final controller = _controller;
    final wasPlaying = controller?.value.isPlaying == true;
    _controlsTimer?.cancel();
    await _saveProgress(force: true);
    final position =
        controller?.value.position ??
        _lastObservedPosition ??
        _handoffPosition ??
        Duration.zero;
    await controller?.pause();
    if (!mounted) return;
    final base = widget.providerCatalogRef.isNotEmpty
        ? widget.providerCatalogRef
        : widget.item.ref.replaceFirst(RegExp(r':s\d+:e\d+$'), '');
    ({CatalogItem item, TitleDetails details, EpisodeItem? episode})? chosen;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (browserContext) => Scaffold(
          appBar: AppBar(title: const Text('المصادر والمزودون')),
          body: ListView(
            padding: const EdgeInsets.all(18),
            children: [
              if (widget.searchMatches.isNotEmpty)
                for (final candidate in SearchWorkGroup(
                  '',
                  widget.searchMatches,
                ).providerChoices)
                  ListTile(
                    key: ValueKey('player-search-provider-${candidate.source}'),
                    leading: const Icon(Icons.video_library_outlined),
                    title: Text(
                      widget.api.explorationSourceLabel(candidate.source),
                    ),
                    subtitle: Text(candidate.title),
                    onTap: () => Navigator.of(browserContext).push(
                      MaterialPageRoute(
                        builder: (_) => DetailsPage(
                          api: widget.api,
                          store: widget.store,
                          item: candidate,
                          providerCatalogRef: base,
                          searchMatches: widget.searchMatches,
                          onPlaySelection: (item, details, episode) async {
                            chosen = (
                              item: item,
                              details: details,
                              episode: episode,
                            );
                            Navigator.of(context)
                                .popUntil((route) => route == returnRoute);
                          },
                        ),
                      ),
                    ),
                  ),
              SourceEditionsPanel(
                api: widget.api,
                workRef: base,
                onOpen: (edition) {
                  final ref = '${edition['ref'] ?? ''}';
                  if (!RegExp(r'^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$')
                      .hasMatch(ref)) {
                    return;
                  }
                  final item = CatalogItem(
                    id: ref,
                    ref: ref,
                    title: '${edition['title'] ?? widget.item.title}',
                    poster: widget.item.poster,
                    type: widget.item.type,
                    source: '${edition['provider'] ?? ''}',
                  );
                  Navigator.of(browserContext).push(
                    MaterialPageRoute(
                      builder: (_) => DetailsPage(
                        api: widget.api,
                        store: widget.store,
                        item: item,
                        providerCatalogRef: base,
                        searchMatches: widget.searchMatches,
                        onPlaySelection: (item, details, episode) async {
                          chosen = (
                            item: item,
                            details: details,
                            episode: episode,
                          );
                          Navigator.of(context)
                              .popUntil((route) => route == returnRoute);
                        },
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    final selection = chosen;
    if (selection == null) {
      if (wasPlaying) await controller?.play();
      _revealControls();
      return;
    }
    final episode = selection.episode;
    unawaited(
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => PlayerPage(
            api: widget.api,
            store: widget.store,
            item: selection.item.copyWith(
              season: episode?.season ?? selection.details.season,
              episode: episode?.number,
            ),
            title: episode?.title.isNotEmpty == true
                ? episode!.title
                : selection.details.title,
            sourceRef: episode?.ref ?? selection.item.ref,
            episodeId: episode?.id ?? '',
            episodeNumber: episode?.number,
            episodeQueue: selection.details.episodes,
            initialPosition: position,
            providerCatalogRef: base,
            searchMatches: widget.searchMatches,
            playerFactory: widget.playerFactory,
            streamBridgeFactory: widget.streamBridgeFactory,
          ),
        ),
      ),
    );
  }

  bool _nextPrepared = false, _nextRenewed = false, _advancing = false;
  EpisodeItem? get _nextEpisode => nextObservedEpisode(
    _queue,
    number: widget.episodeNumber,
    season: widget.item.season,
  );
  Future<void> _prepareNext(EpisodeItem episode, {bool refresh = false}) async {
    try {
      await widget.api.resolvePlayback(episode.ref, refresh: refresh);
    } catch (_) {
      /* Next availability does not interrupt current playback. */
    }
  }

  Future<void> _advanceEpisode(EpisodeItem episode) async {
    if (_advancing || !mounted) return;
    _advancing = true;
    await _saveProgress(force: true);
    if (!mounted) return;
    unawaited(
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => PlayerPage(
            api: widget.api,
            store: widget.store,
            item: widget.item.copyWith(
              season: episode.season,
              episode: episode.number,
            ),
            title: episode.title.isEmpty
                ? 'الحلقة ${episode.number}'
                : episode.title,
            sourceRef: episode.ref,
            episodeId: episode.id,
            episodeNumber: episode.number,
            episodeQueue: _queue,
            providerCatalogRef: widget.providerCatalogRef,
            searchMatches: widget.searchMatches,
          ),
        ),
      ),
    );
  }

  Future<void> _configurePip(UniversalPlayer player) async {
    var supported = await _pip.supported(_currentMediaType);
    // HTML platform views can attach after the media controller is initialized.
    for (
      var attempt = 0;
      kIsWeb && !supported && attempt < 4 && mounted && player == _controller;
      attempt++
    ) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (!mounted || player != _controller) return;
      supported = await _pip.supported(_currentMediaType);
    }
    if (!mounted || player != _controller) return;
    setState(() => _pipAvailable = supported);
    _lastPipPlaying = null;
    _updatePipPlayback();
  }

  void _updatePipPlayback() {
    final player = _controller;
    if (!_pipAvailable || player == null || !player.value.isInitialized) return;
    final playing = player.value.isPlaying && !player.value.hasError;
    final size = player.value.size;
    if (_lastPipPlaying == playing && _lastPipSize == size) return;
    _lastPipPlaying = playing;
    _lastPipSize = size;
    unawaited(
      _pip.update(playing: playing, width: size.width, height: size.height),
    );
  }

  Future<void> _enterPip() async {
    final player = _controller;
    if (!_pipAvailable ||
        player == null ||
        !player.value.isInitialized ||
        _pipActive) {
      return;
    }
    if (!_progressReady || _pendingResumeTarget != null) {
      _subtitleNotice('انتظر اكتمال استئناف التشغيل أولًا.');
      return;
    }
    await _endBoost();
    await _saveProgress(force: true);
    final wasPlaying = player.value.isPlaying;
    _pipPosition = player.value.position;
    _pipDuration = player.value.duration;
    if (_pip.needsNativeHandoff) {
      _pipHandoff = true;
      _requestedPlaying = false;
      await player.pause();
    }
    final entered = await _pip.enter(
      url: player.uri.toString(),
      headers: player.headers,
      position: _pipPosition!,
      playing: wasPlaying,
      rate: _playbackSpeed,
      width: player.value.size.width,
      height: player.value.size.height,
    );
    if (!mounted || player != _controller) return;
    if (!entered) {
      _pipHandoff = false;
      _requestedPlaying = wasPlaying;
      if (wasPlaying) await player.play();
      _subtitleNotice('تعذر فتح صورة داخل صورة لهذا الفيديو على جهازك.');
    } else {
      setState(() {
        _pipActive = true;
        _controlsVisible = false;
      });
      unawaited(_keepScreenOn(false));
    }
  }

  Future<void> _onPipEvent(NajdPipEvent event) async {
    final player = _controller;
    if (!mounted || player == null) return;
    if (event.command == 'play' || event.command == 'pause') {
      if (player.value.isPlaying != (event.command == 'play')) {
        await _togglePlay(player);
      }
      return;
    }
    if (event.position != null) _pipPosition = event.position;
    if (event.duration != null && event.duration! > Duration.zero) {
      _pipDuration = event.duration;
    }
    setState(() => _pipActive = event.active);
    if (_pipHandoff) {
      await _saveProgress(
        force: true,
        positionOverride: _pipPosition,
        durationOverride: _pipDuration,
      );
      if (!mounted || player != _controller) return;
      if (!event.active) {
        _pipHandoff = false;
        final target = _pipPosition ?? player.value.position;
        _pendingResumeTarget = target > Duration.zero ? target : null;
        _progressReady = _pendingResumeTarget == null;
        _resumeSeekAttempts = 0;
        await player.seekTo(target);
        _confirmResumePosition();
        _startResumeRetry(player);
        _requestedPlaying = event.playing == true;
        if (_requestedPlaying) {
          await player.play();
        } else {
          await player.pause();
        }
      }
    }
    if (!event.active && mounted) {
      _revealControls();
      unawaited(_keepScreenOn(true));
    }
  }

  Future<void> _saveProgress({
    bool force = false,
    Duration? positionOverride,
    Duration? durationOverride,
  }) async {
    if (widget.isLive ||
        !widget.persistProgress ||
        !_progressReady ||
        _pendingResumeTarget != null) {
      return;
    }
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        controller.value.hasError ||
        (!force && !controller.value.isPlaying)) {
      return;
    }
    await widget.store.recordProgress(
      item: widget.item,
      position:
          positionOverride ??
          (_pipHandoff && _pipPosition != null
              ? _pipPosition!
              : controller.value.isCompleted
              ? controller.value.duration
              : controller.value.position),
      playbackRef: widget.sourceRef.isNotEmpty
          ? widget.sourceRef
          : widget.item.ref,
      duration:
          durationOverride ??
          (_pipHandoff && _pipDuration != null
              ? _pipDuration!
              : controller.value.duration),
      episodeId: widget.episodeId,
      episodeNumber: widget.episodeNumber,
      selectedSourceRef: _activeSource?.sourceRef.isNotEmpty == true
          ? _activeSource!.sourceRef
          : widget.sourceRef.isNotEmpty
          ? widget.sourceRef
          : widget.item.ref,
      providerId: _activeSource?.providerId ?? '',
      edition: _activeSource?.edition ?? '',
      timelineVerified: _activeSource?.timelineVerified == true,
      timelineOffsetMs: _activeSource?.timelineOffsetMs,
    );
    if (force) unawaited(CloudLibrarySync.flushCheckpoint(widget.store));
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
    if (!controller.value.isPlaying) await _saveProgress(force: true);
  }

  Future<void> _togglePlay(UniversalPlayer controller) async {
    _revealControls();
    _requestedPlaying = !controller.value.isPlaying;
    if (controller.value.isPlaying) {
      await controller.pause();
      await _saveProgress(force: true);
    } else {
      await controller.play();
    }
  }

  Future<bool> _applyRate(double rate) {
    final player = _controller;
    final result = Completer<bool>();
    _rateQueue = _rateQueue.then((_) async {
      if (!mounted ||
          player == null ||
          player != _controller ||
          !player.value.isInitialized) {
        result.complete(false);
        return;
      }
      try {
        await player.setPlaybackSpeed(rate);
        result.complete(true);
      } catch (_) {
        result.complete(false);
      }
    });
    return result.future;
  }

  Future<void> _startBoost() async {
    final prefs = NajdPreferences.instance;
    final player = _controller;
    if (_boosting ||
        !prefs.holdToBoost ||
        widget.isLive ||
        player?.value.isPlaying != true) {
      return;
    }
    final serial = ++_boostSerial;
    _controlsTimer?.cancel();
    setState(() {
      _boosting = true;
      _controlsVisible = false;
    });
    final applied = await _applyRate(prefs.holdSpeed);
    if (mounted && serial == _boostSerial && !applied) {
      setState(() => _boosting = false);
      _subtitleNotice('هذا المصدر لا يدعم سرعة الضغط المختارة');
      _revealControls();
    }
  }

  Future<void> _endBoost() async {
    if (!_boosting) return;
    ++_boostSerial;
    if (mounted) setState(() => _boosting = false);
    await _applyRate(_playbackSpeed);
    if (mounted) _revealControls();
  }

  Future<void> _setPlaybackSpeed(double speed) async {
    if (!isSupportedPlaybackSpeed(speed)) return;
    final previous = _playbackSpeed;
    setState(() => _playbackSpeed = speed);
    _revealControls();
    if (_boosting) return;
    if (!await _applyRate(speed) && mounted) {
      setState(() => _playbackSpeed = previous);
      _subtitleNotice('تعذر تغيير السرعة لهذا المصدر');
    }
  }

  Future<void> _chooseFit() async {
    final fit = await showNajdOptions<BoxFit>(
      context,
      title: 'أبعاد الفيديو',
      icon: Icons.aspect_ratio,
      options: [
        NajdOption(
          BoxFit.contain,
          'احتواء — إظهار الإطار كاملاً',
          selected: _videoFit == BoxFit.contain,
          icon: Icons.fit_screen,
        ),
        NajdOption(
          BoxFit.cover,
          'ملء الشاشة — قص الأطراف',
          selected: _videoFit == BoxFit.cover,
          icon: Icons.crop_free,
        ),
        NajdOption(
          BoxFit.fill,
          'تمديد إلى أبعاد الشاشة',
          selected: _videoFit == BoxFit.fill,
          icon: Icons.aspect_ratio,
        ),
        NajdOption(
          BoxFit.none,
          'الحجم الأصلي',
          selected: _videoFit == BoxFit.none,
          icon: Icons.photo_size_select_actual_outlined,
        ),
      ],
    );
    if (mounted && fit != null) {
      setState(() {
        _videoFit = fit;
        _videoScale = 1;
      });
    }
  }

  Future<mk.Player?> _trackPlayer(UniversalPlayer controller) async {
    if (controller.extendedPlayer != null) return controller.extendedPlayer;
    _handoffPosition = controller.value.position;
    controller.removeListener(_nativeValueChanged);
    await controller.dispose();
    if (!mounted) return null;
    _controller = null;
    _decoderRetries.add(_sourceIndex);
    await _initialize(keepSources: true, software: true);
    return _controller?.extendedPlayer;
  }

  Future<void> _audioMenu(UniversalPlayer controller) async {
    await _endBoost();
    _controlsTimer?.cancel();
    final player = await _trackPlayer(controller);
    if (!mounted) return;
    if (player == null) {
      _subtitleNotice('لا تتوفر مسارات صوت وترجمة إضافية لهذا المصدر');
      _revealControls();
      return;
    }
    await showNajdPanel<void>(
      context,
      title: 'الصوت والترجمة',
      icon: Icons.subtitles_outlined,
      body: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NajdChoiceButton<mk.AudioTrack>(
            label: 'لغة الصوت',
            icon: Icons.audiotrack_outlined,
            options: [
              for (final track in player.state.tracks.audio)
                NajdOption(
                  track,
                  track.id == 'auto'
                      ? 'تلقائي'
                      : track.id == 'no'
                      ? 'إيقاف الصوت'
                      : track.title ?? track.language ?? track.id,
                  selected: track.id == player.state.track.audio.id,
                  icon: Icons.audiotrack_outlined,
                ),
            ],
            onSelected: player.setAudioTrack,
          ),
          const SizedBox(height: 12),
          _captionControls(player, overlay: false),
        ],
      ),
    );
    if (mounted) _revealControls();
  }

  Future<void> _moreMenu(UniversalPlayer controller) async {
    await _endBoost();
    if (kIsWeb && !_pipAvailable) await _configurePip(controller);
    if (!mounted || controller != _controller) return;
    _controlsTimer?.cancel();
    final action = await showNajdPanel<String>(
      context,
      title: 'المزيد',
      icon: Icons.more_horiz,
      body: (panelContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_sources.isNotEmpty)
            SourcePickerButton(
              sources: _sources,
              selected: _sourceIndex,
              onSelected: (index) async {
                Navigator.pop(panelContext);
                await _selectSource(index);
              },
            ),
          if (_downloadProgress case final progress?)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: LinearProgressIndicator(value: progress.fraction),
              ),
            ),
          const SizedBox(height: 8),
          NajdChoiceButton<double>(
            key: const Key('player-speed'),
            label: 'سرعة التشغيل: ${playbackSpeedLabel(_playbackSpeed)}',
            icon: Icons.speed,
            options: [
              for (final speed in supportedPlaybackSpeeds)
                NajdOption(
                  speed,
                  playbackSpeedLabel(speed),
                  selected: speed == _playbackSpeed,
                  icon: Icons.speed,
                ),
            ],
            onSelected: _setPlaybackSpeed,
          ),
          for (final option in [
            if (_pipAvailable)
              ('pip', 'صورة داخل صورة', Icons.picture_in_picture_alt),
            if (!widget.isLive && widget.localFileUri == null)
              (
                'providers',
                widget.api.providerBrowser
                    ? 'حلقات هذا الموقع'
                    : 'المزودون والحلقات',
                Icons.travel_explore,
              ),
            if (controller.extendedPlayer?.state.tracks.video
                    .where((t) => t.id != 'no')
                    .length
                case final int count when count > 1)
              ('quality', 'جودة الفيديو', Icons.high_quality_outlined),
            ('fit', 'أبعاد الفيديو', Icons.aspect_ratio),
            ('zoom-in', 'تكبير 25%', Icons.zoom_in),
            ('zoom-out', 'تصغير 25%', Icons.zoom_out),
            ('zoom-reset', 'استعادة الحجم', Icons.center_focus_strong),
            if (_nextEpisode != null)
              ('next', 'الحلقة التالية', Icons.skip_next),
            if (!kIsWeb &&
                !widget.isLive &&
                widget.localFileUri == null &&
                _currentMediaType == 'mp4')
              (
                'download',
                _downloadToken == null ? 'تحميل الفيديو' : 'إلغاء التحميل',
                Icons.download_outlined,
              ),
            if (!kIsWeb && !isDesktopTarget)
              (
                'immersive',
                _fullscreen ? 'إظهار أشرطة الجهاز' : 'ملء الشاشة',
                Icons.fullscreen,
              ),
          ])
            ListTile(
              key: ValueKey(
                option.$1 == 'providers'
                    ? 'player-providers'
                    : 'player-more-${option.$1}',
              ),
              leading: Icon(
                option.$3,
                color: Theme.of(panelContext).colorScheme.primary,
              ),
              title: Text(option.$2),
              trailing: const Icon(Icons.chevron_left),
              onTap: () => Navigator.pop(panelContext, option.$1),
            ),
        ],
      ),
    );
    if (!mounted) return;
    switch (action) {
      case 'pip':
        await _enterPip();
      case 'providers':
        await _providerCatalogue();
      case 'quality':
        final player = _controller?.extendedPlayer;
        if (player != null) {
          final track = await showNajdOptions<mk.VideoTrack>(
            context,
            title: 'جودة الفيديو',
            options: [
              for (final t in player.state.tracks.video.where(
                (t) => t.id != 'no',
              ))
                NajdOption(
                  t,
                  t.id == 'auto' ? 'تلقائي' : t.title ?? t.id,
                  selected: t.id == player.state.track.video.id,
                  icon: Icons.high_quality_outlined,
                ),
            ],
          );
          if (track != null) await player.setVideoTrack(track);
        }
      case 'fit':
        await _chooseFit();
      case 'zoom-in':
        setState(() => _videoScale = (_videoScale + .25).clamp(.5, 3));
      case 'zoom-out':
        setState(() => _videoScale = (_videoScale - .25).clamp(.5, 3));
      case 'zoom-reset':
        setState(() => _videoScale = 1);
      case 'next':
        if (_nextEpisode != null) await _advanceEpisode(_nextEpisode!);
      case 'download':
        await _downloadCurrent();
      case 'immersive':
        await _toggleFullscreen();
    }
    if (mounted) _revealControls();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_pipSubscription?.cancel() ?? Future<void>.value());
    unawaited(_pip.close());
    _boostSerial++;
    _boosting = false;
    _generation.cancelOutstanding();
    _controlsTimer?.cancel();
    _seekFeedbackTimer?.cancel();
    if (identical(_displayOwner, this)) {
      _displayOwner = null;
      unawaited(_restoreDisplay());
      unawaited(_keepScreenOn(false));
    }
    _nativeStartupTimer?.cancel();
    _progressTimer?.cancel();
    _resumeSeekTimer?.cancel();
    ++_subtitleGeneration;
    unawaited(_saveProgress(force: true));
    _controller?.removeListener(_nativeValueChanged);
    final closingPlayer = _controller;
    unawaited(() async {
      await closingPlayer?.dispose();
      if (widget.subtitles == null) await _subtitles.dispose();
    }());
    _downloadToken?.cancel();
    _downloadService?.close();
    unawaited(_streamBridge?.close() ?? Future.value());
    super.dispose();
  }

  Widget _modernControls(UniversalPlayer activeController) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ValueListenableBuilder<VideoPlayerValue>(
          valueListenable: activeController,
          builder: (context, value, _) {
            final maximum = value.duration.inMilliseconds.toDouble();
            return Column(
              children: [
                if (!widget.isLive || maximum > 0)
                  Directionality(
                    textDirection: TextDirection.ltr,
                    child: Slider(
                      value: value.position.inMilliseconds.toDouble().clamp(
                        0,
                        maximum > 0 ? maximum : 1,
                      ),
                      max: maximum > 0 ? maximum : 1,
                      onChanged: maximum > 0
                          ? (v) => activeController.seekTo(
                              Duration(milliseconds: v.round()),
                            )
                          : null,
                    ),
                  ),
                Text(
                  widget.isLive
                      ? 'بث مباشر • ${_time(value.position)}'
                      : '${_time(value.position)} • المتبقي ${_time(value.duration - value.position)}',
                  style: const TextStyle(fontSize: 12, color: Colors.white70),
                ),
                _trackControls(activeController),
              ],
            );
          },
        ),
      ],
    ),
  );

  String _time(Duration v) =>
      '${v.inMinutes}:${(v.inSeconds % 60).toString().padLeft(2, '0')}';
  void _subtitleNotice(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _applyCaption(mk.Player player, PreparedSubtitle caption) async {
    await player.setSubtitleTrack(
      kIsWeb
          ? mk.SubtitleTrack.data(
              shiftVtt(caption.text, _subtitleDelay),
              title: caption.label,
              language: caption.language,
            )
          : mk.SubtitleTrack.uri(
              caption.uri,
              title: caption.label,
              language: caption.language,
            ),
    );
    if (!kIsWeb) await applyNativeSubtitleDelay(player, _subtitleDelay);
  }

  Future<void> _restoreCaption(UniversalPlayer controller) async {
    final player = controller.extendedPlayer;
    if (player == null) return;
    if (_subtitlesOff) {
      await player.setSubtitleTrack(mk.SubtitleTrack.no());
      return;
    }
    final generation = ++_subtitleGeneration;
    try {
      final source = _activeSource;
      final sameEdition =
          _captionEdition.isNotEmpty &&
          source?.edition == _captionEdition &&
          (source?.providerId == _captionProvider ||
              (_captionTimelineVerified && source?.timelineVerified == true));
      if (_externalCaption != null && sameEdition) {
        await _applyCaption(player, _externalCaption!);
        return;
      }
      _externalCaption = null;
      _subtitleDelay = 0;
      final attached =
          source?.attachedSubtitles ?? const <SubtitleDescriptor>[];
      final arabic = attached
          .where((track) => ['ar', 'ara'].contains(track.language))
          .toList();
      if (arabic.isEmpty) return;
      final caption = await _subtitles.loadDescriptor(arabic.first);
      if (!mounted ||
          generation != _subtitleGeneration ||
          controller != _controller) {
        return;
      }
      _externalCaption = caption;
      _captionEdition = source?.edition ?? '';
      _captionProvider = source?.providerId ?? '';
      _captionTimelineVerified = source?.timelineVerified == true;
      await _applyCaption(player, caption);
    } catch (_) {
      // Captions are optional; an unavailable sidecar must not stop playback.
    }
  }

  Future<void> _chooseCaption(
    mk.Player player,
    SubtitleDescriptor? descriptor,
  ) async {
    if (_subtitleBusy) return;
    final generation = ++_subtitleGeneration;
    setState(() => _subtitleBusy = true);
    try {
      PreparedSubtitle? caption;
      if (descriptor != null) {
        caption = await _subtitles.loadDescriptor(descriptor);
      } else {
        final file = await picker.openFile(
          acceptedTypeGroups: const [
            picker.XTypeGroup(
              label: 'ترجمة',
              extensions: ['srt', 'vtt', 'ass'],
            ),
          ],
        );
        if (file == null) return;
        if (await file.length() > SubtitleService.maximumBytes) {
          throw const FormatException('SUBTITLE_SIZE_LIMIT');
        }
        caption = await _subtitles.loadLocalBytes(
          await file.readAsBytes(),
          file.name,
        );
      }
      if (!mounted ||
          generation != _subtitleGeneration ||
          player != _controller?.extendedPlayer) {
        return;
      }
      _externalCaption = caption;
      _captionEdition = _activeSource?.edition ?? '';
      _captionProvider = _activeSource?.providerId ?? '';
      _captionTimelineVerified = _activeSource?.timelineVerified == true;
      _subtitlesOff = false;
      _subtitleDelay = 0;
      await _applyCaption(player, caption);
      _revealControls();
      _subtitleNotice('تم تفعيل ${caption.label}');
    } catch (_) {
      _subtitleNotice('تعذر تحميل الترجمة. اختر ملف SRT أو VTT أو ASS صالحًا.');
    } finally {
      if (mounted) setState(() => _subtitleBusy = false);
    }
  }

  Future<void> _searchCaptions(mk.Player player) async {
    if (_subtitleBusy) return;
    final parent = widget.api.cachedMetadata(widget.item.ref);
    var imdbId = widget.item.imdbId.isNotEmpty
        ? widget.item.imdbId
        : parent?.imdbId ?? '';
    var verified =
        widget.item.workIdentityVerified ||
        parent?.workIdentityVerified == true;
    final isSeries =
        widget.episodeNumber != null ||
        widget.item.type == 'series' ||
        widget.item.type == 'episode';
    var season = widget.item.season ?? parent?.season;
    var episode = widget.episodeNumber ?? widget.item.episode;
    if (!verified || (isSeries && (season == null || episode == null))) {
      final input = TextEditingController(text: imdbId);
      final seasonInput = TextEditingController(text: season?.toString() ?? '');
      final episodeInput = TextEditingController(
        text: episode?.toString() ?? '',
      );
      final selection =
          await showDialog<({String id, int? season, int? episode})>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('تحديد العمل للترجمة'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'أدخل معرّف IMDb للعمل الصحيح. للمسلسل، تأكد من أرقام الموسم والحلقة في النسخة الأصلية.',
                    ),
                    TextField(
                      controller: input,
                      decoration: const InputDecoration(
                        labelText: 'IMDb (tt...)',
                      ),
                    ),
                    if (isSeries)
                      TextField(
                        controller: seasonInput,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'الموسم الأصلي',
                        ),
                      ),
                    if (isSeries)
                      TextField(
                        controller: episodeInput,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'الحلقة الأصلية',
                        ),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('إلغاء'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, (
                    id: input.text.trim(),
                    season: int.tryParse(seasonInput.text),
                    episode: int.tryParse(episodeInput.text),
                  )),
                  child: const Text('تأكيد وبحث'),
                ),
              ],
            ),
          );
      input.dispose();
      seasonInput.dispose();
      episodeInput.dispose();
      if (!mounted || selection == null) return;
      imdbId = selection.id;
      season = selection.season;
      episode = selection.episode;
      verified = true;
    }
    final generation = ++_subtitleGeneration;
    setState(() => _subtitleBusy = true);
    try {
      final results = await _subtitles.searchStremio(
        imdbId: imdbId,
        workIdentityVerified: verified,
        mediaType: isSeries ? 'series' : 'movie',
        season: isSeries ? season : null,
        episode: isSeries ? episode : null,
      );
      if (!mounted ||
          generation != _subtitleGeneration ||
          player != _controller?.extendedPlayer) {
        return;
      }
      if (results.isEmpty) {
        _subtitleNotice(
          'لا توجد ترجمة عربية لهذا العمل. يمكنك اختيار ملف محلي.',
        );
        return;
      }
      final selected = await showNajdOptions<SubtitleDescriptor>(
        context,
        title: 'الترجمات العربية',
        icon: Icons.subtitles_outlined,
        options: [
          for (final track in results)
            NajdOption(track, track.label, icon: Icons.subtitles_outlined),
        ],
      );

      if (!mounted ||
          selected == null ||
          player != _controller?.extendedPlayer) {
        return;
      }
      setState(() => _subtitleBusy = false);
      await _chooseCaption(player, selected);
    } catch (_) {
      _subtitleNotice(
        'تعذر البحث عن الترجمة. تحقق من هوية العمل أو اختر ملفًا محليًا.',
      );
    } finally {
      if (mounted) setState(() => _subtitleBusy = false);
    }
  }

  Future<bool> _setCaptionDelay(mk.Player player, double seconds) async {
    try {
      if (kIsWeb) {
        final caption = _externalCaption;
        if (caption == null) {
          _subtitleNotice('اختر ترجمة خارجية لضبط توقيتها في الويب.');
          return false;
        }
        await player.setSubtitleTrack(
          mk.SubtitleTrack.data(
            shiftVtt(caption.text, seconds),
            title: caption.label,
            language: caption.language,
          ),
        );
      } else if (!await applyNativeSubtitleDelay(player, seconds)) {
        _subtitleNotice('ضبط التوقيت متاح مع المحرك الأصلي.');
        return false;
      }
      if (mounted) setState(() => _subtitleDelay = seconds);
      return true;
    } catch (_) {
      _subtitleNotice('تعذر ضبط توقيت الترجمة.');
      return false;
    }
  }

  Future<void> _captionTiming(mk.Player player) async {
    _revealControls();
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => AlertDialog(
          title: const Text('توقيت الترجمة'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${_subtitleDelay >= 0 ? '+' : ''}${_subtitleDelay.toStringAsFixed(1)}s',
              ),
              Wrap(
                spacing: 8,
                children: [
                  for (final delta in [-0.5, 0.5])
                    FilledButton(
                      onPressed: () async {
                        await _setCaptionDelay(player, _subtitleDelay + delta);
                        if (context.mounted) refresh(() {});
                      },
                      child: Text('${delta > 0 ? '+' : ''}${delta}s'),
                    ),
                  TextButton(
                    onPressed: () async {
                      await _setCaptionDelay(player, 0);
                      if (context.mounted) refresh(() {});
                    },
                    child: const Text('إعادة الضبط'),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('تم'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _captionControls(mk.Player player, {bool overlay = true}) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      NajdChoiceButton<Object>(
        overlay: overlay,
        label: _subtitleBusy ? 'تحميل الترجمة…' : 'الترجمة',
        icon: Icons.subtitles_outlined,
        options: _subtitleBusy
            ? const []
            : [
                for (final track
                    in _activeSource?.attachedSubtitles ??
                        const <SubtitleDescriptor>[])
                  NajdOption<Object>(
                    track,
                    '${track.label} • مرفقة',
                    icon: Icons.subtitles_outlined,
                  ),
                const NajdOption<Object>(
                  'local',
                  'اختيار ملف ترجمة محلي',
                  icon: Icons.upload_file_outlined,
                ),
                const NajdOption<Object>(
                  'search',
                  'البحث عن ترجمة عربية',
                  icon: Icons.search,
                ),
                for (final track in player.state.tracks.subtitle)
                  NajdOption<Object>(
                    track,
                    track.id == 'auto'
                        ? 'الترجمة المدمجة تلقائيًا'
                        : track.id == 'no'
                        ? 'إيقاف الترجمة'
                        : track.title ?? track.language ?? track.id,
                    selected: _subtitlesOff && track.id == 'no',
                    icon: Icons.subtitles_outlined,
                  ),
              ],
        onOpened: () => _controlsTimer?.cancel(),
        onClosed: _revealControls,
        onSelected: (selection) async {
          if (selection is SubtitleDescriptor) {
            await _chooseCaption(player, selection);
          } else if (selection is mk.SubtitleTrack) {
            ++_subtitleGeneration;
            _externalCaption = null;
            _subtitlesOff = selection.id == 'no';
            await player.setSubtitleTrack(selection);
          } else if (selection == 'local') {
            await _chooseCaption(player, null);
          } else if (selection == 'search') {
            await _searchCaptions(player);
          }
        },
      ),
      IconButton(
        tooltip: 'توقيت الترجمة',
        icon: const Icon(Icons.timer_outlined),
        onPressed: () => _captionTiming(player),
      ),
    ],
  );

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
      final uri = widget.api.mediaUri(
        _currentMediaPath,
        download: true,
        playbackMode: _resolvedPlaybackMode == 'edge_local_proxy'
            ? 'edge_direct'
            : _resolvedPlaybackMode,
        expiresAt: _expiresAt,
      );
      await _downloadService!.download(
        uri,
        headers: _currentHeaders,
        fallbackName: '${widget.title}.mp4',
        resumeKey: '${widget.item.ref}:${widget.episodeId}',
        cancellationToken: token,
        onProgress: (p) {
          if (mounted) setState(() => _downloadProgress = p);
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('اكتمل تنزيل MP4. الملف متاح في مكتبتك.'),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              token.isCancelled
                  ? 'تم إلغاء التنزيل'
                  : 'تعذر تنزيل هذا المصدر. أعد استخراج الرابط ثم حاول مجددًا.',
            ),
          ),
        );
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

  Widget _trackControls(UniversalPlayer controller) => Wrap(
    alignment: WrapAlignment.center,
    crossAxisAlignment: WrapCrossAlignment.center,
    spacing: 8,
    children: [
      if (_queue.isNotEmpty ||
          widget.episodeNumber != null ||
          widget.item.type == 'series')
        TextButton.icon(
          key: const Key('player-episodes'),
          style: TextButton.styleFrom(
            foregroundColor: Colors.white,
            minimumSize: Size(48, isTvTarget ? 64 : 48),
          ),
          onPressed: _queue.isNotEmpty ? _episodeMenu : _providerCatalogue,
          icon: const Icon(Icons.video_library_outlined, size: 20),
          label: const Text('الحلقات', style: TextStyle(fontSize: 12)),
        ),
      TextButton.icon(
        key: const Key('player-audio-subtitles'),
        style: TextButton.styleFrom(
          foregroundColor: Colors.white,
          minimumSize: Size(48, isTvTarget ? 64 : 48),
        ),
        onPressed: () => _audioMenu(controller),
        icon: const Icon(Icons.subtitles_outlined, size: 20),
        label: const Text('الصوت والترجمة', style: TextStyle(fontSize: 12)),
      ),
      IconButton(
        key: const Key('player-more'),
        tooltip: 'المزيد',
        style: IconButton.styleFrom(
          minimumSize: Size.square(isTvTarget ? 64 : 48),
        ),
        onPressed: () => _moreMenu(controller),
        icon: const Icon(Icons.more_horiz, color: Colors.white),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final active = controller?.value.isInitialized == true ? controller : null;
    final insets = MediaQuery.viewPaddingOf(context);
    return Theme(
      data: Theme.of(context).copyWith(
        iconTheme: const IconThemeData(color: Colors.white),
        iconButtonTheme: IconButtonThemeData(
          style: IconButton.styleFrom(foregroundColor: Colors.white),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: const BorderSide(color: Colors.white30),
          ),
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: null,
        body: Listener(
          onPointerDown: (event) {
            if (!_boosting) _holdPointer = event.pointer;
          },
          onPointerUp: (event) {
            if (event.pointer == _holdPointer) unawaited(_endBoost());
          },
          onPointerCancel: (event) {
            if (event.pointer == _holdPointer) unawaited(_endBoost());
          },
          child: Focus(
            autofocus: isTvTarget,
            onKeyEvent: (_, event) {
              if (event.logicalKey == LogicalKeyboardKey.mediaFastForward) {
                if (event is KeyRepeatEvent) unawaited(_startBoost());
                if (event is KeyUpEvent) unawaited(_endBoost());
                return KeyEventResult.handled;
              }
              if (isTvTarget && event is KeyDownEvent) _revealControls();
              return KeyEventResult.ignored;
            },
            child: SizedBox.expand(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (active != null)
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onLongPressStart: (_) => unawaited(_startBoost()),
                      onLongPressEnd: (_) => unawaited(_endBoost()),
                      onLongPressCancel: () => unawaited(_endBoost()),
                      onTap: () => _controlsVisible
                          ? setState(() => _controlsVisible = false)
                          : _revealControls(),
                      onDoubleTapDown: (d) => _gestureRight =
                          d.localPosition.dx >
                          MediaQuery.sizeOf(context).width / 2,
                      onDoubleTap: _doubleTapSeek,
                      onVerticalDragStart: isTvTarget
                          ? null
                          : (d) => _gestureRight =
                                d.localPosition.dx >
                                MediaQuery.sizeOf(context).width / 2,
                      onVerticalDragUpdate: isTvTarget
                          ? null
                          : (d) {
                              final change =
                                  -(d.primaryDelta ?? 0) /
                                  MediaQuery.sizeOf(context).height;
                              setState(() {
                                if (_gestureRight) {
                                  _volume = (_volume + change).clamp(0, 1);
                                } else {
                                  _brightness = (_brightness + change).clamp(
                                    .15,
                                    1,
                                  );
                                }
                              });
                              if (_gestureRight) {
                                unawaited(active.setVolume(_volume));
                              } else {
                                unawaited(_setBrightness());
                              }
                              _revealControls();
                            },
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          ValueListenableBuilder<VideoPlayerValue>(
                            valueListenable: active,
                            child: active.video(),
                            builder: (_, value, video) => ClipRect(
                              child: Transform.scale(
                                scale: _videoScale,
                                child: FullscreenVideoSurface(
                                  videoSize: value.size,
                                  fit: _videoFit,
                                  child: video!,
                                ),
                              ),
                            ),
                          ),
                          if (!_nativeBrightness && _brightness < 1)
                            IgnorePointer(
                              child: ColoredBox(
                                color: Colors.black.withValues(
                                  alpha: 1 - _brightness,
                                ),
                              ),
                            ),
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
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    _seekFeedback,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  if (active == null)
                    Center(
                      child: SafeArea(
                        child: _failed
                            ? Theme(
                                data: NajdThemes.dark,
                                child: NajdEmptyState(
                                  kind: NajdEmptyKind.source,
                                  message: _status,
                                  onRetry: () {
                                    setState(() => _failed = false);
                                    _initialize(forceRefresh: true);
                                  },
                                  onExplore:
                                      !widget.isLive &&
                                          widget.localFileUri == null
                                      ? _providerCatalogue
                                      : () => Navigator.of(context).maybePop(),
                                  exploreLabel:
                                      !widget.isLive &&
                                          widget.localFileUri == null
                                      ? 'اختيار مزود أو حلقة'
                                      : 'العودة',
                                ),
                              )
                            : Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  _failed
                                      ? const Icon(
                                          Icons.error_outline,
                                          size: 64,
                                        )
                                      : const CircularProgressIndicator(),
                                  const SizedBox(height: 16),
                                  Padding(
                                    padding: const EdgeInsets.all(20),
                                    child: Text(
                                      _status,
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                  if (_failed)
                                    FilledButton(
                                      onPressed: () {
                                        setState(() => _failed = false);
                                        _initialize(forceRefresh: true);
                                      },
                                      child: const Text('إعادة المحاولة'),
                                    ),
                                  if (_failed && _sources.length > 1)
                                    _sourceMenu(),
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.of(context).maybePop(),
                                    child: const Text('رجوع'),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  if (_boosting)
                    Positioned(
                      top: insets.top + 18,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Material(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(16),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 20,
                              vertical: 10,
                            ),
                            child: Text(
                              '${NajdPreferences.instance.holdSpeed}×',
                              key: const Key('player-hold-speed-badge'),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (active != null && _controlsVisible && !_pipActive) ...[
                    Positioned.fill(
                      child: Center(
                        child: ValueListenableBuilder<VideoPlayerValue>(
                          valueListenable: active,
                          builder: (context, value, _) => PlayerControls(
                            isPlaying: value.isPlaying,
                            showSpeed: false,
                            isTv: isTvTarget,
                            playbackSpeed: _playbackSpeed,
                            onRewind: () =>
                                _seekBy(const Duration(seconds: -10)),
                            onTogglePlay: () => _togglePlay(active),
                            onForward: () =>
                                _seekBy(const Duration(seconds: 10)),
                            onPlaybackSpeedChanged: _setPlaybackSpeed,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: insets.top + 4,
                      right: insets.right + 4,
                      child: IconButton(
                        tooltip: 'رجوع',
                        icon: const Icon(Icons.arrow_back),
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                    ),
                    Positioned(
                      top: insets.top + 10,
                      left: insets.left + 72,
                      right: insets.right + 72,
                      child: IgnorePointer(
                        child: Text(
                          widget.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                            shadows: [
                              Shadow(color: Colors.black, blurRadius: 4),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: insets.left,
                      right: insets.right,
                      bottom: insets.bottom,
                      child: _modernControls(active),
                    ),
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
