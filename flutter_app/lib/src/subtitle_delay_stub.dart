import 'package:media_kit/media_kit.dart' as mk;

// HTML5 cue timing is adjusted by the VTT pipeline, not a libmpv property.
Future<bool> applyNativeSubtitleDelay(mk.Player player, double seconds) async =>
    false;
