import 'package:flutter/material.dart';

/// Adds a visible border without inserting a second traversal stop.
class FocusHighlight extends StatefulWidget {
  const FocusHighlight({super.key, required this.child});
  final Widget child;
  @override
  State<FocusHighlight> createState() => _FocusHighlightState();
}

class _FocusHighlightState extends State<FocusHighlight> {
  bool _focused = false;
  @override
  Widget build(BuildContext context) => Focus(
      canRequestFocus: false,
      onFocusChange: (value) => setState(() => _focused = value),
      child: AnimatedContainer(
          key: const Key('focus-highlight-border'),
          duration: const Duration(milliseconds: 120),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                  width: 3,
                  color:
                      _focused ? const Color(0xFF8480FF) : Colors.transparent),
              boxShadow: _focused
                  ? [
                      BoxShadow(
                        color: const Color(0xFF8480FF).withAlpha(140),
                        blurRadius: 10,
                        spreadRadius: 1,
                      )
                    ]
                  : null),
          child: widget.child));
}
