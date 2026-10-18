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

/// All catalog/search grids share breakpoints based on their parent constraints.
class AdaptiveCatalogGrid extends StatelessWidget {
  const AdaptiveCatalogGrid({super.key, this.controller, this.padding,
    required this.itemCount, required this.itemBuilder, this.isTv = false});
  final ScrollController? controller;
  final EdgeInsetsGeometry? padding;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final bool isTv;

  static int columnsFor(double width) => width < 600 ? 2 : width < 900 ? 4
      : width < 1200 ? 6 : width < 1600 ? 8 : 10;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, bounds) {
    final columns = columnsFor(bounds.maxWidth);
    final gap = isTv ? 18.0 : 10.0;
    final insets = (padding ?? EdgeInsets.zero).resolve(Directionality.of(context));
    final cardWidth = (bounds.maxWidth-insets.horizontal-gap*(columns-1))/columns;
    final scale = MediaQuery.textScalerOf(context).scale(14)/14;
    return GridView.builder(
      controller: controller, padding: padding,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisExtent: cardWidth*1.5 + 140*scale,
        crossAxisSpacing: gap, mainAxisSpacing: gap,
      ),
      itemCount: itemCount, itemBuilder: itemBuilder,
    );
  });
}
