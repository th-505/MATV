import 'package:flutter/material.dart';

/// Page playback is bounded; fullscreen playback uses the available viewport.
/// Video, timeline and controls always share the same frame constraints.
class PlayerViewportFrame extends StatelessWidget {
  const PlayerViewportFrame({super.key, required this.child,
    required this.videoSize, required this.fullscreen, this.maximumWidth = 1440});
  final Widget child;
  final Size videoSize;
  final bool fullscreen;
  final double maximumWidth;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, bounds) {
    if (fullscreen) return SizedBox.expand(key: const Key('player-viewport-frame'), child: child);
    final intrinsic = videoSize.width > 0 && videoSize.height > 0 ? videoSize : const Size(16, 9);
    final available = Size(bounds.maxWidth.clamp(0, maximumWidth).toDouble(), bounds.maxHeight);
    final fitted = applyBoxFit(BoxFit.contain, intrinsic, available).destination;
    return Center(child: SizedBox(key: const Key('player-viewport-frame'),
      width: fitted.width, height: fitted.height,
      child: ClipRect(child: MediaQuery(
        data: MediaQuery.of(context).copyWith(size:fitted), child:child))));
  });
}
