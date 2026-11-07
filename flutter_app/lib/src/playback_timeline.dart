import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// The engine's native controls are disabled. This independent control owns the
/// drag preview; engine clock/buffering never steals the thumb from the user.
class PlaybackTimeline extends StatefulWidget {
  const PlaybackTimeline({
    super.key,
    required this.player,
    required this.seek,
    required this.onStart,
    required this.onEnd,
    required this.onError,
  });
  final ValueListenable<VideoPlayerValue> player;
  final Future<void> Function(Duration) seek;
  final VoidCallback onStart, onEnd, onError;
  @override
  State<PlaybackTimeline> createState() => _PlaybackTimelineState();
}

class _PlaybackTimelineState extends State<PlaybackTimeline> {
  double? _preview;
  bool _dragging = false;
  int _generation = 0;
  Timer? _deadline;
  @override
  void initState() {
    super.initState();
    widget.player.addListener(_clock);
  }

  @override
  void didUpdateWidget(covariant PlaybackTimeline oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.player != widget.player) {
      oldWidget.player.removeListener(_clock);
      widget.player.addListener(_clock);
      _deadline?.cancel();
      _generation++;
      _preview = null;
      _dragging = false;
    }
  }

  @override
  void dispose() {
    widget.player.removeListener(_clock);
    _deadline?.cancel();
    _generation++;
    super.dispose();
  }

  void _clock() {
    if (!_dragging &&
        _preview != null &&
        (widget.player.value.position.inMilliseconds - _preview!).abs() <
            1500) {
      _deadline?.cancel();
      if (mounted) setState(() => _preview = null);
    }
  }

  Future<void> _seek(double value) async {
    final generation = ++_generation;
    _dragging = false;
    setState(() => _preview = value);
    widget.onEnd();
    _deadline?.cancel();
    _deadline = Timer(const Duration(seconds: 8), () {
      if (mounted && generation == _generation && !_dragging) {
        setState(() => _preview = null);
      }
    });
    try {
      await widget
          .seek(Duration(milliseconds: value.round()))
          .timeout(const Duration(seconds: 8));
      _clock();
    } catch (_) {
      if (mounted && generation == _generation && !_dragging) {
        setState(() => _preview = null);
        widget.onError();
      }
    }
  }

  String _time(Duration time) {
    final seconds = time.inSeconds.clamp(0, 864000);
    if (seconds < 3600) {
      return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
    }
    return '${seconds ~/ 3600}:${(seconds % 3600 ~/ 60).toString().padLeft(2, '0')}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(
    BuildContext context,
  ) => ValueListenableBuilder<VideoPlayerValue>(
    valueListenable: widget.player,
    builder: (context, v, _) {
      final max = v.duration.inMilliseconds.toDouble();
      final position = (_preview ?? v.position.inMilliseconds.toDouble())
          .clamp(0, max > 0 ? max : 1)
          .toDouble();
      return Directionality(
        textDirection: TextDirection.ltr,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Slider(
              key: const Key('player-seek-slider'),
              value: position,
              max: max > 0 ? max : 1,
              onChangeStart: max > 0
                  ? (value) {
                      _generation++;
                      _deadline?.cancel();
                      _dragging = true;
                      setState(() => _preview = value);
                      widget.onStart();
                    }
                  : null,
              onChanged: max > 0
                  ? (value) => setState(() => _preview = value)
                  : null,
              onChangeEnd: max > 0 ? _seek : null,
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _time(Duration(milliseconds: position.round())),
                  key: const Key('player-elapsed-time'),
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
                Text(
                  '-${_time(v.duration - Duration(milliseconds: position.round()))}',
                  key: const Key('player-remaining-time'),
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}
