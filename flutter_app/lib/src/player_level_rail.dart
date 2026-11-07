import 'package:flutter/material.dart';

class PlayerLevelRail extends StatelessWidget {
  const PlayerLevelRail({
    super.key,
    required this.value,
    required this.label,
    required this.icon,
    required this.onChanged,
  });
  final double value;
  final String label;
  final IconData icon;
  final ValueChanged<double> onChanged;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.black54,
    borderRadius: BorderRadius.circular(18),
    child: SizedBox(
      width: 52,
      height: 200,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Icon(icon, color: Colors.white, size: 20),
          Expanded(
            child: RotatedBox(
              quarterTurns: 3,
              child: Slider(
                value: value.clamp(0, 1),
                onChanged: onChanged,
                semanticFormatterCallback: (v) =>
                    '$label ${(v * 100).round()}٪',
              ),
            ),
          ),
          Text(
            '${(value * 100).round()}٪',
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}
