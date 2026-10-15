import 'package:media_kit/media_kit.dart' as mk;

Future<bool> applyNativeSubtitleDelay(mk.Player player, double seconds) async {
  if (!seconds.isFinite || seconds.abs() > 120) return false;
  final platform = player.platform;
  if (platform is! mk.NativePlayer) return false;
  await platform.setProperty('sub-delay', seconds.toString());
  return true;
}
