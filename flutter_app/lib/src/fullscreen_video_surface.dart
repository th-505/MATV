import 'package:flutter/material.dart';

/// The viewport fills its parent's window. Only the image is letterboxed.
class FullscreenVideoSurface extends StatelessWidget {
  const FullscreenVideoSurface(
      {super.key,
      required this.videoSize,
      required this.child,
      this.fit = BoxFit.contain});
  final Size videoSize;
  final Widget child;
  final BoxFit fit;
  @override
  Widget build(BuildContext context) {
    final size = videoSize.width > 0 && videoSize.height > 0
        ? videoSize
        : const Size(1920, 1080);
    return SizedBox.expand(
        key: const Key('fullscreen-video-viewport'),
        child: ColoredBox(
            color: Colors.black,
            child: FittedBox(
                fit: fit,
                alignment: Alignment.center,
                clipBehavior: Clip.hardEdge,
                child: SizedBox(
                    width: size.width, height: size.height, child: child))));
  }
}
