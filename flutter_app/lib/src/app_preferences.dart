import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device preferences do not change library owners, source identity or progress.
class NajdPreferences extends ChangeNotifier {
  static final instance = NajdPreferences();
  static const holdSpeeds = <double>[1.5, 2, 2.5, 3, 4];
  bool holdToBoost = true;
  double holdSpeed = 2;
  bool providerBeta = false;
  String metadataLanguage = 'auto';
  int episodeGroupSize = 24;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final groupSize = prefs.getInt('najd.episodes.group-size.v1') ?? 24;
    episodeGroupSize = groupSize >= 1 && groupSize <= 500 ? groupSize : 24;
    holdToBoost = prefs.getBool('najd.player.hold.v1') ?? true;
    final speed = prefs.getDouble('najd.player.hold-speed.v1') ?? 2;
    holdSpeed = holdSpeeds.contains(speed) ? speed : 2;
    providerBeta = prefs.getBool('najd.provider-beta.v1') ?? false;
    final language = prefs.getString('najd.metadata.language.v1') ?? 'auto';
    metadataLanguage = ['auto', 'ar', 'en'].contains(language)
        ? language
        : 'auto';
    notifyListeners();
  }

  Future<void> setEpisodeGroupSize(int value) async {
    if (value < 1 || value > 500) return;
    episodeGroupSize = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setInt(
      'najd.episodes.group-size.v1',
      value,
    );
  }

  Future<void> setHold(bool value) async {
    holdToBoost = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setBool(
      'najd.player.hold.v1',
      value,
    );
  }

  Future<void> setHoldSpeed(double value) async {
    if (!holdSpeeds.contains(value)) return;
    holdSpeed = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setDouble(
      'najd.player.hold-speed.v1',
      value,
    );
  }

  Future<void> setProviderBeta(bool value) async {
    providerBeta = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setBool(
      'najd.provider-beta.v1',
      value,
    );
  }

  Future<void> setMetadataLanguage(String value) async {
    if (!['auto', 'ar', 'en'].contains(value)) return;
    metadataLanguage = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setString(
      'najd.metadata.language.v1',
      value,
    );
  }
}
