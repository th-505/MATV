import 'package:flutter/material.dart';

class ViewportMetrics {
  const ViewportMetrics(
      {required this.size, required this.safeInsets, required this.textScaler});
  final Size size;
  final EdgeInsets safeInsets;
  final TextScaler textScaler;
  bool get usesSideNavigation => size.width >= 900;
  int columns(
          {double minimumCardWidth = 160,
          double spacing = 12,
          double horizontalPadding = 24}) =>
      ((size.width - horizontalPadding + spacing) /
              (minimumCardWidth + spacing))
          .floor()
          .clamp(1, 12);
}

/// Uses the actual parent viewport, including camera insets and text scaling.
class AdaptiveViewport extends StatelessWidget {
  const AdaptiveViewport({super.key, required this.builder});
  final Widget Function(BuildContext, ViewportMetrics) builder;
  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, bounds) {
        final media = MediaQuery.of(context);
        return builder(
            context,
            ViewportMetrics(
                size: Size(
                    bounds.hasBoundedWidth ? bounds.maxWidth : media.size.width,
                    bounds.hasBoundedHeight
                        ? bounds.maxHeight
                        : media.size.height),
                safeInsets: media.viewPadding,
                textScaler: media.textScaler));
      });
}
