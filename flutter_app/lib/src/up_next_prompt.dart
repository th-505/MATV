import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Playback-driven eligibility; pausing/buffering pauses the countdown too.
class UpNextPrompt extends StatefulWidget {
  const UpNextPrompt({super.key, required this.player, required this.onNext});
  final ValueListenable<VideoPlayerValue> player;
  final VoidCallback onNext;
  @override
  State<UpNextPrompt> createState() => _UpNextPromptState();
}

class _UpNextPromptState extends State<UpNextPrompt> {
  Timer? _timer;
  int _seconds = 10;
  bool _visible = false, _cancelled = false, _sent = false;
  @override
  void initState() {
    super.initState();
    widget.player.addListener(_update);
    _update();
  }

  @override
  void didUpdateWidget(covariant UpNextPrompt oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.player != widget.player) {
      oldWidget.player.removeListener(_update);
      widget.player.addListener(_update);
      _timer?.cancel();
      _seconds = 10;
      _visible = false;
      // A source/quality switch does not revoke cancellation for this episode.
      _update();
    }
  }

  @override
  void dispose() {
    widget.player.removeListener(_update);
    _timer?.cancel();
    super.dispose();
  }

  void _update() {
    final v = widget.player.value;
    final eligible =
        !_cancelled &&
        !_sent &&
        !v.hasError &&
        v.duration > Duration.zero &&
        v.position > Duration.zero &&
        v.duration - v.position <= const Duration(seconds: 30);
    if (!eligible) {
      _timer?.cancel();
      _timer = null;
      if (_visible && mounted) setState(() => _visible = false);
      _seconds = 10;
      return;
    }
    if (!_visible && mounted) setState(() => _visible = true);
    _timer ??= Timer.periodic(const Duration(seconds: 1), (_) {
      final value = widget.player.value;
      if (!mounted || _cancelled || _sent) return;
      if (value.isBuffering || (!value.isPlaying && !value.isCompleted)) return;
      if (_seconds <= 1) {
        _go();
      } else {
        setState(() => _seconds--);
      }
    });
  }

  void _go() {
    if (_sent || _cancelled) return;
    _sent = true;
    _timer?.cancel();
    setState(() => _visible = false);
    widget.onNext();
  }

  @override
  Widget build(BuildContext context) => !_visible
      ? const SizedBox.shrink()
      : Material(
          key: const Key('up-next-prompt'),
          color: Colors.black.withAlpha(220),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: Colors.white38),
          ),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                TextButton(
                  key: const Key('up-next-play'),
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: _go,
                  child: Text('الحلقة التالية • $_seconds'),
                ),
                TextButton(
                  key: const Key('up-next-cancel'),
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: () {
                    _timer?.cancel();
                    setState(() {
                      _cancelled = true;
                      _visible = false;
                    });
                  },
                  child: const Text('إلغاء'),
                ),
              ],
            ),
          ),
        );
}
