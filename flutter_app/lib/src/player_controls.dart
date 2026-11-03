import 'package:flutter/material.dart';

import 'playback_policy.dart';
import 'najd_panels.dart';

class PlayerControls extends StatefulWidget {
  const PlayerControls({
    super.key,
    required this.isPlaying,
    required this.isTv,
    required this.playbackSpeed,
    required this.onRewind,
    required this.onTogglePlay,
    required this.onForward,
    required this.onPlaybackSpeedChanged,
    this.showSpeed = true,
  });

  final bool showSpeed;
  final bool isPlaying;
  final bool isTv;
  final double playbackSpeed;
  final VoidCallback onRewind;
  final VoidCallback onTogglePlay;
  final VoidCallback onForward;
  final ValueChanged<double> onPlaybackSpeedChanged;

  @override
  State<PlayerControls> createState() => _PlayerControlsState();
}

class _PlayerControlsState extends State<PlayerControls> {
  final FocusNode _rewindFocus = FocusNode(debugLabel: 'player-rewind');
  final FocusNode _playFocus = FocusNode(debugLabel: 'player-play');
  final FocusNode _forwardFocus = FocusNode(debugLabel: 'player-forward');
  final FocusNode _speedFocus = FocusNode(debugLabel: 'player-speed');

  @override
  void dispose() {
    _rewindFocus.dispose();
    _playFocus.dispose();
    _forwardFocus.dispose();
    _speedFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: FocusTraversalGroup(
        policy: WidgetOrderTraversalPolicy(),
        child: Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 8,
          children: [
            IconButton.filledTonal(
              style: IconButton.styleFrom(
                backgroundColor: Colors.black54,
                foregroundColor: Colors.white,
                minimumSize: Size(widget.isTv ? 64 : 56, widget.isTv ? 64 : 56),
                side: const BorderSide(color: Colors.white24),
              ),
              key: const Key('player-rewind'),
              focusNode: _rewindFocus,
              tooltip: 'رجوع 10 ثوانٍ',
              onPressed: widget.onRewind,
              icon: const Icon(Icons.replay_10),
            ),
            IconButton.filled(
              key: const Key('player-play-toggle'),
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xFF6B46C1),
                foregroundColor: Colors.white,
                minimumSize: const Size(64, 64),
              ),
              focusNode: _playFocus,
              autofocus: widget.isTv,
              tooltip: widget.isPlaying ? 'إيقاف مؤقت' : 'تشغيل',
              onPressed: widget.onTogglePlay,
              icon: Icon(widget.isPlaying ? Icons.pause : Icons.play_arrow),
            ),
            IconButton.filledTonal(
              style: IconButton.styleFrom(
                backgroundColor: Colors.black54,
                foregroundColor: Colors.white,
                minimumSize: Size(widget.isTv ? 64 : 56, widget.isTv ? 64 : 56),
                side: const BorderSide(color: Colors.white24),
              ),
              key: const Key('player-forward'),
              focusNode: _forwardFocus,
              tooltip: 'تقديم 10 ثوانٍ',
              onPressed: widget.onForward,
              icon: const Icon(Icons.forward_10),
            ),
            if (widget.showSpeed)
              NajdChoiceButton<double>(
                key: const Key('player-speed'),
                focusNode: _speedFocus,
                label: playbackSpeedLabel(widget.playbackSpeed),
                icon: Icons.speed,
                options: [
                  for (final speed in supportedPlaybackSpeeds)
                    NajdOption(
                      speed,
                      playbackSpeedLabel(speed),
                      key: Key('player-speed-${playbackSpeedLabel(speed)}'),
                      selected: speed == widget.playbackSpeed,
                      icon: Icons.speed,
                    ),
                ],
                onSelected: (speed) async =>
                    widget.onPlaybackSpeedChanged(speed),
              ),
          ],
        ),
      ),
    );
  }
}
